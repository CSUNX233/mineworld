import * as THREE from 'three';
import type { FloorData,ElementType,Room } from '../types';
import type { Monster } from './Monster';
import type { Player } from '../player/Player';
import { LATE_MONSTERS } from '../data/LateMonsters';
import { hasLateContent,lateMechanismAnchors,type LateAnchor } from '../data/LateChapter';
import { createDeepChapterProp } from '../world/DeepChapterAssets';
import { lateGroundHeight } from '../world/LateElevation';
import { directionToPlayer } from '../world/Navigation';
import { roomContainsPoint } from '../world/RoomGeometry';
import { canSealEncounterRoom } from '../world/EncounterBarriers';
import { worldRayDistance } from '../world/SpatialQueries';
import { MonsterSpawner } from './MonsterSpawner';
import { monsterAggression, monsterPursuitRate } from './EnemyIntent';

interface DeviceState {used:number;active:number;direction:number;remaining:number}
interface Device extends DeviceState {visualKey?:number;anchor:LateAnchor;mesh:THREE.Mesh;ring:THREE.Mesh}
interface Brain {cooldown:number;hidden:number;reveal:number;health:number;cycle:number;cast?:Cast;footprint?:THREE.Mesh;ghosts:THREE.Mesh[]}
interface Cast {kind:'line'|'circle'|'wave'|'melee'|'summon'|'dash';time:number;duration:number;x:number;z:number;dx:number;dz:number;radius:number;track:number;dashHit?:boolean;mesh:THREE.Mesh}
export interface LateSnapshot {devices:Record<string,DeviceState>;trialWaves?:string[]}
export interface LateHost {
  hurt:(amount:number,element:ElementType,source:Monster)=>void;
  damage:(monster:Monster,amount:number)=>void;
  summon:(source:Monster,x:number,z:number)=>void;
  message:(text:string,sub?:string)=>void;
}
const labels={lamp:'点亮显影灯',mirror:'击碎镜座',eye:'击碎眼核',banner:'夺取军旗',redirector:'切换导流方向',seal:'关闭增援封印'};
const special=new Set(LATE_MONSTERS.filter(m=>!['ash_wanderer','lost_soldier'].includes(m.id)).map(m=>m.id));

