import * as THREE from 'three';
import type { Item } from '../types';
import type { DeathReaperEffect } from './DeathReaper';
import { deathReaperIdentities } from '../data/DeathReaperItems';

type Position = { x: number; y: number; z: number };
interface Burst { group: THREE.Group; remaining: number; duration: number; radius: number; kind: DeathReaperEffect }

/** Scene-owned block geometry: never touches the player's existing weapon/model. */
export class DeathReaperVisual {
  private avatar = new THREE.Group();
  private pieces = new Map<string,THREE.Group>();
  private formVisual = new THREE.Group();
  private bursts: Burst[] = [];
  private geometries = new Map<string,THREE.BufferGeometry>();
  private materials = new Map<string,THREE.Material>();
  private time = 0;
  private disposed = false;
  constructor(private scene: THREE.Scene) {
    this.avatar.name='death-reaper-equipment';this.scene.add(this.avatar);
    for(const piece of ['scythe','crown','shroud','bindings','steps','harvest_ring','echo_ring','hourglass','lantern']) {
      const group=this.buildPiece(piece);group.name=`death-reaper-${piece}`;group.visible=false;
      this.avatar.add(group);this.pieces.set(`death_reaper_${piece}`,group);
    }
    this.formVisual.name='death-reaper-transformation';this.avatar.add(this.formVisual);
    this.buildForm();this.formVisual.visible=false;
  }
  private geometry(kind: 'box'|'ring'|'arc'|'cone'):THREE.BufferGeometry {
    let geometry=this.geometries.get(kind);
    if(!geometry) {
      geometry=kind==='box'?new THREE.BoxGeometry(1,1,1):kind==='ring'?new THREE.RingGeometry(.91,1,24)
        :kind==='arc'?new THREE.TorusGeometry(1,.065,4,20,Math.PI*1.4):new THREE.ConeGeometry(.5,1,4);
      this.geometries.set(kind,geometry);
    }
    return geometry;
  }
  private material(color:number,glow=false):THREE.Material {
    const key=`${color}:${glow}`;let material=this.materials.get(key);
    if(!material) {
      material=glow?new THREE.MeshBasicMaterial({color,transparent:true,opacity:.72,depthWrite:false,side:THREE.DoubleSide})
        :new THREE.MeshLambertMaterial({color});this.materials.set(key,material);
    }
    return material;
  }
  private mesh(group:THREE.Group,kind:'box'|'ring'|'arc'|'cone',color:number,position:Position,scale:Position,glow=false):THREE.Mesh {
    const mesh=new THREE.Mesh(this.geometry(kind),this.material(color,glow));
    mesh.position.set(position.x,position.y,position.z);mesh.scale.set(scale.x,scale.y,scale.z);
    if(glow) mesh.renderOrder=5;group.add(mesh);return mesh;
  }
  private block(group:THREE.Group,color:number,x:number,y:number,z:number,sx:number,sy:number,sz:number,glow=false):THREE.Mesh {
    return this.mesh(group,'box',color,{x,y,z},{x:sx,y:sy,z:sz},glow);
  }
  private buildPiece(piece:string):THREE.Group {
    const group=new THREE.Group(),bone=0xd1c4a0,gold=0xac8343,red=0xb92042,coal=0x25272d;
    if(piece==='scythe') {
      this.block(group,coal,.84,1.1,.18,.09,1.95,.09);
      for(let i=0;i<5;i++) this.block(group,i===0?gold:bone,.81-i*.16,2.04+Math.sin(i*.7)*.13,.18,.21,.13,.12).rotation.z=.2-i*.18;
      this.block(group,red,.8,1.45,.18,.15,.15,.15,true);
    } else if(piece==='crown') {
      for(let i=0;i<8;i++) {
        const angle=i*Math.PI/4;this.block(group,gold,Math.cos(angle)*.34,2.01,Math.sin(angle)*.29,.13,.16,.13);
        if(i%2===0)this.block(group,bone,Math.cos(angle)*.34,2.16,Math.sin(angle)*.29,.08,.27,.08);
      }
    } else if(piece==='shroud') {
      for(const side of [-1,1]) {
        this.block(group,coal,side*.41,1.36,-.13,.3,.47,.45).rotation.z=side*.22;
        this.block(group,gold,side*.42,1.57,-.13,.32,.11,.47);
        this.block(group,red,side*.34,.98,-.25,.15,.36,.1);
      }
    } else if(piece==='bindings') {
      for(const side of [-1,1]) for(let i=0;i<3;i++)this.block(group,i%2?gold:coal,side*.17,.43+i*.15,-.13,.23,.1,.32);
    } else if(piece==='steps') {
      for(const side of [-1,1]) {
        this.block(group,coal,side*.19,.12,.08,.24,.23,.45);
        this.block(group,gold,side*.19,.22,.08,.26,.05,.46);
      }
    } else if(piece==='harvest_ring'||piece==='echo_ring') {
      const side=piece==='harvest_ring'?-1:1;
      this.block(group,gold,side*.48,.86,.16,.17,.13,.18);
      this.block(group,piece==='harvest_ring'?red:bone,side*.51,.86,.27,.08,.08,.08,true);
    } else if(piece==='hourglass') {
      this.block(group,gold,0,1.2,.24,.18,.045,.1);this.block(group,gold,0,.94,.24,.18,.045,.1);
      for(const sign of [-1,1]) {
        const cone=this.mesh(group,'cone',bone,{x:0,y:1.07+sign*.065,z:.24},{x:.14,y:.13,z:.12},true);
        if(sign>0)cone.rotation.z=Math.PI;
      }
    } else {
      group.position.set(-.72,.55,-.1);
      for(const side of [-1,1]) this.block(group,gold,side*.15,0,0,.045,.46,.045);
      this.block(group,coal,0,-.25,0,.4,.08,.3);this.block(group,gold,0,.25,0,.4,.08,.3);
      this.block(group,red,0,0,0,.19,.25,.18,true);
      this.block(group,gold,0,.38,0,.06,.22,.06);
    }
    return group;
  }
  private buildForm():void {
    for(const side of [-1,1]) {
      const horn=this.mesh(this.formVisual,'cone',0xd1c4a0,{x:side*.4,y:2.38,z:0},{x:.25,y:.8,z:.25});horn.rotation.z=side*-.4;
      this.block(this.formVisual,0x25272d,side*.58,1.33,-.23,.38,.72,.48).rotation.z=side*.3;
      this.block(this.formVisual,0xb92042,side*.64,1.63,-.23,.4,.08,.5,true);
    }
    const ring=this.mesh(this.formVisual,'ring',0xb92042,{x:0,y:.045,z:0},{x:1.1,y:1.1,z:1.1},true);ring.rotation.x=-Math.PI/2;ring.name='form-ground';
    for(let i=0;i<9;i++) {
      const shard=this.block(this.formVisual,i%2?0xac8343:0xb92042,0,0,0,.08,.22,.08,true);
      shard.name=`form-shard-${i}`;
    }
  }
  update(dt:number,items:readonly Item[],position:Position,transformed:boolean,firstPerson:boolean,yaw=0):void {
    if(this.disposed)return;
    const delta=Number.isFinite(dt)?Math.max(0,Math.min(.25,dt)):0;this.time+=delta;
    this.avatar.position.set(position.x,position.y,position.z);
    this.avatar.rotation.y=yaw;
    const identities=deathReaperIdentities(items);
    this.avatar.visible=identities.size>0;
    for(const [id,group]of this.pieces) {
      const low=id==='death_reaper_steps'||id==='death_reaper_lantern';
      group.visible=identities.has(id)&&(!firstPerson||low);
      if(id==='death_reaper_lantern') {group.position.y=(firstPerson ? .24 : .55)+Math.sin(this.time*2)*.045;}
      if(id==='death_reaper_scythe')group.scale.setScalar(transformed?1.18:1);
    }
    this.formVisual.visible=transformed&&identities.size===9;
    if(this.formVisual.visible) {
      for(const child of this.formVisual.children)child.visible=!firstPerson||child.name==='form-ground'||child.name.startsWith('form-shard');
      for(let i=0;i<9;i++) {
        const shard=this.formVisual.getObjectByName(`form-shard-${i}`);
        if(shard) {const angle=this.time*1.25+i*Math.PI*2/9;shard.position.set(Math.cos(angle)*1.0,firstPerson ? .09 : .35+Math.sin(angle*2)*.18,Math.sin(angle)*1.0);shard.rotation.y=this.time*2;}
      }
    }
    for(let i=this.bursts.length-1;i>=0;i--) {
      const burst=this.bursts[i];burst.remaining-=delta;
      if(burst.remaining<=0) {burst.group.removeFromParent();this.bursts.splice(i,1);continue;}
      const progress=1-burst.remaining/burst.duration;
      burst.group.scale.setScalar(burst.radius*(.35+progress*.65));
      burst.group.rotation.y=progress*Math.PI*.6;
    }
  }
  onEffect(kind:DeathReaperEffect,position:Position,radius:number):void {
    if(this.disposed)return;
    if(this.bursts.length>=18)this.bursts.shift()!.group.removeFromParent();
    const group=new THREE.Group();group.name=`death-reaper-hit-${kind}`;
    group.position.set(position.x,position.y+.12,position.z);this.scene.add(group);
    const blade=kind==='scythe'||kind==='pursuit'||kind==='harvest'||kind==='form';
    const mesh=this.mesh(group,blade?'arc':'ring',0xb92042,{x:0,y:0,z:0},{x:1,y:1,z:1},true);mesh.rotation.x=-Math.PI/2;
    for(let i=0;i<(blade?5:8);i++) {
      const angle=i*Math.PI*2/(blade?5:8);
      this.block(group,0xac8343,Math.cos(angle)*.75,.04,Math.sin(angle)*.75,.1,.08,.1,true);
    }
    const duration=kind==='echo' ? .35 : kind==='form' ? .65 : .45;
    const size=Number.isFinite(radius)?Math.max(.35,Math.min(7,radius)):1;group.scale.setScalar(size*.35);
    this.bursts.push({group,remaining:duration,duration,radius:size,kind});
  }
  /** Keep shared meshes cached for the next run. */
  reset():void {for(const burst of this.bursts)burst.group.removeFromParent();this.bursts=[];this.avatar.visible=false;this.formVisual.visible=false;this.time=0;}
  dispose():void {
    if(this.disposed)return;this.reset();this.avatar.removeFromParent();
    for(const geometry of this.geometries.values())geometry.dispose();for(const material of this.materials.values())material.dispose();
    this.geometries.clear();this.materials.clear();this.disposed=true;
  }
}
