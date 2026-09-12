import { monsterAggression } from './EnemyIntent';
import { FoundryEnemies } from './FoundryEnemies';
import { ValveOverseer } from './ValveOverseer';
import { EnemyTactics } from './EnemyTactics';
import type * as THREE from 'three';
import type { FloorData, Room } from '../types';
import { BlockKind } from '../world/Block';
import { roomContainsCell } from '../world/RoomGeometry';
import type { Monster } from './Monster';
import {
  createTetherVisual,
  createZoneVisual,
  disposeMechanicObject,
  setMechanicVisualPhase,
  updateTetherVisual,
} from './MechanicVisual';

const SUPPORT_RANGE = 8;
const SUPPORT_CHARGES = 3;
const SUPPORT_COOLDOWN = 8.5;
const SUPPORT_WINDUP = 1.35;
const CONTROLLER_COOLDOWN = 6.8;
const CONTROLLER_WINDUP = 1.2;
const ZONE_RADIUS = 1.75;
const ZONE_DURATION = 3.4;
const ZONE_TICK = 0.65;
const GUARDIAN_TURN_SPEED = 1.9;

export interface MechanicPlayer {
  position: { x: number; y?: number; z: number };
}

export interface EncounterMechanicsHost {
  addWorldObject(object: THREE.Object3D): void;
  removeWorldObject(object: THREE.Object3D): void;
  breakPanel?(x: number, z: number): boolean;
  damagePlayer(amount: number, cause: 'controller_zone' | 'foundry_steam' | 'foundry_beam' | 'foundry_charge' | 'foundry_low_wave'): void;
}

export type SerializedMechanicState =
  | { role: 'support'; cooldown: number; healsRemaining: number; interruptedCast?: boolean }
  | { role: 'guardian'; recovery: number }
  | { role: 'controller'; cooldown: number; interruptedCast?: boolean };

interface SupportState {
  role: 'support';
  cooldown: number;
  healsRemaining: number;
  castRemaining: number;
  target: Monster | null;
  tether: THREE.Line | null;
  cancelRequested: boolean;
}

interface GuardianState {
  role: 'guardian';
  recovery: number;
  wasAttacking: boolean;
  facingX: number;
  facingZ: number;
}

interface ControllerState {
  role: 'controller';
  cooldown: number;
  castRemaining: number;
  target: { x: number; z: number } | null;
  warning: THREE.Object3D | null;
  cancelRequested: boolean;
}

type MechanicState = SupportState | GuardianState | ControllerState;

interface ActiveZone {
  owner: Monster;
  x: number;
  z: number;
  radius: number;
  remaining: number;
  tickRemaining: number;
  visual: THREE.Object3D;
}

export class EncounterMechanics {
  private states = new WeakMap<Monster, MechanicState>();
  private foundry = new FoundryEnemies();
  private valves = new ValveOverseer();
  private zones: ActiveZone[] = [];
  private worldVisuals = new Set<THREE.Object3D>();
  private clock = 0;

  /** True while a support/controller is committed to a readable cast. Skip MonsterAI for it that frame. */
  handles(monster: Monster): boolean {
    if (this.valves.handles(monster) || this.foundry.handles(monster)) return true;
    const state = this.states.get(monster);
    return state?.role === 'support' && state.castRemaining > 0
      || state?.role === 'controller' && state.castRemaining > 0;
  }

  /** Call after MonsterAI and before Monster.update so the shield mesh uses the same limited-turn facing as damage checks. */
  afterAI(monster: Monster): void {
    const state = this.states.get(monster);
    if (state?.role !== 'guardian' || monster.dead) return;
    monster.faceToward(monster.position.x + state.facingX, monster.position.z + state.facingZ);
  }

  update(
    dt: number,
    monsters: Monster[],
    player: MechanicPlayer,
    floor: FloorData,
    host: EncounterMechanicsHost,
  ): void {
    this.clock += dt;
    this.valves.update(dt, monsters, player, floor, host);
    this.foundry.update(dt, monsters, player, floor, host);
    this.updateZones(dt, player, host);

    for (const monster of monsters) {
      if (!monster.def.role || this.valves.handles(monster) || this.foundry.handles(monster)) continue;
      const state = this.ensureState(monster);
      if (!state) continue;
      if (monster.dead) {
        this.cancelCast(state, host);
        continue;
      }
      if (state.role === 'support') this.updateSupport(dt, monster, state, monsters, host);
      else if (state.role === 'guardian') this.updateGuardian(dt, monster, state, player);
      else this.updateController(dt, monster, state, player, floor, host);
    }
  }