/** Late chapter owns device state, finite reinforcements and cancellable attack warnings. */
export class LateChapterController {
  private data:FloorData|null=null;
  private devices:Device[]=[];
  private roomsById=new Map<string,Room>();
  private captainRooms=new Set<string>();
  private bannerRooms=new Set<string>();
  private brains=new Map<Monster,Brain>();
  private trialWaves=new Set<string>();
  readonly group=new THREE.Group();
  constructor(private scene:THREE.Scene){this.group.name='late-chapter-mechanics';}
  setup(data:FloorData,saved?:LateSnapshot):void {
    this.clear();if(!hasLateContent(data))return;this.data=data;this.roomsById=new Map(data.rooms.map(r=>[r.id!,r]));this.trialWaves=new Set(saved?.trialWaves??[]);this.scene.add(this.group);
    for(const anchor of lateMechanismAnchors(data)){
      const mesh=createDeepChapterProp(data.floor,anchor.kind);if(!mesh)throw new Error(`Missing device ${anchor.kind}`);
      const state=saved?.devices?.[anchor.id];
      const d:Device={anchor,mesh,used:Math.max(0,Math.min(2,state?.used??0)),active:0,direction:state?.direction===1?1:0,remaining:Math.max(0,Math.min(4,state?.remaining??4)),ring:new THREE.Mesh(new THREE.RingGeometry(.65,.72,24),new THREE.MeshBasicMaterial({color:0xe4bd74,transparent:true,opacity:.45,depthWrite:false,side:THREE.DoubleSide}))};
      mesh.position.set(anchor.x,lateGroundHeight(data,anchor.x,anchor.z),anchor.z);mesh.rotation.y=anchor.angle;
      d.ring.rotation.x=-Math.PI/2;d.ring.position.copy(mesh.position).y+=.035;
      this.group.add(mesh,d.ring);this.devices.push(d);this.visual(d);
    }
  }
  snapshot():LateSnapshot {return {trialWaves:[...this.trialWaves],devices:Object.fromEntries(this.devices.map(d=>[d.anchor.id,{used:d.used,active:0,direction:d.direction,remaining:d.remaining}]))};}
  completeTrialWaves(rooms:readonly string[],monsters:Monster[],host:LateHost):void {
    if(!this.data)return;
    for(const r of this.data.rooms){
      if(!r.template?.endsWith('trial')||!rooms.includes(r.id!)||this.trialWaves.has(r.id!)||monsters.some(m=>!m.dead&&m.roomId===r.id))continue;
      const source=monsters.find(m=>m.roomId===r.id);if(!source)continue;
      this.trialWaves.add(r.id!);host.message('试炼 · 第二波','保持通路，清扫最后的守卫');
      for(const [dx,dz]of [[-3,-2],[3,-2],[-3,2],[3,2]])host.summon(source,r.center!.x+dx,r.center!.z+dz);
    }
  }
  handles(m:Monster):boolean {return !!this.data&&(special.has(m.def.id)||m.def.id==='boss'||m.def.id==='ruins_warden');}
  private brain(m:Monster):Brain {let b=this.brains.get(m);if(!b){b={cooldown:1.2,hidden:0,reveal:1.5,health:m.health,cycle:0,ghosts:[]};this.brains.set(m,b);}return b;}
  private available(d:Device,monsters:Monster[]):boolean {
    if(d.anchor.kind==='lamp'||d.anchor.kind==='redirector')return d.used<2;
    if(d.used)return false;
    return d.anchor.kind!=='banner'||!monsters.some(m=>!m.dead&&m.roomId===d.anchor.roomId&&m.def.id==='banner_captain');
  }
  nearby(p:THREE.Vector3,rooms:readonly string[],monsters:Monster[]):Device|undefined {
    return this.devices.filter(d=>rooms.includes(d.anchor.roomId)&&this.available(d,monsters)&&Math.hypot(p.x-d.anchor.x,p.z-d.anchor.z)<2)
      .sort((a,b)=>p.distanceToSquared(a.mesh.position)-p.distanceToSquared(b.mesh.position))[0];
  }
  label(p:THREE.Vector3,rooms:readonly string[],monsters:Monster[]):string|null {const d=this.nearby(p,rooms,monsters);return d?labels[d.anchor.kind]:null;}
  interact(p:THREE.Vector3,rooms:readonly string[],monsters:Monster[],host:LateHost):boolean {
    const d=this.nearby(p,rooms,monsters);if(!d)return false;
    if(d.anchor.kind==='lamp'){d.used++;d.active=8;host.message('显影灯已点亮','光域中的猎手无法潜行');}
    else if(d.anchor.kind==='redirector'){d.direction=1-d.direction;d.active=10;host.message('导流座已就绪','下一道镇压波将扫向敌军');}
    else if(d.anchor.kind==='seal'){d.used=1;d.remaining=0;host.message('增援入口已封闭','这座入口不会再派出援军');}
    else {d.used=1;this.breakEffect(d,monsters,host);}
    this.visual(d);return true;
  }
  hitDevices(p:THREE.Vector3,aim:THREE.Vector3,range:number,rooms:readonly string[],monsters:Monster[],host:LateHost):void {
    for(const d of this.devices){if(d.used||!['mirror','eye'].includes(d.anchor.kind)||!rooms.includes(d.anchor.roomId))continue;
      const dx=d.anchor.x-p.x,dz=d.anchor.z-p.z,dist=Math.hypot(dx,dz);
      if(dist<=range&&(dx*aim.x+dz*aim.z)/Math.max(.01,dist)>.8){d.used=1;this.breakEffect(d,monsters,host);this.visual(d);break;}
    }
  }
  private breakEffect(d:Device,monsters:Monster[],host:LateHost):void {
    host.message(d.anchor.kind==='mirror'?'镜像消散':d.anchor.kind==='banner'?'敌军失去旗令':'眼核破裂');
    for(const m of monsters.filter(m=>!m.dead&&m.roomId===d.anchor.roomId)){
      if(d.anchor.kind==='eye'&&m.position.distanceTo(d.mesh.position)<6)host.damage(m,MonsterSpawner.baseAttack(m,this.data!.floor)*1.1);
      if(d.anchor.kind==='banner'||m.def.behavior==='boss'){const b=this.brain(m);this.cancel(b);b.cooldown=Math.max(b.cooldown,2);m.group.userData.lateExposed=2;}
    }
  }
  updateFrame(dt:number,rooms:readonly string[],monsters:Monster[]):void {
    if(!this.data)return;
    for(const d of this.devices){d.active=Math.max(0,d.active-dt);d.ring.visible=rooms.includes(d.anchor.roomId)&&(!d.used||d.active>0);this.visual(d);}
    for(const [m,b] of this.brains){
      m.group.userData.lateExposed=Math.max(0,(m.group.userData.lateExposed??0)-dt);
      if(m.dead||!rooms.includes(m.roomId)){this.cancel(b);this.show(m,b,1);b.cooldown=Math.max(b.cooldown,1);if(m.dead)this.brains.delete(m);}
    }
    this.captainRooms.clear();this.bannerRooms.clear();
    for(const m of monsters)if(!m.dead&&m.def.id==='banner_captain')this.captainRooms.add(m.roomId);
    for(const d of this.devices)if(d.anchor.kind==='banner'&&!d.used&&this.captainRooms.has(d.anchor.roomId))this.bannerRooms.add(d.anchor.roomId);
    for(const m of monsters)if(!m.dead&&this.bannerRooms.has(m.roomId))m.group.userData.aggression=(m.group.userData.aggression??1)*1.1;
  }
  onHit(m:Monster):void {const b=this.brains.get(m);if(b){b.hidden=0;b.reveal=1.5;this.show(m,b,1);}}
  damageMultiplier(m:Monster,source?:THREE.Vector3):number {
    if(!this.handles(m))return 1;
    if(m.def.id==='ruins_warden')return (m.group.userData.lateExposed??0)>0?1.5:.8;
    if((m.group.userData.lateExposed??0)>0)return 1.15;
    if(!source||!['crystal_guard','linked_guard'].includes(m.def.id))return 1;
    const d=source.clone().sub(m.position).setY(0).normalize(),front=new THREE.Vector3(Math.sin(m.group.rotation.y),0,Math.cos(m.group.rotation.y));
    return d.dot(front)>.6?.8:1;
  }
  update(dt:number,m:Monster,p:Player,monsters:Monster[],host:LateHost):void {
    const data=this.data;if(!data||m.dead)return;const b=this.brain(m);
    const room=this.roomsById.get(m.roomId);if(!room||!roomContainsPoint(room,p.position.x,p.position.z)){this.cancel(b);return;}
    b.reveal=Math.max(0,b.reveal-dt);b.cooldown=Math.max(0,b.cooldown-dt*monsterAggression(m));
    if(m.health<b.health){this.onHit(m);}b.health=m.health;
    if(m.slowMultiplier<=.01){this.cancel(b);b.cooldown=Math.max(b.cooldown,.8);return;}
    const illuminated=this.devices.some(d=>d.anchor.kind==='lamp'&&d.active>0&&d.mesh.position.distanceTo(m.position)<5);
    if(illuminated)this.onHit(m);
    if(b.cast){m.velocity.set(0,0,0);this.tickCast(dt,m,p,b,monsters,host);return;}
    if(m.def.id==='shade_hunter'&&b.hidden>0){
      b.hidden-=dt;this.move(m,p,dt,1.25);this.show(m,b,p.position.distanceTo(m.position)<3?.5:.2);
      if(b.hidden<=0||p.position.distanceTo(m.position)<2.8){b.hidden=0;b.reveal=2;this.show(m,b,1);this.queue(m,p,b,'melee',.9,2.5);}
      return;
    }
    if(b.cooldown>0){this.move(m,p,dt,1);return;}
    const id=m.def.id, boss=m.def.behavior==='boss';
    if(id==='shade_hunter'&&b.reveal<=0&&!illuminated&&!monsters.some(o=>o!==m&&o.roomId===m.roomId&&(this.brains.get(o)?.hidden??0)>0)){
      b.hidden=3;b.cooldown=5;host.message('薄影猎手潜行','留意足迹，攻击或显影灯能让它现身');return;
    }
    // One spatial threat per room; waiting units still move and remain attackable.
    if(this.roomCasting(m)){b.cooldown=.35;this.move(m,p,dt,.6);return;}
    b.cycle++;
    if(boss){
      const phase=m.health/m.maxHealth>.66?1:m.health/m.maxHealth>.33?2:3;
      if(phase===3&&b.cycle%3===0){this.queue(m,p,b,'summon',1.3,1);return;}
        this.queue(m,p,b,id==='boss'?(phase>=2&&b.cycle%3===1?'dash':b.cycle%2?'line':'circle'):(b.cycle%2?'wave':'circle'),id==='boss'?1.2:1.1,id==='boss'?2:2.5);return;
    }
    if(id==='facet_mage'){
      this.ghosts(m,b);this.queue(m,p,b,'circle',1.15,1.3);
    }else if(id==='eye_keeper')this.queue(m,p,b,'line',1.8,1);
    else if(id==='seal_scribe')this.queue(m,p,b,b.cycle%2?'summon':'circle',1.4,1.25);
    else if(id==='seal_engine'||id==='rift_weaver')this.queue(m,p,b,'wave',1.2,1);
    else if(id==='lock_arbalist')this.queue(m,p,b,'line',1, .55);
    else if(p.position.distanceTo(m.position)<3)this.queue(m,p,b,'melee',.7,2.3);
    else {this.move(m,p,dt,1);b.cooldown=.15;}
  }
  private roomCasting(m:Monster):boolean {
    for(const [other,brain] of this.brains)if(other!==m&&!other.dead&&other.roomId===m.roomId&&brain.cast)return true;
    return false;
  }
  private move(m:Monster,p:Player,dt:number,mult:number):void {
    const data=this.data!;const dist=Math.hypot(p.position.x-m.position.x,p.position.z-m.position.z);
    if(dist<Math.min(m.def.attackRange,3)){m.velocity.set(0,0,0);return;}
    m.movementAttempted=true;
    const dir=directionToPlayer(data,m.position.x,m.position.z,p.position.x,p.position.z);if(!dir)return;
    const step=m.def.speed*m.slowMultiplier*mult*monsterPursuitRate(m)*dt;
    const x=m.position.x+dir.x*step,z=m.position.z+dir.z*step,room=this.roomsById.get(m.roomId)!;
    if(canSealEncounterRoom(data,room,x,z,.32)){m.velocity.set(dir.x*step/Math.max(dt,.001),0,dir.z*step/Math.max(dt,.001));m.position.set(x,lateGroundHeight(data,x,z),z);}
    m.faceToward(p.position.x,p.position.z);
  }
  private queue(m:Monster,p:Player,b:Brain,kind:Cast['kind'],time:number,radius:number):void {
    const target=kind==='circle'?p.position:m.position,d=p.position.clone().sub(m.position).setY(0).normalize();
    const mesh=new THREE.Mesh(kind==='line'||kind==='wave'||kind==='dash'?new THREE.PlaneGeometry(radius*2,kind==='dash'?8:12,1,24):new THREE.CircleGeometry(radius,32),new THREE.MeshBasicMaterial({color:kind==='summon'?0x6cc5ee:0xff7659,transparent:true,opacity:.35,side:THREE.DoubleSide,depthWrite:false}));
    b.cast={kind,time,duration:time,x:target.x,z:target.z,dx:d.x,dz:d.z,radius,track:kind==='line'&&m.def.id!=='lock_arbalist'?time-.8:0,mesh};
    this.group.add(mesh);this.placeCast(b.cast);m.velocity.set(0,0,0);
  }
  private placeCast(c:Cast):void {
    const line=c.kind==='line'||c.kind==='wave'||c.kind==='dash';
    const positions=c.mesh.geometry.getAttribute('position'),uv=c.mesh.geometry.getAttribute('uv');
    for(let i=0;i<positions.count;i++){
      const side=(uv.getX(i)-.5)*c.radius*2,along=uv.getY(i)*(c.kind==='dash'?8:12);
      const x=line?c.x+c.dx*along+c.dz*side:c.x+side;
      const z=line?c.z+c.dz*along-c.dx*side:c.z+(uv.getY(i)-.5)*c.radius*2;
      positions.setXYZ(i,x,lateGroundHeight(this.data!,x,z)+.06,z);
    }
    positions.needsUpdate=true;c.mesh.geometry.computeBoundingSphere();
  }

