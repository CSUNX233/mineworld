import { getEncounterBarriers, encounterBarrierRayDistance, type EncounterBarrier } from './EncounterBarriers';
import type { FloorData } from '../types';
import { isWalkable } from './FloorGenerator';

const MAX_TARGET_FIELDS = 16;
const DX = [1, -1, 0, 0], DZ = [0, 0, 1, -1];
interface NavigationCache {
  barriers: readonly EncounterBarrier[];
  targets: Map<number, Int16Array>;
  edges: Uint8Array;
  queue: Int32Array;
}
const fields = new WeakMap<FloorData, NavigationCache>();

/** Cache passable edges until the grid or encounter barriers change. Target choice is unchanged. */
function edgesAt(floor: FloorData, cache: NavigationCache, x: number, z: number): number {
  const inside = x >= 0 && z >= 0 && x < floor.size && z < floor.size;
  const index = z * floor.size + x;
  if (inside && cache.edges[index] !== 255) return cache.edges[index];
  let edges = 0;
  for (let side = 0; side < 4; side++) {
    if (!isWalkable(floor, x + DX[side], z + DZ[side])) continue;
    if (cache.barriers.length && encounterBarrierRayDistance(floor,
      { x: x + .5, y: 1, z: z + .5 }, { x: DX[side], y: 0, z: DZ[side] }, 1, .3) < 1) continue;
    edges |= 1 << side;
  }
  if (inside) cache.edges[index] = edges;
  return edges;
}

export function directionToPlayer(floor: FloorData, x: number, z: number, tx: number, tz: number): {x:number;z:number} | null {
  if (!isWalkable(floor, Math.floor(tx), Math.floor(tz))) return null;
  const size = floor.size, target = Math.floor(tz) * size + Math.floor(tx);
  const barriers = getEncounterBarriers(floor);
  let cache = fields.get(floor);
  if (!cache || cache.barriers !== barriers) {
    cache = { barriers, targets: new Map(), edges: new Uint8Array(size * size).fill(255), queue: new Int32Array(size * size) };
    fields.set(floor, cache);
  }
  let distances = cache.targets.get(target);
  if (!distances) {
    distances = new Int16Array(size * size).fill(-1);
    const queue = cache.queue;
    let tail = 1;
    queue[0] = target; distances[target] = 0;
    for (let head = 0; head < tail; head++) {
      const index = queue[head], cx = index % size, cz = Math.floor(index / size);
      const edges = edgesAt(floor, cache, cx, cz);
      for (let side = 0; side < 4; side++) {
        if (!(edges & (1 << side))) continue;
        const next = (cz + DZ[side]) * size + cx + DX[side];
        if (distances[next] < 0) { distances[next] = distances[index] + 1; queue[tail++] = next; }
      }
    }
    cache.targets.set(target, distances);
    if (cache.targets.size > MAX_TARGET_FIELDS) cache.targets.delete(cache.targets.keys().next().value!);
  } else {
    cache.targets.delete(target); cache.targets.set(target, distances);
  }
  const cx = Math.floor(x), cz = Math.floor(z), edges = edgesAt(floor, cache, cx, cz);
  let best = Infinity, result: {x:number;z:number} | null = null;
  for (let side = 0; side < 4; side++) {
    if (!(edges & (1 << side))) continue;
    const nx = cx + DX[side], nz = cz + DZ[side], distance = distances[nz * size + nx];
    if (distance >= 0 && distance < best) { best = distance; result = {x:nx+.5-x,z:nz+.5-z}; }
  }
  return result;
}

export function invalidateNavigation(floor: FloorData): void { fields.delete(floor); }
