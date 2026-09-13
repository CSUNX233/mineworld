import { EnemyTactics } from './EnemyTactics';
import { MonsterAI } from './MonsterAI';
import { directionToPlayer } from '../world/Navigation';
import { monsterAggression, monsterPursuitRate } from './EnemyIntent';
import * as THREE from 'three';
import type { ElementType, FloorData, Room } from '../types';
import type { Monster } from './Monster';
import type { Player } from '../player/Player';
import { SANCTUM_MONSTERS } from '../data/SanctumMonsters';
import { sanctumThroneSlots } from '../data/SanctumChapter';
import { findEncounterRoomPosition } from '../world/EncounterBarriers';
import { isWalkable } from '../world/FloorGenerator';
import { roomContainsPoint } from '../world/RoomGeometry';
import { worldRayDistance } from '../world/SpatialQueries';
import { disposeSanctumObject, hasReachableSanctumSafety, inSector, sanctumSector, segmentDistanceSquared } from './SanctumGeometry';

type Attack = 'none' | 'melee' | 'echo' | 'mark_follow' | 'mark_lock' | 'blade_warning' | 'blade_out' | 'blade_pause' | 'blade_back' | 'coffin' | 'ridge' | 'summon';
type Point = { x: number; z: number };

export interface SanctumHost {
  damagePlayer(amount: number, element: ElementType, statusChance?: number, source?: Monster): void;
  damageMelee?(amount: number, source: Monster): void;
  summonMourner(position: THREE.Vector3, source: Monster): void;
  /** Boss-owned adds are removed without damage, corpses or another reward. */
  dismissOwnedMinions(source: Monster): void;
  showMessage(title: string, subtitle?: string): void;
}

/** JSON-only one-time flags and slots survive; restore always cancels unfinished damage. */
export interface SanctumState {
  phase: number;
  cooldown: number;
  cycle: number;
  reinforcementUsed: boolean;
  stagger: number;
  exposed: number;
  slots: (Point & { cooldown: number })[];
  attack: Attack;
  remaining: number;
  elapsed: number;
  originX: number;
  originZ: number;
  directionX: number;
  directionZ: number;
  length: number;
  damage: number;
  hit: boolean;
  step: number;
  radius: number;
  points: Point[];
}

export function validSanctumState(value: unknown): value is SanctumState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  const numeric = ['phase', 'cooldown', 'cycle', 'stagger', 'exposed', 'remaining', 'elapsed', 'originX', 'originZ',
    'directionX', 'directionZ', 'length', 'damage', 'step', 'radius'];
  if (numeric.some(key => typeof state[key] !== 'number' || !Number.isFinite(state[key]))) return false;
  if (typeof state.reinforcementUsed !== 'boolean' || typeof state.hit !== 'boolean') return false;
  if (!['none', 'melee', 'echo', 'mark_follow', 'mark_lock', 'blade_warning', 'blade_out', 'blade_pause', 'blade_back', 'coffin', 'ridge', 'summon'].includes(String(state.attack))) return false;
  const pointValid = (point: unknown) => !!point && typeof point === 'object'
    && Number.isFinite((point as Point).x) && Number.isFinite((point as Point).z);
  return Array.isArray(state.points) && state.points.length <= 6 && state.points.every(pointValid)
    && Array.isArray(state.slots) && state.slots.length <= 3 && state.slots.every(point => pointValid(point)
      && Number.isFinite((point as Point & { cooldown: number }).cooldown));
}

interface Runtime {
  state: SanctumState;
  warnings: THREE.Group | null;
  decoration: THREE.Group | null;
  slotsVisual: THREE.Group | null;
  owner: Monster;
  previousPlayer: { x: number; y: number; z: number } | null;
}

function initialState(cooldown = 1.6): SanctumState {
  return { phase: 1, cooldown, cycle: 0, reinforcementUsed: false, stagger: 0, exposed: 0,
    slots: [], attack: 'none', remaining: 0, elapsed: 0, originX: 0, originZ: 0,
    directionX: 0, directionZ: 1, length: 0, damage: 0, hit: false, step: 0, radius: 0, points: [] };
}

/** Owns every attack and warning in the chapter; Game retains shared damage/status/reward handling. */
export class SanctumController {
  private runtimes = new Map<Monster, Runtime>();
  private ids = new Set(SANCTUM_MONSTERS.map(def => def.id));

  constructor(private scene: THREE.Scene, private rng: () => number) {}

  handles(monster: Monster): boolean { return this.ids.has(monster.def.id); }

  damageMultiplier(monster: Monster): number { return (this.runtimes.get(monster)?.state.exposed ?? 0) > 0 ? 1.15 : 1; }

