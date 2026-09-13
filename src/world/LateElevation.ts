import type { FloorData, Room } from '../types';
import { hasLateContent } from '../data/LateChapter';
const cache=new WeakMap<FloorData,Room[]>();
/** Broad four-sided terraced dais. Every rise has a shallow traversable stair slope. */
export function lateGroundHeight(data:FloorData,x:number,z:number):number {
  if(!hasLateContent(data))return 0;
  let rooms=cache.get(data);if(!rooms){rooms=data.rooms.filter(r=>['abyss-eye','abyss-mirror','citadel-wave','citadel-seal','abyss-throne','citadel-throne'].includes(r.template??''));cache.set(data,rooms);}
  for(const r of rooms){
    const cx=r.x+r.width/2,cz=r.z+r.depth/2;
    if(r.template?.endsWith('throne')){
      for(const side of [-1,1]){const tx=cx+side*(r.width/2-4),edge=Math.min(2.5-Math.abs(x-tx),5-Math.abs(z-cz));if(edge>0)return Math.min(.8,Math.floor(edge/1.8*8)*.1);}
      continue;
    }
    const edge=Math.min(5-Math.abs(x-cx),4-Math.abs(z-cz));
    if(edge<=0)continue;
    // 0.8m plateau, 2.8m broad stair approach on every edge, no jump requirement.
    return Math.min(.8,Math.max(0,Math.floor(edge/2.8*8)*.1));
  }
  return 0;
}
