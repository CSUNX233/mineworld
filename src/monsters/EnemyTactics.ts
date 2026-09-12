import * as THREE from 'three';
import type { FloorData, Room } from '../types';
import type { Monster } from './Monster';
import type { Projectile } from '../combat/ProjectileSystem';
import { monsterAggression } from './EnemyIntent';
import { BlockKind } from '../world/Block';
import { roomContainsPoint } from '../world/RoomGeometry';
import { encounterBarrierBlocksCylinder } from '../world/EncounterBarriers';
import { worldRayDistance } from '../world/SpatialQueries';

interface Position { x: number; z: number; y?: number }
interface ActorPlan { dodgeCooldown: number; dodgeRemaining: number; dodgeX: number; dodgeZ: number; reserve: number; lastAttack: number }
interface RoomPlan { allies: Monster[]; active: number; ranged: number; nextAttack: number }

/** Shared room awareness, bounded attack pressure and fallible reactions to visible projectiles. */
export class EnemyTactics {
  private static floor: FloorData | null = null;
  private static player: Position = { x: 0, z: 0 };
  private static rooms = new Map<string, RoomPlan>();
  private static actors = new WeakMap<Monster, ActorPlan>();
  private static projectiles: readonly Projectile[] = [];
  private static clock = 0;
  private static roomMasks = new Map<string, Room>();

  static beginFrame(monsters: readonly Monster[], player: { position: Position }, floor: FloorData, projectiles: readonly Projectile[], dt: number): void {
    if (floor !== this.floor) { this.floor = floor; this.rooms.clear(); this.clock = 0; this.roomMasks = new Map(floor.rooms.map(r => [r.id!,r])); }
    this.clock += Math.max(0,dt); this.player = player.position;
    this.projectiles = projectiles.filter(p => p.friendly && p.life > 0).slice(0,32);
    for (const plan of this.rooms.values()) { plan.allies = []; plan.active = 0; plan.ranged = 0; }
    for (const monster of monsters) {
      if (monster.dead) continue;
      const actor = this.actor(monster);
      actor.dodgeCooldown = Math.max(0,actor.dodgeCooldown-dt); actor.dodgeRemaining = Math.max(0,actor.dodgeRemaining-dt); actor.reserve = Math.max(0,actor.reserve-dt);
      let room = this.rooms.get(monster.roomId);
      if (!room) { room = { allies: [],active: 0,ranged: 0,nextAttack: 0 }; this.rooms.set(monster.roomId,room); }
      room.allies.push(monster);
      if (monster.def.behavior !== 'boss' && (monster.state === 'attack' || actor.reserve > 0)) { room.active++; if (monster.def.behavior === 'ranged') room.ranged++; }
    }
  }

  private static actor(monster: Monster): ActorPlan {
    let plan = this.actors.get(monster);
    if (!plan) { plan = { dodgeCooldown: .65 + monster.id % 5 * .19,dodgeRemaining: 0,dodgeX: 0,dodgeZ: 0,reserve: 0,lastAttack: -monster.id*.001 }; this.actors.set(monster,plan); }
    return plan;
  }

  /** Call only before a new attack warning; established casts never consult this permission. */
  static canStartAttack(monster: Monster, reservation = .65): boolean {
    if (monster.def.behavior === 'boss') return true;
    const room = this.rooms.get(monster.roomId);
    if (!room) return true;
    const mask = this.roomMasks.get(monster.roomId);
    if (mask && !roomContainsPoint(mask,this.player.x,this.player.z)) return false;
    const appetite = monsterAggression(monster);
    // Keep simultaneous threats stable: tiers change cadence by 20%, not attack count by 50%.
    const concurrency = 2;
    if (room.active >= concurrency || this.clock < room.nextAttack || (monster.def.behavior === 'ranged' && room.ranged >= 2)) return false;
    // Waiting melee allies rotate priority, preventing update-array order from monopolizing slots.
    const specialist = (m: Monster): boolean => m.def.role === 'controller' || ['bell_acolyte','coffin_bearer','name_digger','ram_beast','valve_overseer'].includes(m.def.id);
    if ((monster.def.behavior === 'melee' || monster.def.behavior === 'charger') && !specialist(monster)) {
      const ready = room.allies.filter(m => m.def.behavior !== 'boss' && m.def.behavior !== 'ranged' && !specialist(m) && m.state === 'chase' && m.attackCooldown <= 0 && Math.hypot(m.position.x-this.player.x,m.position.z-this.player.z) <= m.def.attackRange);
      ready.sort((a,b) => this.actor(a).lastAttack-this.actor(b).lastAttack);
      if (ready.length && ready[0] !== monster) return false;
    }
    const actor = this.actor(monster); actor.lastAttack = this.clock; actor.reserve = Math.max(.35,reservation);
    room.active++; if (monster.def.behavior === 'ranged') room.ranged++;
    room.nextAttack = this.clock + .23 / appetite;
    return true;
  }

