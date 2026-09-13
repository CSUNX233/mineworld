import type { FloorData, Room } from '../types';
import { BlockKind } from './Block';
import { roomContainsCell, roomCenter } from './RoomGeometry';
import { trialInteractionPosition } from './TrialInteraction';

export type RuinsPlace=(name:string,x:number,z:number,y?:number,angle?:number,sx?:number,sy?:number,sz?:number,tint?:number)=>void;

export function ruinsObstacleArt(room:Room|undefined,x:number,z:number):string {
  switch(room?.template) {
    case 'ruins-bulwark': return 'shield_barricade';
    case 'ruins-barracks': case 'ruins-armory':return 'weapon_rack';
    case 'ruins-chapel': case 'ruins-ring':return 'reliquary';
    case 'ruins-supply':return 'supply_crate';
    case 'ruins-trial':return 'broken_pier';
    case 'ruins-gate-arena':return 'guardian_statue';
    case 'ruins-double-path':return (x+z)%2?'wall':'broken_pier';
    default:return 'wall';
  }
}

/** Distinct room dressings, placed on verified wall cells, never on a doorway. */
export function placeRuinsRooms(data:FloorData,place:RuinsPlace,replacePlinth:(x:number,z:number)=>void) {
  const solid=(x:number,z:number)=>data.grid[z]?.[x]===BlockKind.Wall;
  const walk=(x:number,z:number)=>[BlockKind.Floor,BlockKind.Portal].includes(data.grid[z]?.[x]);
  const dirs=[[0,-1],[1,0],[0,1],[-1,0]];
  const roomArt:{id:string;template:string;kind:string;prop:string;landmarks:number;gate:boolean}[]=[];
  const reserved:{x:number;z:number}[]=[];
  for(const room of data.rooms) {
    const c=roomCenter(room),template=room.template??room.kind??'court';
    if (template === 'ruins-trial') {
      const anchor = trialInteractionPosition(room);
      const entrance = room.entrances?.[0];
      const angle = entrance ? Math.atan2(anchor.x - entrance.x, anchor.z - entrance.z) : 0;
      place('guardian_statue', anchor.x, anchor.z, 0, angle, .85, .85, .85);
    }
    const candidates:{x:number;z:number;angle:number}[]=[];
    for(let z=room.z-1;z<=room.z+room.depth;z++)for(let x=room.x-1;x<=room.x+room.width;x++) {
      if(!solid(x,z))continue;
      const direction=dirs.find(([dx,dz])=>walk(x+dx,z+dz)&&roomContainsCell(room,x+dx,z+dz));
      if(!direction || (room.entrances??[]).some(p=>Math.hypot(p.x-x,p.z-z)<2.4))continue;
      candidates.push({x,z,angle:Math.atan2(-direction[0],-direction[1])});
    }
    // A seed-dependent ordering, independent from the gameplay RNG.
    candidates.sort((a,b)=>score(a.x,a.z,data.seed)-score(b.x,b.z,data.seed));
    const selected:typeof candidates=[];
    for(const p of candidates) {
      if(selected.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<4.5))continue;
      selected.push(p);if(selected.length===4)break;
    }
    const name=template==='ruins-chapel'||template==='ruins-ring'||room.kind==='sanctuary'?'reliquary'
      :template==='ruins-armory'||template==='ruins-barracks'?'weapon_rack'
      :template==='ruins-bulwark'?'shield_barricade'
      :template==='ruins-gate-arena'?'guardian_statue'
      :template==='ruins-supply'||room.kind==='treasure'?'supply_crate'
      :room.kind==='start'?'shield_barricade':'broken_pier';
    for(const p of selected) {
      replacePlinth(p.x+.5,p.z+.5);
      // Stand on the 2-unit wall plinth; reduced prop size distinguishes perimeter details.
      place(name,p.x+.5,p.z+.5,2.14,p.angle,.8,.8,.8);
    }
    let gate=false;
    if(template==='ruins-gate-arena'||template==='ruins-chapel') {
      const spots=[{x:c.x,z:room.z-2,angle:0},{x:c.x,z:room.z+room.depth+2,angle:Math.PI},
        {x:room.x-2,z:c.z,angle:Math.PI/2},{x:room.x+room.width+2,z:c.z,angle:-Math.PI/2}];
      for(const p of spots) {
        let clear=true;
        for(let along=-3;along<=3;along++)for(let across=-1;across<=1;across++) {
          const x=Math.floor(p.x+Math.cos(p.angle)*along+Math.sin(p.angle)*across);
          const z=Math.floor(p.z-Math.sin(p.angle)*along+Math.cos(p.angle)*across);
          if(!solid(x,z))clear=false;
        }
        if(!clear)continue;
        for(const q of candidates)if(Math.hypot(q.x+.5-p.x,q.z+.5-p.z)<4.5)replacePlinth(q.x+.5,q.z+.5);
        place('king_gate',p.x,p.z,0,p.angle,1,template==='ruins-gate-arena'?1.25:1,1);
        gate=true;break;
      }
    }
    roomArt.push({id:room.id??'',template,kind:room.kind??'',prop:name,landmarks:selected.length,gate});
    if(gate)reserved.push(c);
  }
  // Only exterior non-traversable space receives large terrain or silhouette pieces.
  let terraces=0;
  for(let z=3;z<data.size-3;z+=4)for(let x=3;x<data.size-3;x+=4) {
    if(score(x,z,data.seed)%7>1||reserved.some(p=>Math.hypot(p.x-x,p.z-z)<14))continue;
    let clear=true;
    for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++)if(!solid(x+dx,z+dz))clear=false;
    if(clear){place('rock_terrace',x+.5,z+.5,-1.4,0,1,1,1,.88);terraces++;}
  }
  for(let i=0;i<8;i++) {
    const side=i%4,along=data.size*(.25+Math.floor(i/4)*.5);
    const x=side===1?data.size+7:side===3?-7:along;
    const z=side===0?-7:side===2?data.size+7:along;
    place('rock_terrace',x,z,-1.8,0,2,1.2,2,.8);
    place(i%3===0?'broken_pier':'distant_tower',x,z,1.5,0,i%3===0?2:1,.7+(score(i,0,data.seed)%5)*.1,1,.8);
  }
  return {rooms:roomArt,terraces};
}

function score(x:number,z:number,seed:number):number {
  return (Math.imul(x+137,73856093)^Math.imul(z+97,19349663)^seed)>>>0;
}
