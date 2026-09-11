import { getEncounterBarriers, encounterBarrierRayDistance, type EncounterBarrier } from './EncounterBarriers';
import type { FloorData } from '../types';
import { isWalkable } from './FloorGenerator';

// One shared flow field per player cell, reused by every pursuing monster.
const fields = new WeakMap<FloorData, { target: number; barriers: readonly EncounterBarrier[]; distances: Int16Array }>();
export function directionToPlayer(floor: FloorData, x: number, z: number, tx: number, tz: number): {x:number;z:number} | null {
  const target = Math.floor(tz) * floor.size + Math.floor(tx);
  let field = fields.get(floor);
  const barriers = getEncounterBarriers(floor);
  const openEdge = (x: number, z: number, nx: number, nz: number) => !barriers.length || encounterBarrierRayDistance(
    floor, { x: x + .5, y: 1, z: z + .5 }, { x: nx - x, y: 0, z: nz - z }, 1, .3) >= 1;
  if (!field || field.target !== target || field.barriers !== barriers) {
    const distances = new Int16Array(floor.size * floor.size).fill(-1);
    if (!isWalkable(floor,Math.floor(tx),Math.floor(tz))) return null;
    const queue = [target]; distances[target] = 0;
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head], cx = index % floor.size, cz = Math.floor(index / floor.size);
      for (const [nx,nz] of [[cx+1,cz],[cx-1,cz],[cx,cz+1],[cx,cz-1]]) {
        const next = nz * floor.size + nx;
        if (isWalkable(floor,nx,nz) && distances[next] < 0 && openEdge(cx,cz,nx,nz)) { distances[next] = distances[index]+1; queue.push(next); }
      }
    }
    field = {target, barriers, distances}; fields.set(floor,field);
  }
  const cx = Math.floor(x), cz = Math.floor(z);
  let best = Infinity, result: {x:number;z:number} | null = null;
  for (const [nx,nz] of [[cx+1,cz],[cx-1,cz],[cx,cz+1],[cx,cz-1]]) {
    if (!isWalkable(floor,nx,nz) || !openEdge(cx,cz,nx,nz)) continue;
    const distance = field.distances[nz*floor.size+nx];
    if (distance >= 0 && distance < best) { best=distance; result={x:nx+.5-x,z:nz+.5-z}; }
  }
  return result;
}

export function invalidateNavigation(floor: FloorData): void { fields.delete(floor); }
