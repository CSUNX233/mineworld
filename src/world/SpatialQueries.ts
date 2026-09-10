import type { Vector3 } from 'three';
import type { FloorData } from '../types';
import { BlockKind } from './Block';

/** Distance to the first solid wall (height 2), map edge or ground.
 * Expanding the boxes gives the camera clearance for its near clipping plane. */
export function worldRayDistance(
  floor: FloorData, origin: Vector3, direction: Vector3, distance: number, radius = 0,
): number {
  let nearest = distance;
  if (direction.y < 0) nearest = Math.min(nearest, Math.max(0, (radius - origin.y) / direction.y));
  const endX = origin.x + direction.x * distance;
  const endZ = origin.z + direction.z * distance;
  const minX = Math.floor(Math.min(origin.x, endX) - radius);
  const maxX = Math.floor(Math.max(origin.x, endX) + radius);
  const minZ = Math.floor(Math.min(origin.z, endZ) - radius);
  const maxZ = Math.floor(Math.max(origin.z, endZ) + radius);
  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) {
      const outside = x < 0 || z < 0 || x >= floor.size || z >= floor.size;
      const kind = outside ? BlockKind.Wall : floor.grid[z][x];
      if (kind !== BlockKind.Wall && kind !== BlockKind.Obstacle) continue;
      let entry = 0;
      let exit = nearest;
      const bounds = [
        [origin.x, direction.x, x - radius, x + 1 + radius],
        [origin.y, direction.y, outside ? -Infinity : -radius, outside ? Infinity : 2 + radius],
        [origin.z, direction.z, z - radius, z + 1 + radius],
      ];
      for (const [start, delta, lo, hi] of bounds) {
        if (Math.abs(delta) < 1e-8) {
          if (start < lo || start > hi) { exit = -1; break; }
        } else {
          const a = (lo - start) / delta;
          const b = (hi - start) / delta;
          entry = Math.max(entry, Math.min(a, b));
          exit = Math.min(exit, Math.max(a, b));
        }
      }
      if (entry <= exit) nearest = Math.min(nearest, entry);
    }
  }
  return nearest;
}