  /** Use only for direct player hits. Status ticks, detonations and splash intentionally bypass this. */
  onDirectHit(monster: Monster, sourcePosition: { x: number; z: number }, rawDamage: number): number {
    const supplied = this.foundry.directHit(monster, rawDamage);
    if (this.foundry.handles(monster)) return supplied;
    return Math.min(supplied, this.baseDirectHit(monster, sourcePosition, rawDamage));
  }

  private baseDirectHit(monster: Monster, sourcePosition: { x: number; z: number }, rawDamage: number): number {
    if (this.valves.handles(monster)) { this.valves.interrupt(monster); return rawDamage; }
    const state = this.ensureState(monster);
    if (!state) return rawDamage;
    if (state.role === 'support' || state.role === 'controller') {
      if (state.castRemaining > 0) state.cancelRequested = true;
      return rawDamage;
    }
    if (monster.state === 'attack' || state.recovery > 0) return rawDamage;

    const sourceX = sourcePosition.x - monster.position.x;
    const sourceZ = sourcePosition.z - monster.position.z;
    const sourceLength = Math.hypot(sourceX, sourceZ);
    const facingLength = Math.hypot(state.facingX, state.facingZ);
    if (sourceLength < 0.001 || facingLength < 0.001) return rawDamage;
    const dot = (sourceX * state.facingX + sourceZ * state.facingZ) / (sourceLength * facingLength);
    return dot >= Math.cos(70 * Math.PI / 180) ? Math.max(1, Math.round(rawDamage * 0.38)) : rawDamage;
  }

  serialize(monster: Monster): SerializedMechanicState | undefined {
    if (this.foundry.handles(monster)) return this.foundry.serialize(monster);
    if (this.valves.handles(monster)) return this.valves.serialize(monster);
    const state = this.ensureState(monster);
    if (!state) return undefined;
    if (state.role === 'support') return {
      role: 'support',
      cooldown: Math.max(0, state.cooldown),
      healsRemaining: state.healsRemaining,
      interruptedCast: state.castRemaining > 0,
    };
    if (state.role === 'guardian') return { role: 'guardian', recovery: Math.max(0, state.recovery) };
    return {
      role: 'controller',
      cooldown: Math.max(0, state.cooldown),
      interruptedCast: state.castRemaining > 0,
    };
  }

  /** In-progress warnings are safely cancelled on load and converted to a short cooldown. */
  restore(monster: Monster, saved: SerializedMechanicState | undefined): void {
    if (this.foundry.handles(monster)) { this.foundry.restore(monster, saved); return; }
    if (this.valves.handles(monster)) { this.valves.restore(monster, saved); return; }
    if (!saved || saved.role !== monster.def.role) return;
    const state = this.ensureState(monster);
    if (!state) return;
    if (state.role === 'support' && saved.role === 'support') {
      state.cooldown = Math.max(saved.cooldown, saved.interruptedCast ? 3.5 : 0);
      state.healsRemaining = Math.max(0, Math.min(SUPPORT_CHARGES, saved.healsRemaining));
    } else if (state.role === 'guardian' && saved.role === 'guardian') {
      state.recovery = Math.max(0, saved.recovery);
    } else if (state.role === 'controller' && saved.role === 'controller') {
      state.cooldown = Math.max(saved.cooldown, saved.interruptedCast ? 3.5 : 0);
    }
  }

  clear(host?: EncounterMechanicsHost): void {
    this.valves.clear(host);
    this.foundry.clear(host);
    for (const visual of [...this.worldVisuals]) {
      if (host) host.removeWorldObject(visual);
      disposeMechanicObject(visual);
    }
    this.worldVisuals.clear();
    this.zones = [];
    this.states = new WeakMap();
  }

  private ensureState(monster: Monster): MechanicState | undefined {
    if (!monster.def.role) return undefined;
    let state = this.states.get(monster);
    if (state) return state;
    if (monster.def.role === 'support') {
      state = { role: 'support', cooldown: 2.5, healsRemaining: SUPPORT_CHARGES, castRemaining: 0, target: null, tether: null, cancelRequested: false };
    } else if (monster.def.role === 'guardian') {
      state = { role: 'guardian', recovery: 0, wasAttacking: false, facingX: 0, facingZ: 1 };
    } else {
      state = { role: 'controller', cooldown: 3.2, castRemaining: 0, target: null, warning: null, cancelRequested: false };
    }
    this.states.set(monster, state);
    return state;
  }

