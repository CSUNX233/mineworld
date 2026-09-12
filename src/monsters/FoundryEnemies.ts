import { expandingWaveHitTime } from './FoundryBossGeometry';
import * as THREE from 'three';
import type { FloorData, Room } from '../types';
import type { Monster } from './Monster';
import type { EncounterMechanicsHost, MechanicPlayer, SerializedMechanicState } from './EncounterMechanics';
import { worldRayDistance } from '../world/SpatialQueries';
import { roomContainsPoint } from '../world/RoomGeometry';
import { directionToPlayer } from '../world/Navigation';
import { monsterAttack } from '../data/recipes';
import { monsterAggression } from './EnemyIntent';
import { canSealEncounterRoom, encounterBarrierBlocksCylinder } from '../world/EncounterBarriers';
import { isWalkable } from '../world/FloorGenerator';
import { hasReachableSanctumSafety, segmentDistanceSquared } from './SanctumGeometry';
import { createTetherVisual, updateTetherVisual, disposeMechanicObject } from './MechanicVisual';

const IDS = new Set(['ram_beast','chain_smith','prism_sentry']);
interface State {
  cooldown: number; phase: 'idle'|'warning'|'dash'|'wave'|'beam'; action: 'charge'|'beam'|'wave';
  remaining: number; dx: number; dz: number; x: number; z: number; distance: number;
  hit: boolean; nextWave: boolean; interrupted: boolean; recovery: number;
  visual: THREE.Object3D|null; targets: Monster[]; tethers: THREE.Line[];
  previousPlayer: {x:number;y:number;z:number}|null;
}

