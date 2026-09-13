import { monsterPursuitRate } from './EnemyIntent';
import type { FloorData } from '../types';
import type { Player } from '../player/Player';
import type { Monster } from './Monster';
import { directionToPlayer } from '../world/Navigation';
import { roomContainsPoint } from '../world/RoomGeometry';
import { EnemyTactics } from './EnemyTactics';

export class MonsterAI {
  static update(monster: Monster, dt: number, player: Player, floor: FloorData): void {
    if (monster.dead || dt <= 0) return;
    const dx = player.position.x-monster.position.x,dz = player.position.z-monster.position.z,distance = Math.hypot(dx,dz);
    // An announced attack owns facing and position until resolution; LOS changes never cancel its warning.
    if (monster.state === 'attack' && monster.def.behavior !== 'boss') {
      monster.velocity.set(0,0,0);
      if (monster.attackWindup <= 0 && distance > monster.def.attackRange + (monster.def.behavior === 'ranged' ? 4 : .5)) {
        monster.state = 'chase'; monster.attackCooldown = Math.max(monster.attackCooldown,.4);
      }
      return;
    }
    if (distance < .001) { monster.velocity.set(0,0,0); return; }
    this.updateDetection(monster,distance,dt);
    if (monster.state !== 'chase' && monster.state !== 'attack') return;
    monster.faceToward(player.position.x,player.position.z);
    const room = floor.rooms.find(r => r.id === monster.roomId);
    const sameRoom = !room || roomContainsPoint(room,player.position.x,player.position.z);
    const hasLine = EnemyTactics.lineClear(monster.position,player.position,floor);
    if (monster.def.behavior === 'ranged') {
      this.updateRangedMovement(monster,dt,player,distance,floor,hasLine,sameRoom); return;
    }
    if (sameRoom && hasLine && monster.def.behavior !== 'boss' && distance <= monster.def.attackRange && monster.attackCooldown <= 0 && EnemyTactics.canStartAttack(monster)) {
      monster.state = 'attack'; monster.attackWindup = monster.def.behavior === 'charger' ? .65 : .45;
      monster.lastKnownPlayer = player.position.clone(); monster.velocity.set(0,0,0); return;
    }
    // Waiting melee allies hold their range instead of stacking through the player's center.
    if (sameRoom && hasLine && distance <= Math.max(.65,monster.def.attackRange*.8)) {
      const direction = EnemyTactics.movementDirection(monster,0,0,floor);
      this.moveWithAvoidance(monster,dt,direction.x,direction.z,this.speed(monster)*.35,floor); return;
    }
    this.pursue(monster,dt,EnemyTactics.pursuitTarget(monster,player.position,floor),floor);
  }

  private static updateDetection(monster: Monster, distance: number, dt: number): void {
    if (monster.state === 'idle' || monster.state === 'patrol') { if (distance < monster.def.detectRadius) monster.state = 'chase'; return; }
    if (monster.state !== 'chase') return;
    if (distance > monster.def.detectRadius*1.8) {
      monster.lostTargetTimer += dt;
      if (monster.lostTargetTimer > 3) { monster.state = 'patrol'; monster.lostTargetTimer = 0; monster.velocity.set(0,0,0); monster.clearFacing(); }
    } else monster.lostTargetTimer = 0;
  }

  private static speed(monster: Monster): number {
    return monster.def.speed*monster.speedMultiplier*monster.slowMultiplier*monsterPursuitRate(monster)*(monster.def.behavior === 'charger' ? 1.25 : 1);
  }

  private static pursue(monster: Monster, dt: number, target: {x:number;z:number}, floor: FloorData): void {
    let dx = target.x-monster.position.x,dz = target.z-monster.position.z;
    if(dx*dx+dz*dz>=.12*.12)monster.movementAttempted=true;
    if (!EnemyTactics.lineClear(monster.position,target,floor,.4)) {
      const next = directionToPlayer(floor,monster.position.x,monster.position.z,target.x,target.z);
      if (!next) { monster.velocity.set(0,0,0); return; }
      dx = next.x; dz = next.z;
    }
    const length = Math.hypot(dx,dz);
    if (length < .12) { monster.velocity.set(0,0,0); return; }
    const direction = EnemyTactics.movementDirection(monster,dx/length,dz/length,floor,monster.def.behavior !== 'boss');
    this.moveWithAvoidance(monster,dt,direction.x,direction.z,this.speed(monster),floor);
  }