  private updateSupport(
    dt: number,
    monster: Monster,
    state: SupportState,
    monsters: Monster[],
    host: EncounterMechanicsHost,
  ): void {
    state.cooldown = Math.max(0, state.cooldown - dt * monsterAggression(monster));
    if (state.cancelRequested) {
      this.finishSupportCast(state, host);
      state.cooldown = Math.max(state.cooldown, 3.5);
      state.cancelRequested = false;
    }
    if (state.castRemaining > 0) {
      state.castRemaining -= dt;
      monster.velocity.set(0, 0, 0);
      setMechanicVisualPhase(monster, 'casting', this.clock);
      if (state.target && state.tether) updateTetherVisual(state.tether, monster.position, state.target.position);
      if (state.castRemaining <= 0) {
        const target = state.target;
        if (target && !target.dead && target.position.distanceTo(monster.position) <= SUPPORT_RANGE + 0.75) {
          const missing = Math.max(0, target.maxHealth - target.health);
          target.health += Math.min(missing, Math.max(8, target.maxHealth * 0.2));
          state.healsRemaining--;
        }
        this.finishSupportCast(state, host);
        state.cooldown = SUPPORT_COOLDOWN;
      }
      return;
    }
    setMechanicVisualPhase(monster, 'idle', this.clock);
    if (state.cooldown > 0 || state.healsRemaining <= 0 || monster.state === 'attack' || monster.attackWindup > 0) return;
    const target = monsters
      .filter(candidate => candidate !== monster && !candidate.dead && candidate.roomId === monster.roomId
        && candidate.health < candidate.maxHealth * 0.88 && candidate.position.distanceTo(monster.position) <= SUPPORT_RANGE)
      .sort((a, b) => a.health / a.maxHealth - b.health / b.maxHealth)[0];
    if (!target || !EnemyTactics.canStartAttack(monster, SUPPORT_WINDUP + .2)) return;
    state.target = target;
    state.castRemaining = SUPPORT_WINDUP;
    monster.velocity.set(0, 0, 0);
    state.tether = createTetherVisual();
    updateTetherVisual(state.tether, monster.position, target.position);
    this.addWorldVisual(state.tether, host);
  }

  private finishSupportCast(state: SupportState, host: EncounterMechanicsHost): void {
    if (state.tether) this.removeWorldVisual(state.tether, host);
    state.tether = null;
    state.target = null;
    state.castRemaining = 0;
  }

  private updateGuardian(dt: number, monster: Monster, state: GuardianState, player: MechanicPlayer): void {
    state.recovery = Math.max(0, state.recovery - dt);
    if (state.wasAttacking && monster.state !== 'attack') state.recovery = 0.8;
    state.wasAttacking = monster.state === 'attack';
    const dx = player.position.x - monster.position.x;
    const dz = player.position.z - monster.position.z;
    const length = Math.hypot(dx, dz);
    if (length > 0.001) {
      const targetAngle = Math.atan2(dx, dz);
      const currentAngle = Math.atan2(state.facingX, state.facingZ);
      let delta = targetAngle - currentAngle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const nextAngle = currentAngle + Math.max(-GUARDIAN_TURN_SPEED * dt, Math.min(GUARDIAN_TURN_SPEED * dt, delta));
      state.facingX = Math.sin(nextAngle);
      state.facingZ = Math.cos(nextAngle);
    }
    setMechanicVisualPhase(monster, monster.state === 'attack' || state.recovery > 0 ? 'exposed' : 'idle', this.clock);
  }

  private updateController(
    dt: number,
    monster: Monster,
    state: ControllerState,
    player: MechanicPlayer,
    floor: FloorData,
    host: EncounterMechanicsHost,
  ): void {
    state.cooldown = Math.max(0, state.cooldown - dt * monsterAggression(monster));
    if (state.cancelRequested) {
      this.finishControllerWarning(state, host);
      state.cooldown = Math.max(state.cooldown, 3.5);
      state.cancelRequested = false;
    }
    if (state.castRemaining > 0) {
      state.castRemaining -= dt;
      monster.velocity.set(0, 0, 0);
      setMechanicVisualPhase(monster, 'casting', this.clock);
      if (state.castRemaining <= 0 && state.target) {
        const target = state.target;
        this.finishControllerWarning(state, host);
        const visual = createZoneVisual(target.x, target.z, ZONE_RADIUS, 'active');
        this.addWorldVisual(visual, host);
        this.zones.push({ owner: monster, x: target.x, z: target.z, radius: ZONE_RADIUS, remaining: ZONE_DURATION, tickRemaining: 0, visual });
        state.cooldown = CONTROLLER_COOLDOWN;
      }
      return;
    }
    setMechanicVisualPhase(monster, 'idle', this.clock);
    if (state.cooldown > 0 || monster.state === 'attack' || monster.attackWindup > 0
      || !EnemyTactics.lineClear(monster.position, player.position, floor)
      || !this.canPlaceZone(monster, player.position.x, player.position.z, floor)
      || !EnemyTactics.canStartAttack(monster, CONTROLLER_WINDUP + .2)) return;
    state.target = { x: player.position.x, z: player.position.z };
    state.castRemaining = CONTROLLER_WINDUP;
    monster.velocity.set(0, 0, 0);
    state.warning = createZoneVisual(state.target.x, state.target.z, ZONE_RADIUS, 'warning');
    this.addWorldVisual(state.warning, host);
  }