/** Full behaviors for the chapter's enemies; ordinary AI never fires hidden attacks in their windups. */
export class FoundryEnemies {
  private states = new Map<Monster,State>();
  handles(monster: Monster): boolean { return IDS.has(monster.def.id); }
  private state(monster: Monster): State {
    let s=this.states.get(monster);
    if(!s) {s={cooldown:2,phase:'idle',action:'charge',remaining:0,dx:0,dz:1,x:0,z:0,distance:0,
      hit:false,nextWave:false,interrupted:false,recovery:0,visual:null,targets:[],tethers:[],previousPlayer:null};this.states.set(monster,s);}
    return s;
  }
  serialize(monster: Monster): SerializedMechanicState {
    const s=this.state(monster);
    return {role:'controller',cooldown:Math.max(s.cooldown,s.remaining),interruptedCast:s.phase!=='idle'};
  }
  restore(monster: Monster,saved: SerializedMechanicState|undefined): void {
    if(saved?.role==='controller') {
      const state=this.state(monster);this.clearVisual(state);this.clearTethers(state);
      state.phase='idle';state.nextWave=false;state.remaining=0;state.recovery=0;state.previousPlayer=null;
      monster.group.userData.foundryAttack=false;
      state.cooldown=Math.max(2.5,Number.isFinite(saved.cooldown)?saved.cooldown:2.5);
    }
  }
  directHit(monster: Monster,damage: number): number {
    if(monster.def.id==='chain_smith') {
      const s=this.state(monster);s.interrupted=true;s.cooldown=3;
      this.clearTethers(s);
    }
    for(const [owner,s] of this.states) if(owner.def.id==='chain_smith'&&!owner.dead&&s.cooldown<=0
      &&s.targets.includes(monster)) return damage*.75;
    return damage;
  }
  private lineClear(floor: FloorData,a: {x:number;z:number},b: {x:number;z:number}): boolean {
    const direction=new THREE.Vector3(b.x-a.x,0,b.z-a.z),distance=direction.length();
    return distance<.01 || worldRayDistance(floor,new THREE.Vector3(a.x,1,a.z),direction.normalize(),distance)>=distance-.03;
  }
  update(dt:number,monsters:Monster[],player:MechanicPlayer,floor:FloorData,host:EncounterMechanicsHost):void {
    for(const [m,s] of this.states) if(m.dead||!monsters.includes(m)) {this.clearVisual(s,host);this.clearTethers(s);m.group.userData.foundryAttack=false;this.states.delete(m);}
    for(const m of monsters) {
      if(m.dead||!this.handles(m)) continue;
      const s=this.state(m);m.velocity.set(0,0,0);
      m.group.userData.foundryAttack=s.phase!=='idle';
      const room=floor.rooms.find(r=>r.id===m.roomId);if(!room) continue;
      if(s.phase==='idle'&&!this.bodyFits(m.position.x,m.position.z,floor,room,.45)) {
        // Edge cell centers can overlap a newly sealed doorway by .02 (radius
        // .45 + barrier half thickness .07 > center clearance .50). Rays from
        // inside that expanded plane report zero even when moving inward.
        const safe=this.recoveryPosition(m,floor,room);
        if(safe) {
          m.position.set(safe.x,m.position.y,safe.z);this.clearVisual(s,host);this.clearTethers(s);
          s.cooldown=Math.max(2.5,s.cooldown);s.nextWave=false;s.remaining=0;
          continue;
        }
      }
      if (m.slowMultiplier <= 0 || m.statuses.some(status=>status.type==='frozen'&&status.duration>0)) continue;
      s.cooldown=Math.max(0,s.cooldown-dt*monsterAggression(m));
      // A collision stun is a promised output window, independent of attack appetite.
      s.recovery=Math.max(0,s.recovery-dt);
      if(m.def.id==='chain_smith') {this.updateSmith(m,s,monsters,player,floor,room,host,dt);continue;}
      const p=player.position;
      if(s.phase==='idle') {
        const distance=Math.hypot(p.x-m.position.x,p.z-m.position.z);
        if(s.recovery>0) continue;
        const visible=this.lineClear(floor,m.position,p);
        if(s.cooldown>0) {if(!s.nextWave) this.chase(m,player,floor,room,dt,m.def.id==='ram_beast'?4.5:7,monsters);continue;}
        // Serialize high-pressure attacks within a room, leaving a readable response window.
        if(monsters.some(other=>other!==m&&!other.dead&&other.roomId===m.roomId&&other.group.userData.foundryAttack)) {
          this.chase(m,player,floor,room,dt,m.def.id==='ram_beast'?4.5:7,monsters);continue;
        }
        if(distance>m.def.detectRadius||distance>(m.def.id==='ram_beast'?9:13)||(!visible&&m.def.id!=='ram_beast')) {
          this.chase(m,player,floor,room,dt,m.def.id==='ram_beast'?4.5:7,monsters);
          continue;
        }
        if(distance<.01) continue;
        s.x=m.position.x;s.z=m.position.z;s.dx=(p.x-s.x)/distance;s.dz=(p.z-s.z)/distance;
        s.action=s.nextWave?'wave':m.def.id==='ram_beast'?'charge':'beam';
        s.distance=s.action==='beam'?Math.min(13,worldRayDistance(floor,new THREE.Vector3(s.x,1,s.z),new THREE.Vector3(s.dx,0,s.dz),13)):9;
        if(s.action==='charge'&&worldRayDistance(floor,new THREE.Vector3(s.x,1,s.z),new THREE.Vector3(s.dx,0,s.dz),9,.45)<1) {
          this.chase(m,player,floor,room,dt,4.5,monsters);continue;
        }
        if(!hasReachableSanctumSafety(floor,room,p,1.2,(x,z)=>s.action==='wave'
          ? Math.hypot(x-s.x,z-s.z)<=6&&((x-s.x)*s.dx+(z-s.z)*s.dz)>=Math.hypot(x-s.x,z-s.z)*.5
          : segmentDistanceSquared(x,z,s.x,s.z,s.x+s.dx*s.distance,s.z+s.dz*s.distance)<=(s.action==='charge'?1:.7)**2)) {
          s.cooldown=.5;this.chase(m,player,floor,room,dt,4.5,monsters);continue;
        }
        s.remaining=1.2;s.phase='warning';s.hit=false;s.previousPlayer={x:p.x,y:p.y??0,z:p.z};
        s.nextWave=false;
        m.group.userData.foundryAttack=true;
        s.visual=this.warning(s);host.addWorldObject(s.visual);m.faceToward(p.x,p.z);
        continue;
      }
      if(s.phase==='warning') {
        // Let the player lure the ram for the first part; the final .45s and
        // every damage phase preserve the displayed line without tracking.
        if(s.action==='charge'&&s.remaining>.45) {
          const aimDistance=Math.hypot(p.x-s.x,p.z-s.z);
          if(aimDistance>.01) {s.dx=(p.x-s.x)/aimDistance;s.dz=(p.z-s.z)/aimDistance;}
          if(s.visual) {s.visual.rotation.z=Math.atan2(s.dx,s.dz);s.visual.position.set(s.x+s.dx*s.distance/2,.08,s.z+s.dz*s.distance/2);}
          m.faceToward(s.x+s.dx,s.z+s.dz);
          // A delayed frame must not jump from a moving warning straight to
          // damage; retain the complete final locked interval after re-aiming.
          if(s.remaining-dt<.45) {s.remaining=.45;continue;}
        }
        s.remaining-=dt;
        if(s.remaining>0) continue;
        this.clearVisual(s,host);
        if(s.action==='beam') {
          const dx=p.x-s.x,dz=p.z-s.z,along=dx*s.dx+dz*s.dz,across=Math.abs(dx*s.dz-dz*s.dx);
          if(along>=0&&along<=s.distance&&across<=.7&&this.lineClear(floor,{x:s.x,z:s.z},p))
            host.damagePlayer(Math.round(monsterAttack(m.def.attack,floor.floor)*.9),'foundry_beam');
          s.phase='beam';s.remaining=.12;s.visual=this.warning(s);
          ((s.visual as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity=.95;host.addWorldObject(s.visual);
        } else if(s.action==='charge') {s.phase='dash';s.remaining=1;}
        else {s.phase='wave';s.distance=0;s.remaining=1.5;s.visual=this.waveMesh(s,0.1);host.addWorldObject(s.visual);}
        continue;
      }
      if(s.phase==='beam') {
        s.remaining-=dt;
        if(s.remaining<=0) {this.clearVisual(s,host);s.phase='idle';s.cooldown=1.8;}
        continue;
      }
      if(s.phase==='dash') {
        const travel=Math.min(9*dt,9*s.remaining);
        let collided=false;
        for(let d=0;d<travel;d+=.15) {
          const step=Math.min(.15,travel-d),nx=m.position.x+s.dx*(step+.45),nz=m.position.z+s.dz*(step+.45);
          if(!this.bodyFits(m.position.x+s.dx*step,m.position.z+s.dz*step,floor,room)||worldRayDistance(floor,new THREE.Vector3(m.position.x,1,m.position.z),new THREE.Vector3(s.dx,0,s.dz),step,.45)<step) {
            let broke=false;
            for(const offset of [-.35,0,.35]) broke=Boolean(host.breakPanel?.(nx+s.dz*offset,nz-s.dx*offset))||broke;
            s.phase='idle';s.cooldown=broke?2.5:2;s.recovery=broke?2.5:2;s.nextWave=true;collided=true;break;
          }
          m.position.x+=s.dx*step;m.position.z+=s.dz*step;
          if(!s.hit&&segmentDistanceSquared(p.x,p.z,m.position.x-s.dx*step,m.position.z-s.dz*step,m.position.x,m.position.z)<1) {
            s.hit=true;host.damagePlayer(Math.round(monsterAttack(m.def.attack,floor.floor)*1.15),'foundry_charge');
          }
        }
        s.remaining-=dt;
        if(!collided&&s.remaining<=0) {s.phase='idle';s.cooldown=1.2;s.recovery=1.2;}
      } else if(s.phase==='wave') {
        const oldRadius=s.distance;s.distance+=4*dt;s.remaining-=dt;
        if(s.visual) s.visual.scale.setScalar(Math.max(.01,s.distance));
        const prev=s.previousPlayer??{x:p.x,y:p.y??0,z:p.z};
        const t=expandingWaveHitTime(s.x,s.z,oldRadius,s.distance,prev.x,prev.z,p.x,p.z,.3);
        if(!s.hit&&t!==null) {
          const x=prev.x+(p.x-prev.x)*t,z=prev.z+(p.z-prev.z)*t,y=prev.y+((p.y??0)-prev.y)*t;
          const distance=Math.hypot(x-s.x,z-s.z);
          if(distance>0&&(x-s.x)*s.dx+(z-s.z)*s.dz>=distance*.5&&this.lineClear(floor,{x:s.x,z:s.z},{x,z})) {
            s.hit=true;if(y<=.4) host.damagePlayer(Math.round(monsterAttack(m.def.attack,floor.floor)*.6),'foundry_low_wave');
          }
        }
        s.previousPlayer={x:p.x,y:p.y??0,z:p.z};
        if(s.remaining<=0) {this.clearVisual(s,host);s.phase='idle';s.cooldown=2.5;}
      }
    }
  }
  private updateSmith(m:Monster,s:State,monsters:Monster[],player:MechanicPlayer,floor:FloorData,room:Room,host:EncounterMechanicsHost,dt:number):void {
    if(s.targets.some(target=>target.dead)) {s.cooldown=Math.max(s.cooldown,1.5);s.recovery=Math.max(s.recovery,1.5);this.clearTethers(s);}
    if(s.interrupted) {s.interrupted=false;this.clearTethers(s);}
    if(s.recovery>0) return;
    const allies=monsters.filter(other=>other!==m&&!other.dead&&other.roomId===m.roomId&&other.def.behavior!=='boss'&&other.def.id!=='chain_smith')
      .sort((a,b)=>Number(b.def.role==='guardian')-Number(a.def.role==='guardian')||a.position.distanceTo(m.position)-b.position.distanceTo(m.position));
    const playerDistance=Math.hypot(player.position.x-m.position.x,player.position.z-m.position.z);
    if(playerDistance<3) this.move(m,m.position.x-player.position.x,m.position.z-player.position.z,m.def.speed*m.speedMultiplier*m.slowMultiplier*dt,floor,room);
    else if(allies.length&&allies[0].position.distanceTo(m.position)>4.5) {
      const target=allies[0].position;
      const direction=this.lineClear(floor,m.position,target)?{x:target.x-m.position.x,z:target.z-m.position.z}
        :directionToPlayer(floor,m.position.x,m.position.z,target.x,target.z);
      if(direction) this.move(m,direction.x,direction.z,m.def.speed*m.speedMultiplier*m.slowMultiplier*dt,floor,room);
    }
    m.faceToward(player.position.x,player.position.z);
    if(s.cooldown>0) return;
    const targets=allies.filter(other=>other.position.distanceTo(m.position)<=7&&this.lineClear(floor,m.position,other.position)).slice(0,2);
    if(targets.length!==s.targets.length||targets.some((target,i)=>target!==s.targets[i])) {
      this.clearTethers(s);s.targets=targets;
      for(const target of targets) {const line=createTetherVisual();host.addWorldObject(line);s.tethers.push(line);updateTetherVisual(line,m.position,target.position);}
    }
    s.targets.forEach((target,i)=>updateTetherVisual(s.tethers[i],m.position,target.position));
  }
  private bodyFits(x:number,z:number,floor:FloorData,room:Room,radius=.45):boolean {
    return [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]].every(([dx,dz])=>isWalkable(floor,Math.floor(x+dx),Math.floor(z+dz))&&roomContainsPoint(room,x+dx,z+dz))
      &&!encounterBarrierBlocksCylinder(floor,x,z,radius);
  }
  private recoveryPosition(monster:Monster,floor:FloorData,room:Room):{x:number;z:number}|null {
    let best:{x:number;z:number}|null=null,bestDistance=Infinity;
    for(let z=room.z;z<room.z+room.depth;z++) for(let x=room.x;x<room.x+room.width;x++) {
      const px=x+.5,pz=z+.5;
      // Search using the ram's entire .45 body. A nearest position valid for
      // the player's .35 body can still overlap an irregular doorway plane.
      if(!canSealEncounterRoom(floor,room,px,pz,.45)||!this.bodyFits(px,pz,floor,room)) continue;
      const distance=(px-monster.position.x)**2+(pz-monster.position.z)**2;
      if(distance<bestDistance){bestDistance=distance;best={x:px,z:pz};}
    }
    return best;
  }
  private chase(m:Monster,player:MechanicPlayer,floor:FloorData,room:Room,dt:number,preferred:number,monsters:Monster[]):void {
    const p=player.position,dx=p.x-m.position.x,dz=p.z-m.position.z,distance=Math.hypot(dx,dz);
    m.faceToward(p.x,p.z);if(distance<.01||distance>m.def.detectRadius) return;
    const visible=this.lineClear(floor,m.position,p);
    let direction:{x:number;z:number}|null=null;
    if(!visible) direction=directionToPlayer(floor,m.position.x,m.position.z,p.x,p.z);
    else if(m.def.id==='prism_sentry'&&distance<3) direction={x:-dx,z:-dz};
    else if(distance>preferred) direction={x:dx,z:dz};
    else {
      // Idle queueing gives nearby allies space without orbiting out of melee reach.
      const crowded=monsters.find(other=>other!==m&&!other.dead&&other.roomId===m.roomId&&other.position.distanceTo(m.position)<1.1);
      if(crowded) direction={x:m.position.x-crowded.position.x,z:m.position.z-crowded.position.z};
    }
    if(direction) this.move(m,direction.x,direction.z,m.def.speed*m.speedMultiplier*m.slowMultiplier*dt,floor,room);
  }
  private move(m:Monster,dx:number,dz:number,distance:number,floor:FloorData,room:Room):void {
    if(distance<=0||Math.hypot(dx,dz)<.001) return;
    const angle=Math.atan2(dz,dx);
    for(const turn of [0,.65,-.65,1.2,-1.2]) {
      const direction=new THREE.Vector3(Math.cos(angle+turn),0,Math.sin(angle+turn));
      let allowed=Math.max(0,worldRayDistance(floor,new THREE.Vector3(m.position.x,1,m.position.z),direction,distance,.45)-.01);
      for(let step=.15;step<=allowed+.15;step+=.15) {
        const travel=Math.min(step,allowed);
        if(!this.bodyFits(m.position.x+direction.x*travel,m.position.z+direction.z*travel,floor,room)) {allowed=Math.max(0,travel-.15);break;}
      }
      if(allowed<Math.min(.01,distance*.5)) continue;
      const x=m.position.x+direction.x*allowed,z=m.position.z+direction.z*allowed;
      if(!this.bodyFits(x,z,floor,room)) continue;
      m.position.set(x,m.position.y,z);m.velocity.copy(direction).multiplyScalar(allowed/Math.max(1e-6,distance)*m.def.speed*m.speedMultiplier*m.slowMultiplier);return;
    }
  }
  private warning(s:State):THREE.Mesh {
    if(s.action==='wave') return this.waveMesh(s,6,true);
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(s.action==='charge'?2:1.4,s.distance+(s.action==='charge'?2:0)),
      new THREE.MeshBasicMaterial({color:s.action==='charge'?0xff984c:0xede192,transparent:true,opacity:.4,side:THREE.DoubleSide,depthWrite:false}));
    mesh.rotation.set(-Math.PI/2,0,0);mesh.rotation.z=Math.atan2(s.dx,s.dz);
    mesh.position.set(s.x+s.dx*s.distance/2,.08,s.z+s.dz*s.distance/2);return mesh;
  }
  private waveMesh(s:State,radius:number,warning=false):THREE.Mesh {
    const angle=Math.atan2(s.dz,s.dx);
    const mesh=new THREE.Mesh(new THREE.RingGeometry(warning?.88:.9,1,32,1,-angle-Math.PI/3,Math.PI*2/3),
      new THREE.MeshBasicMaterial({color:0x8ce8ed,transparent:true,opacity:warning?.35:.85,side:THREE.DoubleSide,depthWrite:false}));
    mesh.rotation.x=-Math.PI/2;mesh.position.set(s.x,.12,s.z);mesh.scale.setScalar(radius);return mesh;
  }
  private clearTethers(s:State):void {for(const line of s.tethers){line.removeFromParent();disposeMechanicObject(line);}s.tethers=[];s.targets=[];}
  private clearVisual(s:State,host?:EncounterMechanicsHost):void {if(s.visual){host?.removeWorldObject(s.visual);s.visual.removeFromParent();disposeMechanicObject(s.visual);s.visual=null;}}
  clear(host?:EncounterMechanicsHost):void {for(const [m,s] of this.states){this.clearVisual(s,host);this.clearTethers(s);m.group.userData.foundryAttack=false;}this.states.clear();}
}
