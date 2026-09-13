import type { FloorData } from '../types';
import { BlockKind } from './Block';
import { roomCenter, roomContainsCell } from './RoomGeometry';

export interface PortalPlacement { x:number; z:number; angle:number; posts:{x:number;z:number}[] }
const placements=new WeakMap<FloorData,PortalPlacement>();
/** Deterministic wall-side socket with clear approach; no gameplay RNG consumed. */
export function preparePortalPlacement(data:FloorData):PortalPlacement {
  const cached=placements.get(data);if(cached)return cached;
  const room=data.rooms.find(r=>r.kind==='exit')??data.rooms.find(r=>roomContainsCell(r,data.portal.x,data.portal.z));
  const fallback={x:data.portal.x+.5,z:data.portal.z+.5,angle:0,posts:[]};
  if(!room){placements.set(data,fallback);return fallback;}
  const center=roomCenter(room),candidates:{x:number;z:number;dx:number;dz:number;score:number}[]=[];
  for(let z=room.z;z<room.z+room.depth;z++)for(let x=room.x;x<room.x+room.width;x++)for(const [dx,dz] of [[0,1],[1,0],[0,-1],[-1,0]]){
    if(data.grid[z-dz]?.[x-dx]!==BlockKind.Wall)continue;
    let clear=true;
    for(let forward=0;forward<=2;forward++)for(let side=-1;side<=1;side++){
      const cx=x+dx*forward+dz*side,cz=z+dz*forward-dx*side;
      if(!roomContainsCell(room,cx,cz)||![BlockKind.Floor,BlockKind.Portal].includes(data.grid[cz]?.[cx]))clear=false;
      if(data.chests.some(p=>Math.hypot(p.x-cx,p.z-cz)<1.5)||data.merchant&&Math.hypot(data.merchant.x-cx,data.merchant.z-cz)<2)clear=false;
    }
    if(!clear||(room.entrances??[]).some(p=>Math.hypot(p.x-x,p.z-z)<3.5))continue;
    candidates.push({x,z,dx,dz,score:Math.hypot(x+.5-center.x,z+.5-center.z)});
  }
  candidates.sort((a,b)=>a.score-b.score||a.z-b.z||a.x-b.x);
  const c=candidates[0];if(!c){placements.set(data,fallback);return fallback;}
  if(data.grid[data.portal.z][data.portal.x]===BlockKind.Portal)data.grid[data.portal.z][data.portal.x]=BlockKind.Floor;
  data.portal={x:c.x,z:c.z};data.grid[c.z][c.x]=BlockKind.Portal;
  const posts=[-1,1].map(side=>({x:c.x+c.dz*side,z:c.z-c.dx*side}));
  posts.forEach(p=>data.grid[p.z][p.x]=BlockKind.Obstacle);
  const placement={x:c.x+.5,z:c.z+.5,angle:Math.atan2(c.dx,c.dz),posts};placements.set(data,placement);return placement;
}
