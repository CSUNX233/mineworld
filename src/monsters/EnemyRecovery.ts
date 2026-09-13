import type { FloorData } from '../types';
import type { Monster } from './Monster';
import { canSealEncounterRoom, encounterBarrierBlocksCylinder } from '../world/EncounterBarriers';
import { roomContainsPoint } from '../world/RoomGeometry';
import { lateGroundHeight } from '../world/LateElevation';

interface Progress { x:number; z:number; stalled:number; cooldown:number }
interface Position { x:number; z:number }

/** Recover failed movement, never an intentional casting / waiting pause. */
export class EnemyRecovery {
  private floor:FloorData|null=null;
  private progress=new WeakMap<Monster,Progress>();

  update(dt:number,data:FloorData,monsters:readonly Monster[],player:Position,lockedRooms:readonly string[]):number {
    if(data!==this.floor){this.floor=data;this.progress=new WeakMap();}
    if(dt<=0)return 0;
    let rescued=0;
    for(const monster of monsters){
      if(monster.dead){this.progress.delete(monster);continue;}
      let state=this.progress.get(monster);
      if(!state){state={x:monster.position.x,z:monster.position.z,stalled:0,cooldown:0};this.progress.set(monster,state);}
      state.cooldown=Math.max(0,state.cooldown-dt);
      const eligible=monster.movementAttempted&&monster.attackWindup<=0&&monster.slowMultiplier>.01
        && !monster.statuses.some(s=>s.type==='frozen'&&s.duration>0)&&lockedRooms.includes(monster.roomId);
      const dx=monster.position.x-state.x,dz=monster.position.z-state.z;
      if(!eligible||state.cooldown>0||dx*dx+dz*dz>=.25*.25){
        state.x=monster.position.x;state.z=monster.position.z;state.stalled=0;continue;
      }
      state.stalled+=dt;if(state.stalled<3)continue;
      state.stalled=0;state.cooldown=1;
      const room=data.rooms.find(r=>r.id===monster.roomId);
      if(!room||!roomContainsPoint(room,player.x,player.z))continue;
      const radius=monster.def.behavior==='boss'?.85:.45;
      let bestX=0,bestZ=0,best=Infinity;
      for(let z=room.z;z<room.z+room.depth;z++)for(let x=room.x;x<room.x+room.width;x++){
        const px=x+.5,pz=z+.5,distance=(px-monster.position.x)**2+(pz-monster.position.z)**2;
        if(distance<.75*.75||distance>=best||(px-player.x)**2+(pz-player.z)**2<3*3)continue;
        if(!canSealEncounterRoom(data,room,px,pz,radius)||encounterBarrierBlocksCylinder(data,px,pz,radius))continue;
        if((room.entrances??[]).some(e=>(px-e.x-.5)**2+(pz-e.z-.5)**2<2.25))continue;
        if([data.portal,...data.chests,...(data.merchant?[data.merchant]:[])].some(p=>(px-p.x-.5)**2+(pz-p.z-.5)**2<2.25))continue;
        if(monsters.some(other=>other!==monster&&!other.dead&&Math.hypot(px-other.position.x,pz-other.position.z)<radius+(other.def.behavior==='boss'?.85:.45)+.2))continue;
        best=distance;bestX=px;bestZ=pz;
      }
      if(!Number.isFinite(best))continue;
      monster.position.set(bestX,lateGroundHeight(data,bestX,bestZ),bestZ);
      monster.group.position.copy(monster.position);monster.velocity.set(0,0,0);
      monster.movementAttempted=false;monster.attackCooldown=Math.max(monster.attackCooldown,.6);
      state.x=bestX;state.z=bestZ;state.cooldown=8;rescued++;
    }
    return rescued;
  }
  clear():void {this.floor=null;this.progress=new WeakMap();}
}
