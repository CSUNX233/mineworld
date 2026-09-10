import type { FloorData } from '../types';
import type { Player } from '../player/Player';
import type { Monster } from './Monster';
import { BlockKind } from '../world/Block';
import { worldRayDistance } from '../world/SpatialQueries';
import { directionToPlayer } from '../world/Navigation';
import { encounterBarrierBlocksCylinder } from '../world/EncounterBarriers';

export class MonsterAI {
  static update(monster: Monster, dt: number, player: Player, floor: FloorData): void {
    if (monster.dead) return;

    const dx = player.position.x - monster.position.x;
    const dz = player.position.z - monster.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance < 0.0001) {
      monster.velocity.set(0, 0, 0);
      return;
    }

    this.updateDetection(monster, distance, dt);

    const origin = monster.position.clone(); origin.y += 1;
    const direction = player.position.clone().sub(monster.position); direction.y = 0; direction.normalize();
    if ((monster.state === 'chase' || monster.state === 'attack') && worldRayDistance(floor,origin,direction,distance) < distance-.05) {
      monster.state = 'chase';
      const next = directionToPlayer(floor,monster.position.x,monster.position.z,player.position.x,player.position.z);
      if (next) {
        const length = Math.hypot(next.x,next.z);
        if (length > .01) this.moveWithAvoidance(monster,dt,next.x/length,next.z/length,monster.def.speed*monster.speedMultiplier*monster.slowMultiplier,floor);
      }
      return;
    }

    if (monster.state === 'chase' || monster.state === 'attack') {
      monster.faceToward(player.position.x, player.position.z);
    }

    if (monster.state === 'attack') {
      this.updateAttack(monster, dt, player, distance);
      return;
    }
    if (monster.state !== 'chase') return;

    if (monster.def.behavior === 'ranged') {
      this.updateRangedMovement(monster, dt, dx, dz, distance, floor);
    } else {
      this.updateMeleeMovement(monster, dt, dx, dz, distance, floor);
    }
  }

  private static updateDetection(monster: Monster, distance: number, dt: number): void {
    if (monster.state === 'idle' || monster.state === 'patrol') {
      if (distance < monster.def.detectRadius) monster.state = 'chase';
      return;
    }

    if (monster.state === 'chase') {
      if (distance > monster.def.detectRadius * 1.8) {
        monster.lostTargetTimer += dt;
        if (monster.lostTargetTimer > 3) {
          monster.state = 'patrol';
          monster.lostTargetTimer = 0;
          monster.velocity.set(0, 0, 0);
          monster.clearFacing();
        }
      } else {
        monster.lostTargetTimer = 0;
      }
    }
  }

  private static updateMeleeMovement(
    monster: Monster,
    dt: number,
    dx: number,
    dz: number,
    distance: number,
    floor: FloorData,
  ): void {
    if (distance <= monster.def.attackRange && monster.attackCooldown <= 0) {
      monster.state = 'attack';
      monster.attackWindup = monster.def.behavior === 'charger' ? 0.65 : 0.45;
      monster.velocity.set(0, 0, 0);
      return;
    }

    const speed = monster.def.speed * monster.speedMultiplier * monster.slowMultiplier * (monster.def.behavior === 'charger' ? 1.25 : 1);
    const dirX = dx / distance;
    const dirZ = dz / distance;
    this.moveWithAvoidance(monster, dt, dirX, dirZ, speed, floor);
  }

  private static updateRangedMovement(
    monster: Monster,
    dt: number,
    dx: number,
    dz: number,
    distance: number,
    floor: FloorData,
  ): void {
    const attackRange = monster.def.attackRange;
    const preferredRange = Math.max(1.4, attackRange * 0.78);

    if (distance <= attackRange && monster.attackCooldown <= 0) {
      monster.state = 'attack';
      monster.attackWindup = 0.5;
      monster.velocity.set(0, 0, 0);
      return;
    }

    let dirX: number;
    let dirZ: number;
    if (distance < preferredRange) {
      dirX = -dx / distance;
      dirZ = -dz / distance;
    } else if (distance > attackRange) {
      dirX = dx / distance;
      dirZ = dz / distance;
    } else {
      dirX = -dz / distance;
      dirZ = dx / distance;
    }

    const speed = monster.def.speed * monster.speedMultiplier * monster.slowMultiplier;
    this.moveWithAvoidance(monster, dt, dirX, dirZ, speed, floor);
  }

  private static moveWithAvoidance(
    monster: Monster,
    dt: number,
    dirX: number,
    dirZ: number,
    speed: number,
    floor: FloorData,
  ): void {
    let velX = dirX * speed;
    let velZ = dirZ * speed;

    const nextX = monster.position.x + velX * dt;
    if (this.hitsWall(floor, nextX, monster.position.z, 0.4)) velX = 0;
    const nextZ = monster.position.z + velZ * dt;
    if (this.hitsWall(floor, monster.position.x, nextZ, 0.4)) velZ = 0;

    if (velX === 0 && velZ === 0) {
      const candidates = [
        { x: -dirZ, z: dirX },
        { x: dirZ, z: -dirX },
      ];
      for (const candidate of candidates) {
        const candidateX = monster.position.x + candidate.x * speed * 0.55 * dt;
        const candidateZ = monster.position.z + candidate.z * speed * 0.55 * dt;
        if (!this.hitsWall(floor, candidateX, monster.position.z, 0.4) && !this.hitsWall(floor, monster.position.x, candidateZ, 0.4)) {
          velX = candidate.x * speed * 0.55;
          velZ = candidate.z * speed * 0.55;
          break;
        }
      }
    }

    monster.velocity.set(velX, 0, velZ);
    monster.position.x += monster.velocity.x * dt;
    monster.position.z += monster.velocity.z * dt;
  }

  private static updateAttack(monster: Monster, dt: number, player: Player, distance: number): void {
    if (monster.attackWindup > 0) {
      return;
    }

    if (distance <= monster.def.attackRange + 0.5) {
      if (monster.def.behavior === 'ranged') {
        monster.lastKnownPlayer = player.position.clone();
      }
      return;
    }

    monster.state = 'chase';
  }

  static shouldDealMelee(monster: Monster): boolean {
    return monster.state === 'attack' && monster.attackWindup <= 0 && monster.def.behavior !== 'ranged';
  }

  static shouldShoot(monster: Monster): boolean {
    return monster.state === 'attack' && monster.attackWindup <= 0 && monster.def.behavior === 'ranged';
  }

  private static hitsWall(floor: FloorData, x: number, z: number, radius: number): boolean {
    if (encounterBarrierBlocksCylinder(floor, x, z, radius)) return true;
    const minX = Math.floor(x - radius);
    const maxX = Math.floor(x + radius);
    const minZ = Math.floor(z - radius);
    const maxZ = Math.floor(z + radius);
    for (let gz = minZ; gz <= maxZ; gz++) {
      for (let gx = minX; gx <= maxX; gx++) {
        if (gz < 0 || gz >= floor.size || gx < 0 || gx >= floor.size) return true;
        const kind = floor.grid[gz][gx];
        if (kind === BlockKind.Wall || kind === BlockKind.Obstacle) {
          if (x + radius > gx && x - radius < gx + 1 && z + radius > gz && z - radius < gz + 1) return true;
        }
      }
    }
    return false;
  }
}