  static targetInRoom(monster: Monster, target: Position, floor: FloorData): Position {
    const room = floor.rooms.find(r => r.id === monster.roomId);
    if (!room || roomContainsPoint(room,target.x,target.z)) return target;
    let best = { x: monster.homePosition.x,z: monster.homePosition.z }, distance = Infinity;
    for (const cell of room.cells ?? []) {
      if (floor.grid[cell.z]?.[cell.x] !== BlockKind.Floor && floor.grid[cell.z]?.[cell.x] !== BlockKind.Portal) continue;
      const next = { x: cell.x+.5,z: cell.z+.5 }, score = (next.x-target.x)**2+(next.z-target.z)**2;
      if (score < distance && this.positionClear(monster,floor,next.x,next.z)) { distance = score; best = next; }
    }
    return best;
  }

  static pursuitTarget(monster: Monster, target: Position, floor: FloorData): Position {
    const scoped = this.targetInRoom(monster,target,floor);
    if (scoped !== target || monster.def.behavior === 'boss' || monster.def.behavior === 'ranged') return scoped;
    const distance = Math.hypot(target.x-monster.position.x,target.z-monster.position.z);
    if (distance < monster.def.attackRange*1.35) return scoped;
    const allies = this.rooms.get(monster.roomId)?.allies.filter(m => m.def.behavior !== 'ranged' && m.def.behavior !== 'boss') ?? [];
    if (allies.length < 2) return scoped;
    const index = allies.indexOf(monster), angle = Math.atan2(monster.homePosition.z-target.z,monster.homePosition.x-target.x) + ((index%3)-1)*.65;
    const range = Math.max(.8,monster.def.attackRange*.8), point = { x: target.x+Math.cos(angle)*range,z: target.z+Math.sin(angle)*range };
    return this.positionClear(monster,floor,point.x,point.z) ? point : scoped;
  }

  static shelterTarget(monster: Monster, floor: FloorData): Position | null {
    if (monster.def.role !== 'support') return null;
    const guardian = this.rooms.get(monster.roomId)?.allies.filter(m => m.def.role === 'guardian').sort((a,b) => a.position.distanceToSquared(monster.position)-b.position.distanceToSquared(monster.position))[0];
    if (!guardian) return null;
    const dx = guardian.position.x-this.player.x,dz = guardian.position.z-this.player.z,length = Math.hypot(dx,dz);
    if (length < .5) return null;
    const point = { x: guardian.position.x+dx/length*1.65,z: guardian.position.z+dz/length*1.65 };
    return this.positionClear(monster,floor,point.x,point.z) && this.lineClear(monster.position,point,floor,.4) ? point : null;
  }

  static lineClear(a: Position, b: Position, floor: FloorData, radius = 0): boolean {
    const dx = b.x-a.x,dz = b.z-a.z,distance = Math.hypot(dx,dz);
    return distance < .01 || worldRayDistance(floor,new THREE.Vector3(a.x,1,a.z),new THREE.Vector3(dx/distance,0,dz/distance),distance,radius) >= distance-.03;
  }