  private static updateRangedMovement(monster: Monster, dt: number, player: Player, distance: number, floor: FloorData, hasLine: boolean, sameRoom: boolean): void {
    const range = monster.def.attackRange,minRange = Math.max(1.7,Math.min(4.2,range*.42));
    if (sameRoom && hasLine && distance <= range && monster.attackCooldown <= 0 && EnemyTactics.canStartAttack(monster,.7)) {
      monster.state = 'attack'; monster.attackWindup = .5; monster.lastKnownPlayer = player.position.clone(); monster.velocity.set(0,0,0); return;
    }
    const shelter = EnemyTactics.shelterTarget(monster,floor);
    if (shelter && Math.hypot(shelter.x-monster.position.x,shelter.z-monster.position.z) > .7) { this.pursue(monster,dt,shelter,floor); return; }
    if (!hasLine && sameRoom) { const perch = this.firingPosition(monster,player,floor); if (perch) { this.pursue(monster,dt,perch,floor); return; } }
    if (!sameRoom || distance > range || !hasLine) { this.pursue(monster,dt,EnemyTactics.targetInRoom(monster,player.position,floor),floor); return; }
    let x = 0,z = 0;
    if (distance < minRange) {
      x = (monster.position.x-player.position.x)/distance; z = (monster.position.z-player.position.z)/distance;
      const target = { x: monster.position.x+x*1.4,z: monster.position.z+z*1.4 };
      if (!EnemyTactics.positionClear(monster,floor,target.x,target.z)) {
        // Cornered archers use a lateral lane rather than retreating into the wall.
        const side = monster.id%2 ? 1 : -1,sideX = -z*side,sideZ = x*side;
        if (EnemyTactics.positionClear(monster,floor,monster.position.x+sideX,monster.position.z+sideZ)) { x = sideX; z = sideZ; } else { x = 0; z = 0; }
      }
    }
    const direction = EnemyTactics.movementDirection(monster,x,z,floor);
    this.moveWithAvoidance(monster,dt,direction.x,direction.z,this.speed(monster),floor);
  }

  private static firingPosition(monster: Monster, player: Player, floor: FloorData): {x:number;z:number} | null {
    const base = Math.atan2(player.position.z-monster.position.z,player.position.x-monster.position.x);
    let best: {x:number;z:number} | null = null,bestScore = Infinity;
    for (const turn of [-Math.PI/2,Math.PI/2,-Math.PI/4,Math.PI/4,0,Math.PI]) {
      const point = { x: monster.position.x+Math.cos(base+turn)*1.8,z: monster.position.z+Math.sin(base+turn)*1.8 };
      if (!EnemyTactics.positionClear(monster,floor,point.x,point.z) || !EnemyTactics.lineClear(monster.position,point,floor,.4) || !EnemyTactics.lineClear(point,player.position,floor)) continue;
      const range = Math.hypot(point.x-player.position.x,point.z-player.position.z),score = Math.abs(range-monster.def.attackRange*.65);
      if (score < bestScore) { best = point; bestScore = score; }
    }
    return best;
  }

  /** Shared controller movement uses sequential axis resolution and swept steps to avoid corner tunneling. */
  static moveWithAvoidance(monster: Monster, dt: number, dirX: number, dirZ: number, speed: number, floor: FloorData): void {
    const length = Math.hypot(dirX,dirZ);
    if (dt <= 0 || speed <= 0 || length < .001) { monster.velocity.set(0,0,0); return; }
    monster.movementAttempted=true;
    dirX /= length; dirZ /= length;
    const oldX = monster.position.x,oldZ = monster.position.z,travel = speed*dt,steps = Math.max(1,Math.ceil(travel/.18)),step = travel/steps;
    for (let i = 0; i < steps; i++) {
      const x = monster.position.x,z = monster.position.z;
      if (EnemyTactics.positionClear(monster,floor,x+dirX*step,z)) monster.position.x += dirX*step;
      // Z is tested against the already resolved X instead of the original origin.
      if (EnemyTactics.positionClear(monster,floor,monster.position.x,z+dirZ*step)) monster.position.z += dirZ*step;
      if (monster.position.x === x && monster.position.z === z) {
        for (const side of [monster.id%2 ? 1 : -1,monster.id%2 ? -1 : 1]) {
          const sideX = -dirZ*side,sideZ = dirX*side,nextX = x+sideX*step*.55,nextZ = z+sideZ*step*.55;
          if (EnemyTactics.positionClear(monster,floor,nextX,nextZ)) { monster.position.x = nextX; monster.position.z = nextZ; break; }
        }
      }
    }
    monster.velocity.set((monster.position.x-oldX)/dt,0,(monster.position.z-oldZ)/dt);
  }

  static shouldDealMelee(monster: Monster): boolean { return monster.state === 'attack' && monster.attackWindup <= 0 && monster.def.behavior !== 'ranged' && monster.def.behavior !== 'boss'; }
  static shouldShoot(monster: Monster): boolean { return monster.state === 'attack' && monster.attackWindup <= 0 && monster.def.behavior === 'ranged'; }
}