  snapshot(monster: Monster): SanctumState | undefined {
    const state = this.runtimes.get(monster)?.state;
    return state ? { ...state, points: state.points.map(p => ({ ...p })), slots: state.slots.map(p => ({ ...p })) } : undefined;
  }

  restore(monster: Monster, saved: SanctumState): void {
    const runtime = this.ensure(monster);
    this.cancel(runtime, 2.5);
    const state = { ...initialState(), ...saved };
    state.phase = Math.max(1, Math.min(3, Number.isFinite(state.phase) ? state.phase : 1));
    state.cycle = Math.max(0, Number.isFinite(state.cycle) ? Math.floor(state.cycle) : 0);
    state.cooldown = Math.max(2.5, Number.isFinite(state.cooldown) ? state.cooldown : 2.5);
    state.reinforcementUsed = !!state.reinforcementUsed;
    state.slots = Array.isArray(state.slots) ? state.slots.filter(p => Number.isFinite(p.x) && Number.isFinite(p.z)).slice(0, 3)
      .map(p => ({ x: p.x, z: p.z, cooldown: Number.isFinite(p.cooldown) ? Math.max(0, p.cooldown) : 0 })) : [];
    state.attack = 'none'; state.remaining = 0; state.elapsed = 0; state.hit = false; state.step = 0; state.points = [];
    state.stagger = 0; state.exposed = 0;
    runtime.state = state;
    runtime.previousPlayer = null;
    if (runtime.slotsVisual) disposeSanctumObject(runtime.slotsVisual);
    runtime.slotsVisual = null;
  }

  onDeath(monster: Monster, host: SanctumHost): void {
    const runtime = this.runtimes.get(monster);
    if (runtime) { this.disposeRuntime(runtime); this.runtimes.delete(monster); }
    if (monster.def.id === 'bellkeeper') host.dismissOwnedMinions(monster);
  }

  /** Clear at encounter completion and floor teardown; never wait for the second echo. */
  clear(): void {
    for (const runtime of this.runtimes.values()) this.disposeRuntime(runtime);
    this.runtimes.clear();
  }

  update(dt: number, monster: Monster, player: Player, floor: FloorData, host: SanctumHost, attackDamage: number): void {
    if (!this.handles(monster)) return;
    if (monster.dead) { this.onDeath(monster, host); return; }
    const runtime = this.ensure(monster), state = runtime.state;
    const room = floor.rooms.find(candidate => candidate.id === monster.roomId);
    if (!room || dt <= 0) return;
    dt = Math.max(0, dt);
    const oldPlayer = runtime.previousPlayer;
    runtime.previousPlayer = { x: player.position.x, y: player.position.y, z: player.position.z };
    if (!player.alive) { this.cancel(runtime, 2.5); monster.velocity.set(0, 0, 0); return; }
    if (monster.def.id === 'bellkeeper') {
      this.ensureSlots(runtime, room, floor);
      const ratio = monster.health / Math.max(1, monster.maxHealth);
      const phase = ratio > 0.7 ? 1 : ratio > 0.35 ? 2 : 3;
      if (phase !== state.phase) {
        this.cancel(runtime, 2.5); state.phase = phase;
        host.showMessage(phase === 2 ? '末代司钟人 · 借名葬仪' : '末代司钟人 · 最后的送葬',
          phase === 2 ? '把葬印留在外侧刻槽，令钟体失衡' : '短线骨脊可跳过，也可横移避开');
      }
    }
    // Frost slows preparation and locomotion; committed ground echoes retain their announced rhythm.
    const preparationDt = dt * Math.max(0.2, Math.min(1, monster.slowMultiplier));
    state.cooldown = Math.max(0, state.cooldown - preparationDt * (monster.def.behavior === 'boss' ? 2 : 1) * monsterAggression(monster));
    state.stagger = Math.max(0, state.stagger - dt); state.exposed = Math.max(0, state.exposed - dt);
    for (const slot of state.slots) slot.cooldown = Math.max(0, slot.cooldown - dt);
    this.updateSlotAppearance(runtime);
    if (state.attack !== 'none') {
      monster.velocity.set(0, 0, 0);
      this.updateAttack(dt, runtime, player, floor, room, host, oldPlayer);
      return;
    }
    if (state.stagger > 0) { monster.velocity.set(0, 0, 0); return; }
    if (monster.def.id === 'coffin_bearer' && state.cooldown <= 0 && !state.reinforcementUsed && monster.health < monster.maxHealth * 0.5) {
      this.startSummon(runtime, player, floor, room, 2, 'coffin'); return;
    }
    if (monster.def.id === 'bellkeeper' && state.cooldown <= 0 && state.phase === 3 && !state.reinforcementUsed) {
      this.startSummon(runtime, player, floor, room, 6, 'summon'); return;
    }
    const distance = monster.position.distanceTo(new THREE.Vector3(player.position.x, 0, player.position.z));
    if (state.cooldown <= 0 && distance <= monster.def.attackRange && distance <= monster.def.detectRadius
      && EnemyTactics.lineClear(monster.position, player.position, floor)
      && EnemyTactics.canStartAttack(monster, 1.5)) {
      this.startAttack(runtime, player, floor, room, Math.max(1, attackDamage));
    }
    if (state.attack === 'none') this.advance(dt, monster, player, floor, room);
  }

