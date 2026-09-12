import * as THREE from 'three';
import type { ElementType, FloorData } from '../../src/types';
import type { Monster } from '../../src/monsters/Monster';
import type { Player } from '../../src/player/Player';
import { worldRayDistance } from '../../src/world/SpatialQueries';
import type { FireModifiers } from './FireBuild';

export interface Projectile {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  damage: number;
  life: number;
  friendly: boolean;
  element?: ElementType;
  statusChance?: number;
  radius?: number;
  impact?: number;
  traveled: number;
  maxDistance?: number;
  sourceSkillId?: string;
  fireModifiers?: FireModifiers;
  piercesRemaining?: number;
  hitMonsterIds?: Set<number>;
}

/** Physics produces impacts; Game chooses damage, sound, particles and rewards. */
export function stepProjectile(projectile: Projectile, dt: number, floor: FloorData | null, monsters: Monster[], player: Player) {
  const speed = projectile.velocity.length();
  const direction = projectile.velocity.clone().normalize();
  const remaining = Math.max(0, (projectile.maxDistance ?? Infinity) - projectile.traveled);
  const step = Math.min(speed * dt, remaining, Math.max(0, projectile.life) * speed);
  const origin = projectile.position.clone();
  let travel = floor ? worldRayDistance(floor, origin, direction, step) : step;
  let hitWall = travel < step - 1e-6;
  let hitMonster: Monster | null = null;
  let hitPlayer = false;
  const ray = new THREE.Ray(origin, direction);
  const impact = new THREE.Vector3();
  const actorDistance = (position: THREE.Vector3, radius: number, height: number): number => {
    const bounds = new THREE.Box3(
      new THREE.Vector3(position.x - radius, position.y - 0.15, position.z - radius),
      new THREE.Vector3(position.x + radius, position.y + height, position.z + radius),
    );
    if (bounds.containsPoint(origin)) return 0;
    return ray.intersectBox(bounds, impact) ? origin.distanceTo(impact) : Infinity;
  };
  if (projectile.friendly) {
    for (const monster of monsters) {
      if (monster.dead || projectile.hitMonsterIds?.has(monster.id)) continue;
      const distance = actorDistance(monster.position, projectile.radius ?? 1.1,
        monster.def.behavior === 'boss' ? 3.2 : 2.2);
      if (distance < travel || (!hitWall && distance <= travel)) {
        travel = distance;
        hitMonster = monster;
        hitWall = false;
      }
    }
  } else {
    const distance = actorDistance(player.position, projectile.radius ?? 0.7, 1.95);
    if (distance < travel || (!hitWall && distance <= travel)) {
      travel = distance;
      hitPlayer = true;
      hitWall = false;
    }
  }
  if (hitMonster) {
    (projectile.hitMonsterIds ??= new Set<number>()).add(hitMonster.id);
  }
  projectile.position.addScaledVector(direction, travel);
  projectile.traveled += travel;
  projectile.life -= dt;
  return { hitWall, hitMonster, hitPlayer, expired: remaining <= step || projectile.life <= 0 };
}