  private finishControllerWarning(state: ControllerState, host: EncounterMechanicsHost): void {
    if (state.warning) this.removeWorldVisual(state.warning, host);
    state.warning = null;
    state.target = null;
    state.castRemaining = 0;
  }

  private canPlaceZone(monster: Monster, x: number, z: number, floor: FloorData): boolean {
    if (!this.isWalkable(floor, Math.floor(x), Math.floor(z))) return false;
    const room = floor.rooms.find(candidate => candidate.id === monster.roomId)
      ?? floor.rooms.find(candidate => roomContainsCell(candidate, Math.floor(monster.position.x), Math.floor(monster.position.z)));
    if (!room) return this.zones.length < 1;
    const cells = this.walkableRoomCells(room, floor);
    const maxZones = Math.max(1, Math.min(3, Math.floor(cells.length / 38)));
    const roomZones = this.zones.filter(zone => zone.owner.roomId === monster.roomId);
    if (roomZones.length >= maxZones || roomZones.some(zone => Math.hypot(zone.x - x, zone.z - z) < ZONE_RADIUS * 1.25)) return false;
    const safeCells = cells.filter(cell => {
      if (Math.hypot(cell.x + 0.5 - x, cell.z + 0.5 - z) <= ZONE_RADIUS + 0.25) return false;
      return roomZones.every(zone => Math.hypot(cell.x + 0.5 - zone.x, cell.z + 0.5 - zone.z) > zone.radius + 0.25);
    });
    return safeCells.length >= Math.max(6, Math.ceil(cells.length * 0.15));
  }

  private walkableRoomCells(room: Room, floor: FloorData): { x: number; z: number }[] {
    const source = room.cells ?? Array.from({ length: room.width * room.depth }, (_, index) => ({
      x: room.x + index % room.width,
      z: room.z + Math.floor(index / room.width),
    }));
    return source.filter(cell => this.isWalkable(floor, cell.x, cell.z));
  }

  private isWalkable(floor: FloorData, x: number, z: number): boolean {
    if (x < 0 || z < 0 || x >= floor.size || z >= floor.size) return false;
    const kind = floor.grid[z][x];
    return kind === BlockKind.Floor || kind === BlockKind.Portal;
  }

  private updateZones(dt: number, player: MechanicPlayer, host: EncounterMechanicsHost): void {
    for (let index = this.zones.length - 1; index >= 0; index--) {
      const zone = this.zones[index];
      zone.remaining -= dt;
      zone.tickRemaining -= dt;
      if (zone.owner.dead || zone.remaining <= 0) {
        this.removeWorldVisual(zone.visual, host);
        this.zones.splice(index, 1);
        continue;
      }
      if (zone.tickRemaining <= 0 && Math.hypot(player.position.x - zone.x, player.position.z - zone.z) <= zone.radius) {
        host.damagePlayer(Math.max(4, Math.round(zone.owner.def.attack * 0.55)), 'controller_zone');
        zone.tickRemaining = ZONE_TICK;
      }
    }
  }

  private cancelCast(state: MechanicState, host: EncounterMechanicsHost): void {
    if (state.role === 'support') this.finishSupportCast(state, host);
    else if (state.role === 'controller') this.finishControllerWarning(state, host);
  }

  private removeWorldVisual(object: THREE.Object3D, host: EncounterMechanicsHost): void {
    host.removeWorldObject(object);
    this.worldVisuals.delete(object);
    disposeMechanicObject(object);
  }

  private addWorldVisual(object: THREE.Object3D, host: EncounterMechanicsHost): void {
    this.worldVisuals.add(object);
    host.addWorldObject(object);
  }
}