  private ensure(monster: Monster): Runtime {
    let runtime = this.runtimes.get(monster);
    if (!runtime) {
      runtime = { state: initialState(1.5 + this.rng() * 1.5), warnings: null, decoration: null, slotsVisual: null,
        owner: monster, previousPlayer: null };
      this.runtimes.set(monster, runtime);
      runtime.decoration = this.decorate(monster);
    }
    return runtime;
  }

  private startAttack(runtime: Runtime, player: Player, floor: FloorData, room: Room, damage: number): void {
    const state = runtime.state, monster = runtime.owner, id = monster.def.id;
    let attack: Attack = id === 'bell_acolyte' ? 'echo' : id === 'epitaph_attendant' ? 'mark_follow'
      : id === 'returning_blade' ? 'blade_warning' : id === 'name_digger' ? 'ridge' : 'melee';
    if (id === 'bellkeeper') {
      attack = state.phase === 1 ? (state.cycle % 2 === 0 ? 'melee' : 'echo')
        : state.phase === 2 ? (state.cycle % 3 === 0 ? 'mark_follow' : state.cycle % 3 === 1 ? 'echo' : 'melee')
          : ['mark_follow', 'echo', 'ridge'][state.cycle % 3] as Attack;
    }
    if (this.busy(room.id, runtime, attack === 'echo' ? 'echo' : attack === 'mark_follow' || attack === 'ridge' || attack === 'blade_warning' ? 'space' : 'none')) {
      state.cooldown = 0.7; return;
    }
    state.originX = monster.position.x; state.originZ = monster.position.z;
    const dx = player.position.x - state.originX, dz = player.position.z - state.originZ, length = Math.hypot(dx, dz);
    state.directionX = length > 1e-6 ? dx / length : 0; state.directionZ = length > 1e-6 ? dz / length : 1;
    state.damage = damage; state.hit = false; state.step = 0; state.elapsed = 0;
    state.radius = id === 'bellkeeper' ? 4.2 : attack === 'melee' ? monster.def.attackRange : 3.2;
    state.length = Math.min(attack === 'ridge' ? 4.5 : 8, worldRayDistance(floor,
      new THREE.Vector3(state.originX, 0.3, state.originZ), new THREE.Vector3(state.directionX, 0, state.directionZ), 8, 0.6));
    const warning = attack === 'echo' ? (floor.floor === 11 ? 1.35 : 1.1) : attack === 'melee' ? 0.7 : 1.2;
    if (attack !== 'mark_follow' && !hasReachableSanctumSafety(floor, room, player.position, warning,
      (x, z) => this.danger(state, attack, x, z) || this.otherDanger(runtime, x, z))) { state.cooldown = 1; return; }
    state.attack = attack; state.remaining = warning;
    if (attack === 'mark_follow') { state.originX = player.position.x; state.originZ = player.position.z; state.radius = 1.65; }
    state.cycle++;
    monster.faceToward(monster.position.x + state.directionX, monster.position.z + state.directionZ);
    this.drawWarning(runtime);
  }

  private busy(roomId: string | undefined, current: Runtime, category: 'echo' | 'space' | 'none'): boolean {
    if (category === 'none') return false;
    for (const runtime of this.runtimes.values()) {
      if (runtime === current || runtime.owner.dead || runtime.owner.roomId !== roomId) continue;
      const attack = runtime.state.attack;
      if (attack !== 'none' && runtime.state.elapsed < 0.55) return true;
      if (category === 'echo' ? attack === 'echo' : ['mark_follow', 'mark_lock', 'ridge', 'blade_warning', 'blade_out', 'blade_pause', 'blade_back'].includes(attack)) return true;
    }
    return false;
  }

  private otherDanger(current: Runtime, x: number, z: number): boolean {
    for (const runtime of this.runtimes.values()) {
      if (runtime === current || runtime.owner.dead || runtime.owner.roomId !== current.owner.roomId) continue;
      const attack = runtime.state.attack;
      if (attack === 'none' || attack === 'coffin' || attack === 'summon') continue;
      if (this.danger(runtime.state, attack, x, z)) return true;
    }
    return false;
  }