  private tickCast(dt:number,m:Monster,p:Player,b:Brain,monsters:Monster[],host:LateHost):void {
    const c=b.cast!;c.time-=dt;
    if(c.track>0){c.track-=dt;const d=p.position.clone().sub(m.position).setY(0).normalize();c.dx=d.x;c.dz=d.z;this.placeCast(c);}
    (c.mesh.material as THREE.MeshBasicMaterial).opacity=.25+.35*(1-Math.max(0,c.time)/c.duration);
    if(c.time>0)return;
    const damage=MonsterSpawner.baseAttack(m,this.data!.floor);
    if(c.kind==='dash'){
      const room=this.roomsById.get(m.roomId)!;
      const distance=Math.min(8,Math.max(0,-c.time)*8/.55);
      let travelled=Math.hypot(m.position.x-c.x,m.position.z-c.z),blocked=false;
      while(travelled<distance){
        travelled=Math.min(distance,travelled+.15);
        const x=c.x+c.dx*travelled,z=c.z+c.dz*travelled;
        if(!canSealEncounterRoom(this.data!,room,x,z,.45)){blocked=true;break;}
        m.position.set(x,lateGroundHeight(this.data!,x,z),z);
        if(!c.dashHit&&Math.hypot(p.position.x-x,p.position.z-z)<c.radius){c.dashHit=true;host.hurt(damage,'shadow',m);}
      }
      if(!blocked&&c.time>-.55)return;
      this.cancel(b);b.cooldown=1.5;m.group.userData.lateExposed=1.5;return;
    }
    if(c.kind==='summon'){
      const ds=this.devices.filter(d=>d.anchor.kind==='seal'&&d.anchor.roomId===m.roomId&&!d.used&&d.remaining>0);
      if(monsters.filter(o=>!o.dead&&o.roomId===m.roomId&&o!==m).length<4){
        if(ds.length){const d=ds[0];d.remaining--;host.summon(m,d.anchor.x,d.anchor.z);}
        else if(m.def.id==='boss'&&b.cycle<=9){host.summon(m,m.position.x+2,m.position.z);}
      }
    }else{
      let friendly=false;
      if(c.kind==='wave'){
        const redirect=this.devices.find(d=>d.anchor.kind==='redirector'&&d.anchor.roomId===m.roomId&&d.active>0&&d.used<2);
        if(redirect){
          redirect.used++;redirect.active=0;friendly=true;host.message('镇压波已导向敌军');
          const a=redirect.mesh.rotation.y,dx=Math.sin(a),dz=Math.cos(a);
          const targets=monsters.filter(o=>{const x=o.position.x-redirect.anchor.x,z=o.position.z-redirect.anchor.z;return !o.dead&&o.roomId===m.roomId&&Math.abs(x*dz-z*dx)<2.5&&Math.abs(x*dx+z*dz)<12;}).slice(0,4);
          for(const target of targets)host.damage(target,damage*.65);
        }
      }
      if(c.kind==='line')for(const d of this.devices){
        if(d.anchor.kind!=='eye'||d.used||d.anchor.roomId!==m.roomId)continue;
        const dx=d.anchor.x-c.x,dz=d.anchor.z-c.z,along=dx*c.dx+dz*c.dz;
        if(along>0&&along<12&&Math.abs(dx*c.dz-dz*c.dx)<c.radius+.5){d.used=1;this.breakEffect(d,monsters,host);this.visual(d);break;}
      }
      const dx=p.position.x-c.x,dz=p.position.z-c.z,along=dx*c.dx+dz*c.dz;
      const inside=c.kind==='line'||c.kind==='wave'?along>=0&&along<=12&&Math.abs(dx*c.dz-dz*c.dx)<=c.radius:Math.hypot(dx,dz)<=c.radius;
      const airborne=c.kind==='wave'&&p.position.y-lateGroundHeight(this.data!,p.position.x,p.position.z)>.42;
      const len=Math.hypot(dx,dz),direction=new THREE.Vector3(dx,0,dz).normalize();
      if(!friendly&&inside&&!airborne&&worldRayDistance(this.data!,new THREE.Vector3(c.x,1,c.z),direction,len)>=len-.05)host.hurt(damage,c.kind==='wave'?'physical':'shadow',m);

    }
    this.cancel(b);b.cooldown=m.def.behavior==='boss'?1.5:3.2;m.group.userData.lateExposed=m.def.behavior==='boss'?1.5:0;
  }
  private ghosts(m:Monster,b:Brain):void {
    if(b.ghosts.length||!this.devices.some(d=>d.anchor.kind==='mirror'&&!d.used&&d.anchor.roomId===m.roomId))return;
    for(const sign of [-1,1]){const ghost=createDeepChapterProp(this.data!.floor,'enemy_facet_mage');if(!ghost)continue;const mat=ghost.material as THREE.MeshPhongMaterial;mat.transparent=true;mat.opacity=.3;mat.depthWrite=false;ghost.position.copy(m.position).x+=sign*1.5;this.group.add(ghost);b.ghosts.push(ghost);}
  }
  private show(m:Monster,b:Brain,opacity:number):void {
    const mesh=m.group.getObjectByName('late-enemy-model') as THREE.Mesh|undefined;
    if(mesh){const mat=mesh.material as THREE.MeshPhongMaterial;mat.transparent=opacity<1;mat.opacity=opacity;mat.depthWrite=opacity===1;}
    if(opacity<1&&this.data){
      if(!b.footprint){b.footprint=new THREE.Mesh(new THREE.RingGeometry(.12,.2,12),new THREE.MeshBasicMaterial({color:0xb9a8cf,transparent:true,opacity:.45,depthWrite:false,side:THREE.DoubleSide}));b.footprint.rotation.x=-Math.PI/2;this.group.add(b.footprint);}
      b.footprint.position.set(m.position.x,lateGroundHeight(this.data,m.position.x,m.position.z)+.06,m.position.z);
    }else if(b.footprint){this.disposeMesh(b.footprint);b.footprint=undefined;}
    m.group.userData.lateHidden=opacity<1;
    if(opacity===1&&b.hidden<=0)m.group.userData.lateHidden=false;
  }
  private visual(d:Device):void {
    const key=d.used+d.direction*4+(d.active>0?8:0);if(d.visualKey===key)return;d.visualKey=key;
    const mat=d.mesh.material as THREE.MeshPhongMaterial;
    mat.color.setHex(d.used&&d.anchor.kind!=='lamp'&&d.anchor.kind!=='redirector'?0x555361:0xffffff);
    mat.emissive.setHex(d.active>0?0x896235:!d.used&&['eye','mirror'].includes(d.anchor.kind)?0x382054:0x000000);mat.emissiveIntensity=d.active>0?.7:!d.used?.55:0;
    if(d.anchor.kind==='redirector')d.mesh.rotation.y=d.anchor.angle+d.direction*Math.PI/2;
    if(d.anchor.kind==='banner'&&d.used)d.mesh.rotation.z=.9;
    if(['eye','mirror'].includes(d.anchor.kind)&&d.used)d.mesh.scale.y=.28;
    d.ring.scale.setScalar(d.anchor.kind==='lamp'&&d.active>0?7:1);
  }
  private disposeMesh(mesh:THREE.Mesh):void {mesh.removeFromParent();mesh.geometry.dispose();for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]){(m as THREE.MeshPhongMaterial).map?.dispose();m.dispose();}}
  private cancel(b:Brain):void {if(b.cast){this.disposeMesh(b.cast.mesh);b.cast=undefined;}for(const g of b.ghosts)this.disposeMesh(g);b.ghosts=[];}
  clear():void {for(const [m,b]of this.brains){this.cancel(b);this.show(m,b,1);}this.brains.clear();this.roomsById.clear();this.captainRooms.clear();this.bannerRooms.clear();this.trialWaves.clear();for(const d of this.devices){this.disposeMesh(d.mesh);this.disposeMesh(d.ring);}this.devices=[];this.group.removeFromParent();this.data=null;}
}
