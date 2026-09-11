import { expandingWaveHitTime } from './FoundryBossGeometry';
import * as THREE from 'three';
import type { FloorData } from '../types';
import type { Monster } from './Monster';
import type { EncounterMechanicsHost, MechanicPlayer, SerializedMechanicState } from './EncounterMechanics';
import { worldRayDistance } from '../world/SpatialQueries';
import { roomContainsPoint } from '../world/RoomGeometry';
import { directionToPlayer } from '../world/Navigation';
import { monsterAttack } from '../data/recipes';
import { createTetherVisual, updateTetherVisual, disposeMechanicObject } from './MechanicVisual';

const IDS = new Set(['ram_beast','chain_smith','prism_sentry']);
interface State {
  cooldown: number; phase: 'idle'|'warning'|'dash'|'wave'|'beam'; action: 'charge'|'beam'|'wave';
  remaining: number; dx: number; dz: number; x: number; z: number; distance: number;
  hit: boolean; nextWave: boolean; interrupted: boolean;
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
      hit:false,nextWave:false,interrupted:false,visual:null,targets:[],tethers:[],previousPlayer:null};this.states.set(monster,s);}
    return s;
  }
  serialize(monster: Monster): SerializedMechanicState {
    const s=this.state(monster);
    return {role:'controller',cooldown:Math.max(s.cooldown,s.remaining),interruptedCast:s.phase!=='idle'};
  }
  restore(monster: Monster,saved: SerializedMechanicState|undefined): void {
    if(saved?.role==='controller') this.state(monster).cooldown=Math.max(2.5,saved.cooldown);
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
    for(const [m,s] of this.states) if(m.dead||!monsters.includes(m)) {this.clearVisual(s,host);this.clearTethers(s);this.states.delete(m);}
    for(const m of monsters) {
      if(m.dead||!this.handles(m)) continue;
      const s=this.state(m);m.velocity.set(0,0,0);
      if (m.slowMultiplier === 0) continue;
      s.cooldown=Math.max(0,s.cooldown-dt);
      if(m.def.id==='chain_smith') {this.updateSmith(m,s,monsters,floor,host);continue;}
      const room=floor.rooms.find(r=>r.id===m.roomId);if(!room) continue;
      const p=player.position;
      if(s.phase==='idle') {
        if(s.cooldown>0) continue;
        // Serialize high-pressure attacks within a room, leaving a readable response window.
        if([...this.states].some(([other,state])=>other!==m&&!other.dead&&other.roomId===m.roomId&&state.phase!=='idle')) continue;
        const distance=Math.hypot(p.x-m.position.x,p.z-m.position.z);
        if(!this.lineClear(floor,m.position,p)) {
          const direction=directionToPlayer(floor,m.position.x,m.position.z,p.x,p.z);
          if(direction) this.move(m,direction.x,direction.z,1.8*dt,floor);
          continue;
        }
        if(distance<.01) continue;
        s.x=m.position.x;s.z=m.position.z;s.dx=(p.x-s.x)/distance;s.dz=(p.z-s.z)/distance;
        s.action=s.nextWave?'wave':m.def.id==='ram_beast'?'charge':'beam';s.nextWave=false;
        s.distance=s.action==='beam'?Math.min(13,worldRayDistance(floor,new THREE.Vector3(s.x,1,s.z),new THREE.Vector3(s.dx,0,s.dz),13)):9;
        s.remaining=1.2;s.phase='warning';s.hit=false;s.previousPlayer={x:p.x,y:p.y??0,z:p.z};
        s.visual=this.warning(s);host.addWorldObject(s.visual);m.faceToward(p.x,p.z);
        continue;
      }
      if(s.phase==='warning') {
        s.remaining-=dt;
        if(s.remaining>0) continue;
        this.clearVisual(s,host);
        if(s.action==='beam') {
          const dx=p.x-s.x,dz=p.z-s.z,along=dx*s.dx+dz*s.dz,across=Math.abs(dx*s.dz-dz*s.dx);
          if(along>=0&&along<=s.distance+.35&&across<=.7&&this.lineClear(floor,{x:s.x,z:s.z},p))
            host.damagePlayer(Math.round(monsterAttack(m.def.attack,floor.floor)*.9),'foundry_beam');
          s.phase='beam';s.remaining=.12;s.visual=this.warning(s);
          ((s.visual as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity=.95;host.addWorldObject(s.visual);
        } else if(s.action==='charge') {s.phase='dash';s.remaining=1.4;}
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
          if(!roomContainsPoint(room,nx,nz)||worldRayDistance(floor,new THREE.Vector3(m.position.x,1,m.position.z),new THREE.Vector3(s.dx,0,s.dz),step,.45)<step) {
            let broke=false;
            for(const offset of [-.35,0,.35]) broke=Boolean(host.breakPanel?.(nx+s.dz*offset,nz-s.dx*offset))||broke;
            s.phase='idle';s.cooldown=broke?2.5:2;s.nextWave=true;collided=true;break;
          }
          m.position.x+=s.dx*step;m.position.z+=s.dz*step;
          if(!s.hit&&Math.hypot(p.x-m.position.x,p.z-m.position.z)<1) {
            s.hit=true;host.damagePlayer(Math.round(monsterAttack(m.def.attack,floor.floor)*1.15),'foundry_charge');
          }
        }
        s.remaining-=dt;
        if(!collided&&s.remaining<=0) {s.phase='idle';s.cooldown=1.2;}
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
  private updateSmith(m:Monster,s:State,monsters:Monster[],floor:FloorData,host:EncounterMechanicsHost):void {
    if(s.targets.some(target=>target.dead)) {s.cooldown=Math.max(s.cooldown,1.5);this.clearTethers(s);}
    if(s.interrupted) {s.interrupted=false;this.clearTethers(s);}
    if(s.cooldown>0) return;
    const targets=monsters.filter(other=>other!==m&&!other.dead&&other.roomId===m.roomId&&other.def.behavior!=='boss'
      &&other.def.id!=='chain_smith'&&other.position.distanceTo(m.position)<=7&&this.lineClear(floor,m.position,other.position)).slice(0,2);
    if(targets.length!==s.targets.length||targets.some((target,i)=>target!==s.targets[i])) {
      this.clearTethers(s);s.targets=targets;
      for(const target of targets) {const line=createTetherVisual();host.addWorldObject(line);s.tethers.push(line);updateTetherVisual(line,m.position,target.position);}
    }
    s.targets.forEach((target,i)=>updateTetherVisual(s.tethers[i],m.position,target.position));
  }
  private move(m:Monster,dx:number,dz:number,distance:number,floor:FloorData):void {
    const direction=new THREE.Vector3(dx,0,dz).normalize();
    const allowed=worldRayDistance(floor,new THREE.Vector3(m.position.x,1,m.position.z),direction,distance,.4);
    m.position.addScaledVector(direction,Math.max(0,allowed-.01));
  }
  private warning(s:State):THREE.Mesh {
    if(s.action==='wave') return this.waveMesh(s,6,true);
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(s.action==='charge'?1.3: .7,s.distance),
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
  clear(host?:EncounterMechanicsHost):void {for(const s of this.states.values()){this.clearVisual(s,host);this.clearTethers(s);}this.states.clear();}
}