  private danger(state: SanctumState, attack: Attack, x: number, z: number): boolean {
    if (attack === 'mark_follow' || attack === 'mark_lock') return Math.hypot(x - state.originX, z - state.originZ) <= state.radius;
    if (attack === 'ridge' || attack.startsWith('blade')) return segmentDistanceSquared(x, z, state.originX, state.originZ,
      state.originX + state.directionX * state.length, state.originZ + state.directionZ * state.length) <= 0.6 ** 2;
    return inSector(x, z, state.originX, state.originZ, state.directionX, state.directionZ, state.radius, 1.05);
  }

  private updateAttack(dt: number, runtime: Runtime, player: Player, floor: FloorData, room: Room, host: SanctumHost,
    previous: { x: number; y: number; z: number } | null): void {
    const state = runtime.state;
    // Halve boss preparation only. Bone-ridge travel and moving blades keep their real speed.
    const boss = runtime.owner.def.behavior === 'boss';
    let preparationTime = dt;
    if (boss && state.attack === 'ridge') {
      const realPreparation = Math.min(dt, Math.max(0, 1.2 - state.elapsed) / 2);
      preparationTime += realPreparation;
    } else if (boss && !['blade_out', 'blade_back'].includes(state.attack)) preparationTime *= 2;
    const time = Math.min(preparationTime, Math.max(0, state.remaining));
    state.remaining -= time; state.elapsed += time;
    if (state.attack === 'mark_follow') {
      state.originX = player.position.x; state.originZ = player.position.z;
      if (runtime.warnings) runtime.warnings.position.set(state.originX, 0.075, state.originZ);
    }
    if (state.attack === 'blade_out' || state.attack === 'blade_back') {
      const duration = Math.max(0.1, state.length / 8);
      const oldProgress = Math.max(0, Math.min(1, (state.elapsed - time) / duration));
      const progress = Math.max(0, Math.min(1, state.elapsed / duration));
      const back = state.attack === 'blade_back';
      const a = state.length * (back ? 1 - oldProgress : oldProgress), b = state.length * (back ? 1 - progress : progress);
      const ax = state.originX + state.directionX * a, az = state.originZ + state.directionZ * a;
      const bx = state.originX + state.directionX * b, bz = state.originZ + state.directionZ * b;
      // Relative swept movement prevents a fast frame from passing through the blade unnoticed.
      const old = previous ?? player.position;
      if (!state.hit && segmentDistanceSquared(0, 0, ax - old.x, az - old.z, bx - player.position.x, bz - player.position.z) <= 0.6 ** 2
        && this.visible(floor, state.originX, state.originZ, player.position.x, player.position.z)) {
        host.damagePlayer(state.damage, 'physical', 0, runtime.owner); state.hit = true;
      }
      const blade = runtime.warnings?.getObjectByName('moving-blade');
      if (blade) blade.position.set(state.directionX * b, 0.4, state.directionZ * b);
    }
    if (state.attack === 'ridge') {
      const segmentDuration = 0.28;
      for (let i = 0; i < 3; i++) {
        const activation = 1.2 + i * segmentDuration;
        if (state.step > i || state.elapsed < activation) continue;
        state.step = i + 1;
        const a = state.length * i / 3, b = state.length * (i + 1) / 3;
        const fraction = time > 0 ? Math.max(0, Math.min(1, (activation - (state.elapsed - time)) / time)) : 1;
        const old = previous ?? player.position;
        const x = old.x + (player.position.x - old.x) * fraction;
        const z = old.z + (player.position.z - old.z) * fraction;
        const y = old.y + (player.position.y - old.y) * fraction;
        if (!state.hit && y <= 0.42 && segmentDistanceSquared(x, z,
          state.originX + state.directionX * a, state.originZ + state.directionZ * a,
          state.originX + state.directionX * b, state.originZ + state.directionZ * b) <= 0.6 ** 2
          && this.visible(floor, state.originX, state.originZ, x, z)) {
          host.damagePlayer(state.damage, 'physical', 0, runtime.owner); state.hit = true;
        }
        const segment = runtime.warnings?.getObjectByName(`ridge-${i}`);
        if (segment instanceof THREE.Mesh) (segment.material as THREE.MeshBasicMaterial).color.setHex(0xffd79a);
      }
    }
    this.pulseWarning(runtime);
    if (state.remaining > 1e-6) return;
    // Each transition gets a complete display interval even after a delayed frame.
    if (state.attack === 'melee') { this.hitArea(runtime, player, floor, host, 1); this.finish(runtime, runtime.owner.def.id === 'bellkeeper' ? 2 : runtime.owner.def.attackCooldown); }
    else if (state.attack === 'echo') {
      this.hitArea(runtime, player, floor, host, state.step === 0 ? 0.6 : 0.5);
      if (state.step === 0) {
        state.step = 1; state.remaining = floor.floor === 11 ? 1.25 : 0.9; state.elapsed = 0; this.drawWarning(runtime);
      } else this.finish(runtime, runtime.owner.def.id === 'bellkeeper' ? state.phase === 3 ? 2.5 : 2 : 1.8);
    } else if (state.attack === 'mark_follow') {
      if (!roomContainsPoint(room, state.originX, state.originZ) || !hasReachableSanctumSafety(floor, room, player.position, 1,
        (x, z) => this.danger(state, 'mark_lock', x, z) || this.otherDanger(runtime, x, z))) { this.finish(runtime, 7); return; }
      state.attack = 'mark_lock'; state.remaining = 1; state.elapsed = 0; this.drawWarning(runtime);
    } else if (state.attack === 'mark_lock') {
      this.hitArea(runtime, player, floor, host, 1);
      if (runtime.owner.def.id === 'bellkeeper') {
        const slot = state.slots.find(p => p.cooldown <= 0 && Math.hypot(p.x - state.originX, p.z - state.originZ) <= 1.1);
        if (slot && state.stagger <= 0) {
          slot.cooldown = 12; state.stagger = 3; state.exposed = 3;
          host.showMessage('钟体失衡', '刻槽接住葬印，3 秒内伤害提高 15%');
        }
      }
      this.finish(runtime, runtime.owner.def.id === 'bellkeeper' ? 3 : 7);
    } else if (state.attack === 'blade_warning') {
      state.attack = 'blade_out'; state.remaining = Math.max(0.1, state.length / 8); state.elapsed = 0; this.drawWarning(runtime);
    } else if (state.attack === 'blade_out') {
      state.attack = 'blade_pause'; state.remaining = 0.5; state.elapsed = 0;
    } else if (state.attack === 'blade_pause') {
      state.attack = 'blade_back'; state.remaining = Math.max(0.1, state.length / 8); state.elapsed = 0;
    } else if (state.attack === 'blade_back') this.finish(runtime, 2);
    else if (state.attack === 'ridge') this.finish(runtime, runtime.owner.def.id === 'bellkeeper' ? 2.5 : 6);
    else if (state.attack === 'coffin' || state.attack === 'summon') {
      if (!state.reinforcementUsed) {
        state.reinforcementUsed = true;
        for (const point of state.points) host.summonMourner(new THREE.Vector3(point.x, 0, point.z), runtime.owner);
      }
      this.finish(runtime, 3);
    }
  }

