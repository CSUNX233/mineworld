import type { RNG } from '../utils/RNG';
import type { MapLayout, LayoutNode } from './MapLayout';
/** Generous room spacing without overlaps; optional rewards rejoin before the last encounter. */
export function createLateLayout(rng:RNG,floor:number):MapLayout {
  const node=(id:number,kind:LayoutNode['kind'],cx:number,cz:number,required=false):LayoutNode=>({id:`room-${id}`,kind,cx,cz,required,shape:'cut-corners'});
  if(floor%5===0)return {kind:'branch-rejoin',nodes:[node(7,'start',9,24),node(3,'sanctuary',25,24),node(4,'battle',44,24),node(1,'exit',72,24,true),node(5,'treasure',25,43)],edges:[['room-7','room-3'],['room-3','room-4'],['room-4','room-1'],['room-3','room-5']]};
  const variant=rng.int(0,2);
  const nodes=[node(7,'start',9,31),node(0,'battle',28,31),node(2,'battle',29,10),node(4,'elite',54,10,true),node(1,'exit',57,32,true),node(3,'sanctuary',28,51),node(5,'treasure',46,53)];
  const edges:MapLayout['edges']=[['room-7','room-0'],['room-0','room-2'],['room-2','room-4'],['room-4','room-1'],['room-0','room-3'],['room-3','room-5'],['room-5','room-1']];
  if(variant===1)edges.push(['room-0','room-1']);
  if(variant===2){nodes.find(n=>n.id==='room-4')!.cz=12;edges.push(['room-0','room-4']);}
  if(floor===19||floor===24){nodes.push(node(6,'battle',69,55));edges.push(['room-5','room-6'],['room-6','room-1']);}
  return {kind:variant===0?'branch-rejoin':variant===1?'loop-shortcut':'asymmetric-cluster',nodes,edges};
}