  static positionClear(monster: Monster, floor: FloorData, x: number, z: number, radius = .4): boolean {
    const room = floor.rooms.find(r => r.id === monster.roomId);
    if (room && !roomContainsPoint(room,x,z)) return false;
    if (encounterBarrierBlocksCylinder(floor,x,z,radius)) return false;
    for (let gz = Math.floor(z-radius); gz <= Math.floor(z+radius); gz++) for (let gx = Math.floor(x-radius); gx <= Math.floor(x+radius); gx++) {
      const kind = floor.grid[gz]?.[gx];
      if (kind === undefined) return false;
      // Air and unknown tile kinds are holes/non-navigable space, even though they are not solid walls.
      if (kind === BlockKind.Floor || kind === BlockKind.Portal) continue;
      const nx = Math.max(gx,Math.min(x,gx+1)), nz = Math.max(gz,Math.min(z,gz+1));
      if ((x-nx)**2+(z-nz)**2 < radius**2-1e-8) return false;
    }
    return true;
  }

  /** A short ordinary-speed sidestep, never prediction of unseen or instant future attacks. */
  static movementDirection(monster: Monster, preferredX: number, preferredZ: number, floor: FloorData, allowDodge = true): { x: number; z: number } {
    let x = preferredX,z = preferredZ;
    const actor = this.actor(monster);
    if (allowDodge && monster.def.behavior !== 'boss' && monster.def.role !== 'guardian' && monster.state !== 'attack' && monster.attackWindup <= 0) {
      if (actor.dodgeRemaining <= 0 && actor.dodgeCooldown <= 0) this.detectDodge(monster,actor,floor);
      if (actor.dodgeRemaining > 0) { x = actor.dodgeX; z = actor.dodgeZ; }
    }
    for (const ally of this.rooms.get(monster.roomId)?.allies ?? []) {
      if (ally === monster) continue;
      let dx = monster.position.x-ally.position.x,dz = monster.position.z-ally.position.z,distance = Math.hypot(dx,dz);
      if (distance >= 1.25) continue;
      if (distance < .01) { dx = monster.id < ally.id ? -1 : 1; dz = .3; distance = 1; }
      const strength = Math.min(.45,(1.25-distance)*.4); x += dx/distance*strength; z += dz/distance*strength;
    }
    const length = Math.hypot(x,z);
    return length > .01 ? { x: x/length,z: z/length } : { x: 0,z: 0 };
  }

  private static detectDodge(monster: Monster, actor: ActorPlan, floor: FloorData): void {
    for (const projectile of this.projectiles) {
      const dx = monster.position.x-projectile.position.x,dz = monster.position.z-projectile.position.z,distance = Math.hypot(dx,dz);
      if (distance < 1.5 || distance > 7 || projectile.position.y > monster.position.y+2.2 || projectile.position.y < monster.position.y-.1) continue;
      const speed = Math.hypot(projectile.velocity.x,projectile.velocity.z);
      if (speed < 1) continue;
      const vx = projectile.velocity.x/speed,vz = projectile.velocity.z/speed,along = dx*vx+dz*vz,side = Math.abs(dx*vz-dz*vx),time = along/speed;
      if (along <= 0 || time < .2 || time > .5 || side > .85 || !this.lineClear(projectile.position,monster.position,floor)) continue;
      // A deterministic reaction gap makes some shots land even when a lane is available.
      if ((monster.id+Math.floor(this.clock*1.6))%3 === 0) { actor.dodgeCooldown = .7; return; }
      for (const sign of [monster.id%2 ? 1 : -1,monster.id%2 ? -1 : 1]) {
        const x = -vz*sign,z = vx*sign,travel = monster.def.speed*monster.speedMultiplier*monster.slowMultiplier*.28;
        const point = { x: monster.position.x+x*travel,z: monster.position.z+z*travel };
        if (!this.positionClear(monster,floor,point.x,point.z) || !this.lineClear(monster.position,point,floor,.4)) continue;
        actor.dodgeX = x; actor.dodgeZ = z; actor.dodgeRemaining = .28; actor.dodgeCooldown = 2.8; return;
      }
      actor.dodgeCooldown = 1; return;
    }
  }
}