  private hitArea(runtime: Runtime, player: Player, floor: FloorData, host: SanctumHost, multiplier: number): void {
    const state = runtime.state;
    if (this.danger(state, state.attack, player.position.x, player.position.z)
      && this.visible(floor, state.originX, state.originZ, player.position.x, player.position.z)) {
      if (state.attack === 'melee' && host.damageMelee) host.damageMelee(state.damage * multiplier, runtime.owner);
      else host.damagePlayer(state.damage * multiplier, state.attack === 'mark_lock' ? 'frost' : 'physical', 0, runtime.owner);
    }
  }

  private startSummon(runtime: Runtime, player: Player, floor: FloorData, room: Room, count: number, kind: 'coffin' | 'summon'): void {
    const state = runtime.state;
    state.points = [];
    const angleOffset = this.rng() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const angle = angleOffset + i * Math.PI * 2 / count;
      const point = findEncounterRoomPosition(floor, room, runtime.owner.position.x + Math.cos(angle) * 3,
        runtime.owner.position.z + Math.sin(angle) * 3);
      if (point && Math.hypot(point.x - player.position.x, point.z - player.position.z) >= 1.8
        && !state.points.some(p => Math.hypot(p.x - point.x, p.z - point.z) < 0.9)) state.points.push(point);
    }
    // Fill available room cells if the preferred ring meets a wall or the player.
    for (let z = room.z + 1; z < room.z + room.depth - 1 && state.points.length < count; z++) {
      for (let x = room.x + 1; x < room.x + room.width - 1 && state.points.length < count; x++) {
        const point = { x: x + 0.5, z: z + 0.5 };
        if (!isWalkable(floor, x, z) || !roomContainsPoint(room, point.x, point.z)
          || Math.hypot(point.x - player.position.x, point.z - player.position.z) < 2.5
          || state.points.some(p => Math.hypot(p.x - point.x, p.z - point.z) < 1.2)) continue;
        state.points.push(point);
      }
    }
    state.attack = kind; state.originX = runtime.owner.position.x; state.originZ = runtime.owner.position.z;
    state.remaining = 1.3; state.elapsed = 0; this.drawWarning(runtime);
  }

  private visible(floor: FloorData, ax: number, az: number, bx: number, bz: number): boolean {
    const distance = Math.hypot(bx - ax, bz - az);
    return distance < 1e-6 || worldRayDistance(floor, new THREE.Vector3(ax, 0.25, az),
      new THREE.Vector3((bx - ax) / distance, 0, (bz - az) / distance), distance) >= distance - 0.05;
  }

  private advance(dt: number, monster: Monster, player: Player, floor: FloorData, room: Room): void {
    const distance = Math.hypot(player.position.x-monster.position.x, player.position.z-monster.position.z);
    monster.faceToward(player.position.x, player.position.z);
    monster.velocity.set(0, 0, 0);
    if (dt <= 0 || distance > monster.def.detectRadius || distance < .01) return;
    const ranged = monster.def.attackRange > 4;
    const visible = EnemyTactics.lineClear(monster.position, player.position, floor);
    let target = EnemyTactics.pursuitTarget(monster, player.position, floor);
    if (ranged && visible && distance < 2.8) {
      target = { x: monster.position.x+(monster.position.x-player.position.x)/distance*2,
        z: monster.position.z+(monster.position.z-player.position.z)/distance*2 };
    } else if (visible && distance <= monster.def.attackRange*.85) {
      target = { x: monster.position.x, z: monster.position.z };
    }
    let dx = target.x-monster.position.x, dz = target.z-monster.position.z;
    if(dx*dx+dz*dz>.0001)monster.movementAttempted=true;
    if (!EnemyTactics.lineClear(monster.position, target, floor, .4)) {
      const next = directionToPlayer(floor, monster.position.x, monster.position.z, target.x, target.z);
      if (!next) return;
      dx = next.x; dz = next.z;
    }
    const length = Math.hypot(dx, dz);
    const direction = EnemyTactics.movementDirection(monster, length > .01 ? dx/length : 0, length > .01 ? dz/length : 0, floor);
    MonsterAI.moveWithAvoidance(monster, dt, direction.x, direction.z,
      monster.def.speed*monster.speedMultiplier*monster.slowMultiplier*monsterPursuitRate(monster), floor);
  }

  private finish(runtime: Runtime, cooldown: number): void {
    this.cancel(runtime, runtime.owner.def.id === 'bellkeeper' && runtime.state.phase === 3 ? Math.max(2.5, cooldown) : cooldown);
  }

  private cancel(runtime: Runtime, cooldown: number): void {
    if (runtime.warnings) disposeSanctumObject(runtime.warnings);
    runtime.warnings = null;
    const state = runtime.state;
    state.attack = 'none'; state.remaining = 0; state.elapsed = 0; state.hit = false; state.step = 0; state.points = [];
    state.cooldown = Math.max(state.cooldown, cooldown);
    const held = runtime.decoration?.getObjectByName('held-blade');
    if (held) held.visible = true;
  }

  private disposeRuntime(runtime: Runtime): void {
    this.cancel(runtime, 2.5);
    if (runtime.decoration) disposeSanctumObject(runtime.decoration);
    if (runtime.slotsVisual) disposeSanctumObject(runtime.slotsVisual);
    runtime.decoration = null; runtime.slotsVisual = null;
  }

  private material(color = 0xf4a267, opacity = 0.4): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  }

  private flat(group: THREE.Group, geometry: THREE.BufferGeometry, x = 0, z = 0, color = 0xf4a267, opacity = 0.4): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, this.material(color, opacity));
    mesh.position.set(x, 0, z); mesh.renderOrder = 8; group.add(mesh); return mesh;
  }

  private ring(group: THREE.Group, radius: number, x = 0, z = 0, color = 0xf4a267): THREE.Mesh {
    const mesh = this.flat(group, new THREE.RingGeometry(Math.max(0.01, radius - 0.065), radius, 40), x, z, color, 0.85);
    mesh.rotation.x = -Math.PI / 2; return mesh;
  }

  private drawWarning(runtime: Runtime): void {
    if (runtime.warnings) disposeSanctumObject(runtime.warnings);
    const state = runtime.state, group = new THREE.Group();
    group.name = `sanctum-${state.attack}-warning`;
    group.position.set(state.originX, 0.075, state.originZ); this.scene.add(group); runtime.warnings = group;
    if (state.attack === 'mark_follow' || state.attack === 'mark_lock') {
      const disc = this.flat(group, new THREE.CircleGeometry(state.radius, 40), 0, 0, 0xee987b, 0.2); disc.rotation.x = -Math.PI / 2;
      this.ring(group, state.radius);
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2;
        const tick = this.flat(group, new THREE.BoxGeometry(0.35, 0.025, 0.06), Math.cos(angle) * (state.radius - 0.25), Math.sin(angle) * (state.radius - 0.25), 0xffe3ae, 0.9);
        tick.rotation.y = -angle;
      }
      if (state.attack === 'mark_lock') this.ring(group, state.radius * 0.75, 0, 0, 0xffe3ae).name = 'countdown-ring';
    } else if (state.attack === 'echo' || state.attack === 'melee') {
      this.flat(group, sanctumSector(state.radius, 1.05, state.directionX, state.directionZ));
      // Double outlines mean a repeated strike; identical direction/radius persist through the second hit.
      if (state.attack === 'echo') {
        this.flat(group, sanctumSector(state.radius, 1.05, state.directionX, state.directionZ), 0, 0, 0xffd79a, 0.15).position.y = 0.01;
        for (const radius of [state.radius, state.radius - 0.18]) {
          const points = Array.from({ length: 33 }, (_, i) => {
            const angle = Math.atan2(state.directionZ, state.directionX) - 1.05 + 2.1 * i / 32;
            return new THREE.Vector3(Math.cos(angle) * radius, 0.02, Math.sin(angle) * radius);
          });
          const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: state.step === 0 ? 0xffd79a : 0xff8167, depthTest: false })); group.add(outline);
        }
      }
    } else if (state.attack === 'ridge' || state.attack.startsWith('blade')) {
      const angle = Math.atan2(state.directionZ, state.directionX);
      for (let i = 0; i < 3; i++) {
        const distance = state.length * (i + 0.5) / 3;
        const segment = this.flat(group, new THREE.BoxGeometry(state.length / 3, 0.025, 1.2),
          state.directionX * distance, state.directionZ * distance, 0xf4a267, 0.28);
        segment.rotation.y = -angle; segment.name = `ridge-${i}`;
        if (state.attack === 'ridge') {
          for (const offset of [-0.2, 0, 0.2]) {
            const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.35, 4), this.material(0xaaa38e, 0.65));
            tooth.position.set(state.directionX * (distance + offset), 0.18, state.directionZ * (distance + offset)); group.add(tooth);
          }
        }
      }
      this.ring(group, 0.6, state.directionX * state.length, state.directionZ * state.length);
      this.ring(group, 0.6);
      if (state.attack.startsWith('blade')) {
        const blade = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.09, 4, 12, Math.PI * 1.5), this.material(0xffe3ae, 0.9));
        blade.rotation.x = -Math.PI / 2; blade.position.y = 0.4; blade.name = 'moving-blade';
        blade.visible = state.attack !== 'blade_warning'; group.add(blade);
        // Two direction chevrons distinguish the return route without relying on color.
        for (const sign of [1, -1]) {
          const arrow = this.flat(group, new THREE.ConeGeometry(0.18, 0.45, 3), state.directionX * state.length * (sign === 1 ? 0.3 : 0.7), state.directionZ * state.length * (sign === 1 ? 0.3 : 0.7), 0xffe3ae, 0.9);
          arrow.rotation.z = Math.PI / 2; arrow.rotation.y = -angle + (sign < 0 ? Math.PI : 0);
        }
      }
      if (state.attack === 'ridge') state.remaining = Math.max(state.remaining, 1.2 + 0.28 * 3);
    } else {
      for (const point of state.points) {
        this.ring(group, 0.65, point.x - state.originX, point.z - state.originZ);
        const tick = this.flat(group, new THREE.BoxGeometry(0.6, 0.025, 0.08), point.x - state.originX, point.z - state.originZ, 0xffe3ae, 0.85); tick.rotation.y = Math.PI / 4;
      }
    }
  }

  private pulseWarning(runtime: Runtime): void {
    const group = runtime.warnings;
    if (!group) return;
    const state = runtime.state;
    const held = runtime.decoration?.getObjectByName('held-blade');
    if (held) held.visible = !['blade_out', 'blade_pause', 'blade_back'].includes(state.attack);
    const ring = group.getObjectByName('countdown-ring');
    if (ring) ring.scale.setScalar(Math.max(0.05, state.remaining));
    for (const child of group.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      const material = child.material as THREE.MeshBasicMaterial;
      material.opacity = child.name === 'moving-blade' ? 0.9 : 0.35 + Math.sin(state.elapsed * 9) * 0.08;
    }
  }

  private ensureSlots(runtime: Runtime, room: Room, floor: FloorData): void {
    const state = runtime.state;
    if (!state.slots.length) {
      for (const preferred of sanctumThroneSlots(room)) {
        const point = findEncounterRoomPosition(floor, room, preferred.x, preferred.z);
        if (point) state.slots.push({ ...point, cooldown: 0 });
      }
    }
    if (runtime.slotsVisual) return;
    const group = new THREE.Group(); group.name = 'bellkeeper-optional-slots'; this.scene.add(group); runtime.slotsVisual = group;
    for (let i = 0; i < state.slots.length; i++) {
      const point = state.slots[i];
      // Square ceremonial corners avoid resembling an enemy circular damage warning.
      const slot = new THREE.Group(); slot.position.set(point.x, 0.055, point.z); slot.name = `slot-${i}`; group.add(slot);
      for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
        this.flat(slot, new THREE.BoxGeometry(0.4, 0.025, 0.1), x, z, 0x72c6c3, 0.8);
        this.flat(slot, new THREE.BoxGeometry(0.1, 0.025, 0.4), x, z, 0x72c6c3, 0.8);
      }
    }
  }

  private updateSlotAppearance(runtime: Runtime): void {
    for (let i = 0; i < runtime.state.slots.length; i++) {
      runtime.slotsVisual?.getObjectByName(`slot-${i}`)?.traverse(child => {
        if (child instanceof THREE.Mesh) (child.material as THREE.MeshBasicMaterial).color.setHex(runtime.state.slots[i].cooldown > 0 ? 0x506966 : 0x72c6c3);
      });
    }
  }

  private decorate(monster: Monster): THREE.Group {
    const group = new THREE.Group(); group.name = 'sanctum-silhouette'; monster.group.add(group);
    const add = (geometry: THREE.BufferGeometry, color: number, x: number, y: number, z: number): THREE.Mesh => {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color })); mesh.position.set(x, y, z); group.add(mesh); return mesh;
    };
    const id = monster.def.id;
    if (id === 'sanctum_mourner') {
      add(new THREE.ConeGeometry(0.34, 0.6, 4), 0xaaa38e, 0, 1.7, 0.15).rotation.x = 0.3;
      add(new THREE.BoxGeometry(0.08, 0.65, 0.08), 0x506966, 0.35, 0.7, 0.22);
    } else if (id === 'bell_acolyte' || id === 'bellkeeper') {
      const boss = id === 'bellkeeper';
      const bell = add(new THREE.CylinderGeometry(boss ? 0.45 : 0.2, boss ? 0.65 : 0.34, boss ? 1.1 : 0.5, 8, 1, true), 0xa08048,
        boss ? 0 : -0.52, boss ? 1.7 : 1.25, boss ? -0.45 : 0.1);
      (bell.material as THREE.Material).dispose();
      bell.material = new THREE.MeshLambertMaterial({ color: 0xa08048, side: THREE.DoubleSide });
      add(new THREE.BoxGeometry(0.1, boss ? 1.4 : 0.7, 0.1), 0xaaa38e, 0.52, 1.05, 0.3);
      add(new THREE.BoxGeometry(boss ? 0.6 : 0.32, 0.2, 0.24), 0xaaa38e, 0.52, boss ? 1.75 : 1.4, 0.3);
      if (boss) {
        add(new THREE.ConeGeometry(0.28, 0.3, 5, 1, true), 0xa08048, 0, 1.7, -0.5);
        add(new THREE.BoxGeometry(0.15, 0.8, 0.08), 0x20262b, 0.1, 1.7, -1.03).rotation.z = 0.3;
      }
    } else if (id === 'epitaph_attendant') {
      const veil = add(new THREE.BoxGeometry(0.65, 1.2, 0.08), 0x506966, 0, 1.45, -0.25);
      (veil.material as THREE.Material).dispose();
      veil.material = new THREE.MeshLambertMaterial({ color: 0x506966, transparent: true, opacity: 0.75 });
      add(new THREE.BoxGeometry(0.33, 0.5, 0.08), 0xaaa38e, 0.55, 1.55, 0.08).rotation.z = -0.2;
    } else if (id === 'returning_blade') {
      const blade = add(new THREE.TorusGeometry(0.6, 0.11, 4, 14, Math.PI * 1.5), 0xaaa38e, 0, 1.1, 0.4);
      blade.rotation.z = Math.PI / 4; blade.name = 'held-blade';
    } else if (id === 'coffin_bearer') {
      add(new THREE.BoxGeometry(0.75, 1.45, 0.38), 0x20262b, 0, 1.35, -0.45);
      add(new THREE.BoxGeometry(0.52, 1.2, 0.07), 0xaaa38e, 0, 1.35, -0.68);
      for (const x of [-0.43, 0.43]) add(new THREE.BoxGeometry(0.08, 1.6, 0.08), 0xa08048, x, 1.05, -0.4);
    } else {
      add(new THREE.BoxGeometry(0.65, 0.08, 0.4), 0x506966, 0, 0.13, 0.5);
      add(new THREE.BoxGeometry(0.1, 1.1, 0.1), 0xaaa38e, 0.35, 0.65, 0.5).rotation.z = -0.18;
    }
    return group;
  }
}
