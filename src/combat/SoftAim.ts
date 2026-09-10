import * as THREE from 'three';
import type { Monster } from '../monsters/Monster';
import type { FloorData } from '../types';
import { worldRayDistance } from '../world/SpatialQueries';

/** Small forward cone, with target persistence; never changes camera rotation. */
export class SoftAim {
  private target: Monster | null = null;
  private previous = new THREE.Vector3();

  resolve(origin: THREE.Vector3, forward: THREE.Vector3, monsters: Monster[], floor: FloorData | null,
    range: number, enabled: boolean): { direction: THREE.Vector3; target: Monster | null } {
    if (!enabled || this.previous.dot(forward) < Math.cos(0.1)) this.target = null;
    this.previous.copy(forward);
    if (!enabled) return { direction: forward, target: null };
    let best = Infinity;
    let selected: Monster | null = null;
    for (const monster of monsters) {
      if (monster.dead) continue;
      const delta = monster.position.clone().sub(origin); delta.y = 0;
      const distance = delta.length();
      if (distance < 0.1 || distance > range) continue;
      delta.divideScalar(distance);
      const dot = forward.dot(delta);
      if (dot < Math.cos(0.2)) continue;
      const source = origin.clone(); source.y += 1.1;
      if (floor && worldRayDistance(floor, source, delta, distance) < distance - 0.05) continue;
      const score = 1 - dot + distance * 0.002 - (monster === this.target ? 0.012 : 0);
      if (score < best) { best = score; selected = monster; }
    }
    this.target = selected;
    if (!selected) return { direction: forward, target: null };
    const direction = selected.position.clone().sub(origin); direction.y = 0;
    return { direction: forward.clone().lerp(direction.normalize(), 0.65).normalize(), target: selected };
  }
}
