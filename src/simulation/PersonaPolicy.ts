import { cloneData } from '../utils/cloneData';
import * as THREE from 'three';
import { CraftingSystem } from '../items/CraftingSystem';
import { EquipmentManager, type DerivedStats } from '../items/EquipmentManager';
import type { FloorData, Item, Room, Slot } from '../types';
import { encounterBarrierRayDistance, getEncounterBarriers } from '../world/EncounterBarriers';
import { isWalkable } from '../world/FloorGenerator';
import { worldRayDistance } from '../world/SpatialQueries';

export type PersonaKind = 'novice' | 'expert';

/**
 * Fixed before a balance run. These are player-behaviour assumptions, never
 * bonuses to the character or changes to combat probabilities.
 */
export interface PersonaParameters {
  readonly reactionSeconds: readonly [number, number];
  readonly sightRadius: number;
  readonly memorySeconds: number;
  readonly preferredCombatRange: number;
  readonly warningAwareness: number;
  readonly aimErrorRadians: number;
  readonly shopsPerFloor: number;
  readonly purchasesPerShop: number;
  readonly chestsPerFloor: number;
  readonly healAtHealthRatio: number;
  readonly equipmentUpgradeMargin: number;
  readonly maxUpgradesPerFloor: number;
  readonly craftingGoldReserve: number;
  readonly talentPlan: readonly string[];
  readonly behaviour: string;
}

export const PERSONA_PARAMETERS: Readonly<Record<PersonaKind, PersonaParameters>> = Object.freeze({
  novice: Object.freeze({
    reactionSeconds: Object.freeze([0.5, 0.8] as const),
    sightRadius: 8,
    memorySeconds: 0.8,
    preferredCombatRange: 3.0,
    warningAwareness: 0.58,
    aimErrorRadians: 0.17,
    shopsPerFloor: 1,
    purchasesPerShop: 1,
    chestsPerFloor: 1,
    healAtHealthRatio: 0.48,
    equipmentUpgradeMargin: 1.5,
    maxUpgradesPerFloor: 0,
    craftingGoldReserve: 0,
    talentPlan: Object.freeze([
      'fire_seed', 'vital_spark', 'tempered_skin', 'spreading_flame', 'deep_reservoir',
      'ember_relay', 'wide_wildfire', 'many_sparks', 'lasting_embers',
    ]),
    behaviour: 'Uses nearby threats and visible warnings after a slow reaction; aims and paths coarsely, equips obvious upgrades, and follows the simpler spreading-fire talent path.',
  }),
  expert: Object.freeze({
    reactionSeconds: Object.freeze([0.15, 0.3] as const),
    sightRadius: 11,
    memorySeconds: 1.6,
    preferredCombatRange: 3.7,
    warningAwareness: 1,
    aimErrorRadians: 0.035,
    shopsPerFloor: 1,
    purchasesPerShop: 2,
    chestsPerFloor: 3,
    healAtHealthRatio: 0.66,
    equipmentUpgradeMargin: 0.4,
    maxUpgradesPerFloor: 1,
    craftingGoldReserve: 120,
    talentPlan: Object.freeze([
      'fire_seed', 'consuming_flame', 'searing_appetite', 'mana_from_ashes', 'ash_guard',
      'steady_flame', 'deep_reservoir', 'tempered_skin', 'cremation',
    ]),
    behaviour: 'Prioritises visible support threats, values complete loadouts and set breakpoints, pairs ignition with detonation, and reacts early to visible telegraphs.',
  }),
});

export interface PersonaPolicy {
  kind: PersonaKind;
  readonly stats?: Readonly<PersonaPolicyStats>;
  step(game: any, dt: number): void | Promise<void>;
  describe?(): unknown;
  reset?(): void;
}

export interface PersonaPolicyStats {
  equipmentChanges: number;
  skillPresses: Record<string, number>;
  talentsAllocated: number;
  shopVisits: number;
  shopPurchases: number;
  shopSales: number;
  shopHeals: number;
  interactions: number;
  pathFailures: number;
  navigationStalls: number;
  skillLoadoutChanges: number;
  itemsSalvaged: number;
  itemUpgrades: number;
}

function emptyStats(): PersonaPolicyStats {
  return {
    equipmentChanges: 0, skillPresses: {}, talentsAllocated: 0, shopVisits: 0,
    shopPurchases: 0, shopSales: 0, shopHeals: 0, interactions: 0,
    pathFailures: 0, navigationStalls: 0,
    skillLoadoutChanges: 0, itemsSalvaged: 0, itemUpgrades: 0,
  };
}

interface Point { x: number; z: number }
interface SeenTarget { monster: any; x: number; z: number; age: number }
interface VisibleWarning {
  kind: string;
  x: number;
  z: number;
  dx: number;
  dz: number;
  radius: number;
}

interface EquipmentOption { gain: number; targetSlot: Slot }

const PULSE_KEYS = ['KeyE', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'] as const;
class LocalRandom {
  private state: number;
  constructor(seed: number) { this.state = (seed >>> 0) || 0x9e3779b9; }
  next(): number {
    let value = this.state;
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 0x1_0000_0000;
  }
}

class GamePersonaPolicy implements PersonaPolicy {
  readonly kind: PersonaKind;
  readonly stats: PersonaPolicyStats = emptyStats();
  private readonly params: PersonaParameters;
  private readonly initialSeed: number;
  private random: LocalRandom;
  private reactionRemaining = 0;
  private floorObject: FloorData | null = null;
  private seen: SeenTarget | null = null;
  private shopsVisited = new Map<number, number>();
  private shopFloorInProgress = -1;
  private lastPosition: Point | null = null;
  private stuckSeconds = 0;
  private pathWasBlocked = false;
  private navigationGoal: Point | null = null;
  private patrolRoomId: string | null = null;
  private patrolIndex = 0;
  private upgradedFloors = new Map<number, number>();

  constructor(kind: PersonaKind, seed = 0x51a17e) {
    this.kind = kind;
    this.params = PERSONA_PARAMETERS[kind];
    this.initialSeed = (seed ^ (kind === 'expert' ? 0x45585054 : 0x4e4f5643)) >>> 0;
    this.random = new LocalRandom(this.initialSeed);
  }

  describe(): unknown {
    return { kind: this.kind, parameters: this.params, stats: cloneData(this.stats) };
  }

  reset(): void {
    this.random = new LocalRandom(this.initialSeed);
    this.reactionRemaining = 0;
    this.floorObject = null;
    this.seen = null;
    this.shopsVisited.clear();
    this.shopFloorInProgress = -1;
    Object.assign(this.stats, emptyStats());
    this.lastPosition = null;
    this.stuckSeconds = 0;
    this.pathWasBlocked = false;
    this.navigationGoal = null;
    this.patrolRoomId = null;
    this.patrolIndex = 0;
    this.upgradedFloors.clear();
  }

  step(game: any, dt: number): void | Promise<void> {
    const input = game?.input;
    if (!input) return;
    for (const key of PULSE_KEYS) input.release(key);

    const player = game.player;
    const floor = game.floorData as FloorData | null;
    if (!game.running || !player?.alive || game.loadingFloor || !floor) {
      this.stop(input, game.controller);
      return;
    }

    this.observeNavigation(game, Math.max(0, dt));

    if (this.floorObject !== floor) {
      this.floorObject = floor;
      this.reactionRemaining = 0;
      this.seen = null;
      this.shopFloorInProgress = -1;
      this.navigationGoal = null;
      this.patrolRoomId = null;
      this.patrolIndex = 0;
    }

    if (game.shopOpen) {
      this.handleShop(game);
      return;
    }
    if (game.restOpen) {
      this.prepareCharacter(game);
      this.stop(input, game.controller);
      game.closeFloorRest();
      return game.advanceFloor();
    }

    // A real equipment action renders the inventory panel. Close that panel in
    // the same way a player does before returning control to the next frame.
    if (game.inventoryUI?.open) game.inventoryUI.close();
    if (game.attributeOpen && game.closeAttributeAllocation) game.closeAttributeAllocation();

    this.ageMemory(Math.max(0, dt));
    this.reactionRemaining -= Math.max(0, dt);
    if (this.reactionRemaining > 0) {
      this.continueNavigation(game, floor);
      return;
    }
    this.reactionRemaining = this.reactionDelay();

    this.prepareCharacter(game);
    if (game.inventoryUI?.open) game.inventoryUI.close();

    const visible = this.visibleMonsters(game, floor);
    if (visible.length) {
      this.navigationGoal = null;
      const target = this.chooseTarget(player.position, visible);
      this.seen = { monster: target, x: target.position.x, z: target.position.z, age: 0 };
      this.fight(game, floor, target, visible);
      return;
    }

    const remembered = this.seen && this.seen.age <= this.params.memorySeconds && !this.seen.monster.dead
      ? this.seen : null;
    if (remembered) {
      this.startNavigation(game, floor, remembered);
      input.releaseMouse(0);
      return;
    }
    this.seen = null;
    input.releaseMouse(0);
    game.controller?.endTouchAim?.(true);

    const drop = this.nearestVisibleDrop(game, floor);
    if (drop) {
      this.startNavigation(game, floor, drop.position);
      return;
    }

    const label = game.interactionLabel?.() as string | null;
    if (label === '圣所恢复' || label === '打开宝箱' || label === '进入传送门') {
      this.navigationGoal = null;
      input.setAnalogMovement(0, 0);
      input.press('KeyE');
      this.stats.interactions++;
      return;
    }
    if (label === '进入商店') {
      const visits = this.shopsVisited.get(game.floor) ?? 0;
      if (visits < this.params.shopsPerFloor && this.shopFloorInProgress !== game.floor) {
        this.navigationGoal = null;
        input.setAnalogMovement(0, 0);
        this.shopFloorInProgress = game.floor;
        input.press('KeyE');
        this.stats.interactions++;
        return;
      }
    }

    const target = this.explorationTarget(game, floor);
    if (target) {
      this.startNavigation(game, floor, target);
      return;
    }
    this.stop(input, game.controller);
  }

  private reactionDelay(): number {
    const [minimum, maximum] = this.params.reactionSeconds;
    return minimum + (maximum - minimum) * this.random.next();
  }

  private ageMemory(dt: number): void {
    if (this.seen) this.seen.age += dt;
  }

  private observeNavigation(game: any, dt: number): void {
    const position = game.player.position as Point;
    const movement = game.input.movement as { x: number; y: number };
    const movementCommanded = Math.hypot(movement.x, movement.y) > 0.15;
    if (this.lastPosition && movementCommanded) {
      const distance = Math.hypot(position.x - this.lastPosition.x, position.z - this.lastPosition.z);
      this.stuckSeconds = distance < 0.012 ? this.stuckSeconds + dt : 0;
      if (this.stuckSeconds >= 1.5) {
        this.stats.navigationStalls++;
        this.stuckSeconds = 0;
        this.reactionRemaining = 0;
        this.navigationGoal = null;
        if (this.patrolRoomId) this.patrolIndex++;
      }
    } else this.stuckSeconds = 0;
    this.lastPosition = { x: position.x, z: position.z };
  }

  private stop(input: any, controller: any): void {
    input.setAnalogMovement(0, 0);
    input.release('ShiftLeft');
    input.releaseMouse(0);
    controller?.endTouchAim?.(true);
    this.navigationGoal = null;
  }

  private visibleMonsters(game: any, floor: FloorData): any[] {
    const player = game.player;
    return (game.monsters as any[]).filter(monster => {
      if (monster.dead) return false;
      const distance = Math.hypot(monster.position.x - player.position.x, monster.position.z - player.position.z);
      return distance <= this.params.sightRadius && this.hasLineOfSight(floor, player.position, monster.position);
    });
  }

  private nearestVisibleDrop(game: any, floor: FloorData): any | null {
    const player = game.player;
    return [...(game.drops as any[])]
      .filter(drop => (drop.kind !== 'item' || game.inventory.hasSpace())
        && Math.hypot(drop.position.x - player.position.x, drop.position.z - player.position.z) <= this.params.sightRadius
        && this.hasLineOfSight(floor, player.position, drop.position))
      .sort((a, b) => player.position.distanceToSquared(a.position) - player.position.distanceToSquared(b.position))[0] ?? null;
  }

  private hasLineOfSight(floor: FloorData, from: Point, to: Point): boolean {
    const dx = to.x - from.x, dz = to.z - from.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.05) return true;
    const origin = new THREE.Vector3(from.x, 1, from.z);
    const direction = new THREE.Vector3(dx / distance, 0, dz / distance);
    return worldRayDistance(floor, origin, direction, distance) >= distance - 0.05
      && encounterBarrierRayDistance(floor, origin, direction, distance, 0.1) >= distance - 0.05;
  }

  private chooseTarget(position: Point, monsters: any[]): any {
    return [...monsters].sort((a, b) => {
      if (this.kind === 'expert') {
        const priority = (monster: any): number => monster.def.role === 'support' ? 0
          : monster.def.role === 'controller' ? 1
            : monster.def.behavior === 'ranged' ? 2
              : monster.def.behavior === 'boss' ? 3 : 4;
        const difference = priority(a) - priority(b);
        if (difference) return difference;
        const healthDifference = a.health / a.maxHealth - b.health / b.maxHealth;
        if (Math.abs(healthDifference) > 0.15) return healthDifference;
      }
      return Math.hypot(a.position.x - position.x, a.position.z - position.z)
        - Math.hypot(b.position.x - position.x, b.position.z - position.z);
    })[0];
  }

  private fight(game: any, floor: FloorData, target: any, visible: any[]): void {
    const input = game.input;
    const player = game.player;
    const distance = Math.hypot(target.position.x - player.position.x, target.position.z - player.position.z);
    const weapon = game.equipment.get('weapon') as Item | null;
    const isStaff = Boolean(weapon && (weapon.name.includes('法杖') || weapon.id.startsWith('staff_') || weapon.id.startsWith('weapon_staff')));
    const basicRange = isStaff ? 9.5 : Number(game.getMeleeProfile?.(weapon)?.range ?? 4);
    const preferredRange = isStaff
      ? Math.min(this.params.preferredCombatRange + 2, basicRange - 0.5)
      : Math.min(this.params.preferredCombatRange, Math.max(1.2, basicRange - 0.35));
    this.aimAt(game, target.position);

    const warnings = this.visibleWarnings(game, visible);
    const inDanger = warnings.some(warning => this.warningContains(warning, player.position));
      const noticesWarning = inDanger && this.random.next() <= this.params.warningAwareness;
    if (noticesWarning) {
      const escape = this.escapeDirection(floor, player.position, warnings, visible);
      this.setWorldMovement(game, escape.x, escape.z, true);
      if (this.kind === 'expert') {
        const dash = (game.skills as any[]).find(skill => skill.id === 'dash');
        if (dash && dash.cooldownRemaining <= 0 && player.mana >= dash.manaCost) {
          // Dash follows aim, not movement. Commit this reaction to escaping;
          // firing other aimed skills here would send them away from the enemy.
          this.aimAt(game, { x: player.position.x + escape.x * 5, z: player.position.z + escape.z * 5 });
          input.releaseMouse(0);
          this.pressSkill(game, 'dash');
          return;
        }
      }
    } else {
      const dx = target.position.x - player.position.x;
      const dz = target.position.z - player.position.z;
      const length = Math.max(0.001, Math.hypot(dx, dz));
      let moveX = 0, moveZ = 0;
      if (distance > preferredRange + 0.7) {
        moveX = dx / length; moveZ = dz / length;
      } else if (distance < preferredRange - (this.kind === 'expert' ? 1.2 : 1.8)) {
        moveX = -dx / length; moveZ = -dz / length;
      } else {
        const side = this.kind === 'expert' ? (target.id % 2 ? 1 : -1) : (this.random.next() < 0.5 ? 1 : -1);
        const roughness = this.kind === 'expert' ? 1 : 0.55;
        moveX = -dz / length * side * roughness;
        moveZ = dx / length * side * roughness;
      }
      const safe = this.combatMovementDirection(floor, player.position, { x: moveX, z: moveZ });
      if (Math.hypot(safe.x, safe.z) < 0.001 && distance > basicRange) {
        // A target can be visible through a gap that the player's body cannot
        // cross. Follow the actual corridor instead of waiting out of range.
        this.startNavigation(game, floor, target.position);
      } else this.setWorldMovement(game, safe.x, safe.z, this.kind === 'expert');
    }

    if (distance <= basicRange) input.pressMouse(0); else input.releaseMouse(0);

    const burning = target.statuses?.some((status: any) => status.type === 'burning' && status.duration > 0);
    if (this.kind === 'expert') {
      const detonate = (game.skills as any[]).find(skill => skill.id === 'detonate');
      if (burning && distance <= 8 && detonate?.cooldownRemaining <= 0 && player.mana >= detonate.manaCost) this.pressSkill(game, 'detonate');
      else if (distance <= 9.5) this.pressSkill(game, 'fireball');
      if (distance <= 4.2 && visible.filter(monster => monster.position.distanceTo(player.position) <= 4.4).length >= 2) {
        this.pressSkill(game, 'whirlwind');
      }
      if (!noticesWarning && distance > 5 && distance < 8) this.pressSkill(game, 'dash');
      if (distance <= 4.6) this.pressSkill(game, 'frost_nova');
      if (distance <= 8) this.pressSkill(game, 'lightning_chain');
    } else {
      // A novice uses the available buttons, but without planning cooldown order.
      const roll = this.random.next();
      if (roll < 0.34 && distance <= 4.4) this.pressSkill(game, 'whirlwind');
      else if (roll < 0.56 && distance > 3.5 && distance < 7) this.pressSkill(game, 'dash');
      else if (roll < 0.86 && distance <= 9.5) this.pressSkill(game, 'fireball');
    }
  }

  private combatMovementDirection(floor: FloorData, position: Point, desired: Point): Point {
    const length = Math.hypot(desired.x, desired.z);
    if (length < 0.001) return { x: 0, z: 0 };
    const base = Math.atan2(desired.x, desired.z);
    const travel = this.kind === 'expert' ? 2.9 : 4.5;
    for (const turn of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) {
      const x = Math.sin(base + turn), z = Math.cos(base + turn);
      const origin = new THREE.Vector3(position.x, 1, position.z);
      const direction = new THREE.Vector3(x, 0, z);
      const clear = Math.min(
        worldRayDistance(floor, origin, direction, travel, 0.35),
        encounterBarrierRayDistance(floor, origin, direction, travel, 0.35),
      );
      if (clear >= travel - 0.1) return { x, z };
    }
    return { x: 0, z: 0 };
  }

  private pressSkill(game: any, id: string): void {
    const skill = (game.skills as any[])?.find(entry => entry.id === id);
    if (skill && skill.cooldownRemaining <= 0 && game.player.mana >= skill.manaCost) {
      game.input.press(skill.key);
      this.stats.skillPresses[id] = (this.stats.skillPresses[id] ?? 0) + 1;
    }
  }

  private aimAt(game: any, target: Point): void {
    const player = game.player.position;
    const ideal = Math.atan2(target.x - player.x, target.z - player.z);
    const error = (this.random.next() * 2 - 1) * this.params.aimErrorRadians;
    const desired = ideal + error;
    const cameraYaw = Number(game.controller?.cameraYaw ?? game.player.yaw ?? 0);
    const relative = cameraYaw - desired;
    game.controller?.setTouchAim?.(Math.sin(relative) * 100, -Math.cos(relative) * 100);
  }

  private visibleWarnings(game: any, visibleMonsters: any[]): VisibleWarning[] {
    const warnings: VisibleWarning[] = [];
    // Monster.update renders this same ring during a normal melee windup.
    // Omitting it would make the persona ignore information a player can see.
    for (const monster of visibleMonsters) {
      if (monster.state === 'attack' && monster.attackWindup > 0
        && monster.def.behavior !== 'boss' && monster.def.behavior !== 'ranged') {
        warnings.push({ kind: 'circle', x: monster.position.x, z: monster.position.z,
          dx: 0, dz: 0, radius: monster.def.attackRange + 0.5 });
      }
    }
    for (const warning of game.bossController?.warnings ?? []) {
      if (warning.kind === 'summon') continue;
      warnings.push({
        kind: warning.kind, x: warning.position.x, z: warning.position.z,
        dx: warning.direction.x, dz: warning.direction.z, radius: warning.radius,
      });
    }
    const finalState = game.finalBossController?.snapshot?.();
    for (const warning of finalState?.warnings ?? []) {
      if (warning.kind === 'reinforcement') continue;
      warnings.push({ kind: warning.kind, x: warning.x, z: warning.z, dx: warning.dx, dz: warning.dz, radius: warning.radius });
    }
    for (const zone of game.encounterMechanics?.zones ?? []) {
      warnings.push({ kind: 'zone', x: zone.x, z: zone.z, dx: 0, dz: 0, radius: zone.radius });
    }
    return warnings;
  }

  private warningContains(warning: VisibleWarning, point: Point): boolean {
    const dx = point.x - warning.x, dz = point.z - warning.z;
    const distance = Math.hypot(dx, dz);
    if (warning.kind === 'circle' || warning.kind === 'blast' || warning.kind === 'zone') {
      return distance <= warning.radius + 0.4;
    }
    if (warning.kind === 'dash') {
      const along = dx * warning.dx + dz * warning.dz;
      const across = Math.abs(dx * warning.dz - dz * warning.dx);
      return along >= -0.5 && along <= warning.radius && across <= 1.8;
    }
    const dot = distance > 0.001 ? (dx * warning.dx + dz * warning.dz) / distance : 1;
    return distance <= warning.radius + 0.4 && dot >= Math.cos(warning.kind === 'sweep' ? Math.PI / 4 : Math.PI / 4.8);
  }

  private escapeDirection(floor: FloorData, position: Point, warnings: VisibleWarning[], monsters: any[]): Point {
    let best = { x: 1, z: 0 };
    let bestScore = -Infinity;
    const offset = this.kind === 'expert' ? 0 : this.random.next() * Math.PI / 3;
    for (let index = 0; index < 16; index++) {
      const angle = offset + index * Math.PI * 2 / 16;
      const direction = { x: Math.sin(angle), z: Math.cos(angle) };
      const distance = this.kind === 'expert' ? 2.7 : 2.0;
      const candidate = { x: position.x + direction.x * distance, z: position.z + direction.z * distance };
      if (!isWalkable(floor, Math.floor(candidate.x), Math.floor(candidate.z))) continue;
      let score = 0;
      for (const warning of warnings) score += this.warningContains(warning, candidate) ? -100 : 8;
      for (const monster of monsters) score += Math.min(5, Math.hypot(candidate.x - monster.position.x, candidate.z - monster.position.z));
      if (score > bestScore) { bestScore = score; best = direction; }
    }
    return best;
  }

  private explorationTarget(game: any, floor: FloorData): Point | null {
    const player = game.player;
    const ratio = player.health / Math.max(1, player.maxHealth);
    const sanctuary = floor.rooms.find(room => room.kind === 'sanctuary' && room.id
      && !game.encounters?.state.usedSanctuaries.includes(room.id));

    // Once a barrier closes, remain inside that room. Patrol known walkable
    // cells until an unseen survivor comes into view instead of pathing toward
    // another objective through the closed door.
    const lockedId = game.encounters?.lockedRoomIds?.[0] as string | undefined;
    const lockedRoom = floor.rooms.find(room => room.id === lockedId);
    if (lockedRoom) return this.lockedRoomPatrolTarget(floor, lockedRoom, player.position);
    this.patrolRoomId = null;

    if (sanctuary && ratio <= this.params.healAtHealthRatio) return this.roomPoint(sanctuary);

    const visits = this.shopsVisited.get(game.floor) ?? 0;
    if (floor.merchant && visits < this.params.shopsPerFloor && this.shopFloorInProgress !== game.floor) {
      return { x: floor.merchant.x + 0.5, z: floor.merchant.z + 0.5 };
    }

    const required = floor.rooms.filter(room => room.required && room.id && !game.encounters?.state.cleared.includes(room.id));
    if (required.length) return this.nearestRoomPoint(player.position, required);

    const opened = game.openedChests as Set<string>;
    const availableChests = floor.chests.filter(chest => !opened.has(`${chest.x},${chest.z}`));
    const alreadyOpened = floor.chests.length - availableChests.length;
    if (availableChests.length && alreadyOpened < this.params.chestsPerFloor) {
      return this.nearestPoint(player.position, availableChests.map(chest => ({ x: chest.x + 0.5, z: chest.z + 0.5 })));
    }

    if (game.portalActive) return { x: floor.portal.x + 0.5, z: floor.portal.z + 0.5 };

    return null;
  }

  private lockedRoomPatrolTarget(floor: FloorData, room: Room, position: Point): Point {
    const roomId = room.id ?? '';
    if (this.patrolRoomId !== roomId) {
      this.patrolRoomId = roomId;
      this.patrolIndex = 0;
    }
    const cells = (room.cells ?? []).filter(cell => isWalkable(floor, cell.x, cell.z));
    if (!cells.length) return this.roomPoint(room);
    const stride = Math.max(1, Math.floor(cells.length / 7));
    let cell = cells[(this.patrolIndex * stride) % cells.length];
    let point = { x: cell.x + 0.5, z: cell.z + 0.5 };
    if (Math.hypot(point.x - position.x, point.z - position.z) < 0.7) {
      this.patrolIndex++;
      cell = cells[(this.patrolIndex * stride) % cells.length];
      point = { x: cell.x + 0.5, z: cell.z + 0.5 };
    }
    return point;
  }

  private nearestRoomPoint(position: Point, rooms: Room[]): Point {
    return this.nearestPoint(position, rooms.map(room => this.roomPoint(room)));
  }

  private nearestPoint(position: Point, points: Point[]): Point {
    return [...points].sort((a, b) => Math.hypot(a.x - position.x, a.z - position.z)
      - Math.hypot(b.x - position.x, b.z - position.z))[0];
  }

  private roomPoint(room: Room): Point {
    if (room.center) return { x: room.center.x, z: room.center.z };
    const cell = room.cells?.[Math.floor((room.cells.length - 1) / 2)];
    return cell ? { x: cell.x + 0.5, z: cell.z + 0.5 }
      : { x: room.x + room.width / 2, z: room.z + room.depth / 2 };
  }

  private startNavigation(game: any, floor: FloorData, target: Point): void {
    this.navigationGoal = { x: target.x, z: target.z };
    this.continueNavigation(game, floor);
  }

  /** Low-level waypoint steering runs every frame; persona reaction only changes the goal. */
  private continueNavigation(game: any, floor: FloorData): void {
    const target = this.navigationGoal;
    if (!target) return;
    const position = game.player.position;
    const direction = this.nextPathDirection(floor, position, target);
    if (!direction) {
      const reached = Math.hypot(target.x - position.x, target.z - position.z) <= 0.18;
      if (reached) this.navigationGoal = null;
      game.input.setAnalogMovement(0, 0);
      game.input.release('ShiftLeft');
      if (!reached && !this.pathWasBlocked) this.stats.pathFailures++;
      this.pathWasBlocked = !reached;
      return;
    }
    this.pathWasBlocked = false;
    this.setWorldMovement(game, direction.x, direction.z, true);
  }

  private setWorldMovement(game: any, worldX: number, worldZ: number, sprint: boolean): void {
    const length = Math.hypot(worldX, worldZ);
    if (length < 0.001) {
      game.input.setAnalogMovement(0, 0);
      game.input.release('ShiftLeft');
      return;
    }
    worldX /= length; worldZ /= length;
    const yaw = Number(game.controller?.cameraYaw ?? game.player.yaw ?? 0);
    const forwardX = Math.sin(yaw), forwardZ = Math.cos(yaw);
    const rightX = -forwardZ, rightZ = forwardX;
    game.input.setAnalogMovement(worldX * rightX + worldZ * rightZ, worldX * forwardX + worldZ * forwardZ);
    if (sprint) game.input.press('ShiftLeft'); else game.input.release('ShiftLeft');
  }

  private nextPathDirection(floor: FloorData, from: Point, target: Point): Point | null {
    const sx = Math.floor(from.x), sz = Math.floor(from.z);
    let tx = Math.floor(target.x), tz = Math.floor(target.z);
    if (!isWalkable(floor, tx, tz)) {
      const nearby = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]
        .map(([dx, dz]) => ({ x: tx + dx, z: tz + dz }))
        .find(cell => isWalkable(floor, cell.x, cell.z));
      if (!nearby) return null;
      tx = nearby.x; tz = nearby.z;
    }
    if (sx === tx && sz === tz) {
      const dx = target.x - from.x, dz = target.z - from.z;
      const length = Math.hypot(dx, dz);
      return length > 0.08 ? { x: dx / length, z: dz / length } : null;
    }

    const size = floor.size;
    const start = sz * size + sx, goal = tz * size + tx;
    if (sx < 0 || sz < 0 || sx >= size || sz >= size || !isWalkable(floor, sx, sz)) return null;
    const previous = new Int32Array(size * size).fill(-1);
    const queue = new Int32Array(size * size);
    let head = 0, tail = 0;
    queue[tail++] = start;
    previous[start] = start;
    const barriers = getEncounterBarriers(floor);
    const openEdge = (x: number, z: number, nx: number, nz: number): boolean => !barriers.length
      || encounterBarrierRayDistance(floor, { x: x + 0.5, y: 1, z: z + 0.5 }, { x: nx - x, y: 0, z: nz - z }, 1, 0.3) >= 1;
    while (head < tail && previous[goal] < 0) {
      const current = queue[head++];
      const x = current % size, z = Math.floor(current / size);
      for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
        if (nx < 0 || nz < 0 || nx >= size || nz >= size || !isWalkable(floor, nx, nz) || !openEdge(x, z, nx, nz)) continue;
        const next = nz * size + nx;
        if (previous[next] >= 0) continue;
        previous[next] = current;
        queue[tail++] = next;
      }
    }
    if (previous[goal] < 0) return null;
    let step = goal;
    while (previous[step] !== start && previous[step] !== step) step = previous[step];
    const nextX = step % size + 0.5, nextZ = Math.floor(step / size) + 0.5;
    const dx = nextX - from.x, dz = nextZ - from.z;
    const length = Math.hypot(dx, dz);
    return length > 0.001 ? { x: dx / length, z: dz / length } : null;
  }

  private prepareCharacter(game: any): void {
    if (!game.player?.alive) return;
    const canEdit = Boolean(game.canEditRunTalents?.());
    if (canEdit) {
      for (const id of this.params.talentPlan) {
        const before = game.runTalents.unlocked.length;
        game.allocateRunTalent(id);
        if (game.runTalents.unlocked.length > before) this.stats.talentsAllocated++;
      }
    }
    this.equipBestInventory(game);
    if (canEdit) {
      this.configureSetSkill(game);
      if (this.params.maxUpgradesPerFloor > 0) {
        this.salvageCraftingJunk(game);
        this.strengthenEquipment(game);
        this.configureSetSkill(game);
      }
    }
    game.inventoryUI?.close?.();
  }

  private configureSetSkill(game: any): void {
    const loadout = game.skillLoadout as string[];
    for (const id of [...loadout]) {
      if (!game.isSkillUnlocked(id)) {
        game.removeSkillFromLoadout(id);
        this.stats.skillLoadoutChanges++;
      }
    }
    const desired = (this.kind === 'expert' ? ['lightning_chain', 'frost_nova'] : ['frost_nova', 'lightning_chain'])
      .find(id => game.isSkillUnlocked(id));
    if (!desired || game.skillLoadout.includes(desired)) return;
    if (game.skillLoadout.length >= 4) {
      const replacement = this.kind === 'expert' ? 'whirlwind' : 'dash';
      if (!game.skillLoadout.includes(replacement)) return;
      game.removeSkillFromLoadout(replacement);
      this.stats.skillLoadoutChanges++;
    }
    const before = game.skillLoadout.length;
    game.addSkillToLoadout(desired);
    if (game.skillLoadout.length > before) this.stats.skillLoadoutChanges++;
  }

  private salvageCraftingJunk(game: any): void {
    for (let index = game.inventory.items.length - 1; index >= 0; index--) {
      const item = game.inventory.items[index] as Item;
      if (item.requiredLevel > game.player.level || this.itemUpgradeGain(game, item) > 0) continue;
      game.salvageFromInventory(index);
      this.stats.itemsSalvaged++;
      game.inventoryUI?.close?.();
    }
  }

  private strengthenEquipment(game: any): void {
    const used = this.upgradedFloors.get(game.floor) ?? 0;
    if (used >= this.params.maxUpgradesPerFloor) return;
    const priorities: Slot[] = ['weapon', 'chest', 'helmet', 'legs', 'boots', 'offhand', 'necklace'];
    const choice = priorities
      .map(slot => ({ slot, item: game.equipment.get(slot) as Item | null }))
      .filter((entry): entry is { slot: Slot; item: Item } => Boolean(entry.item))
      .filter(entry => entry.item.itemLevel + 1 <= game.player.level)
      .find(entry => {
        const cost = CraftingSystem.upgradeCost(entry.item);
        return game.gold - cost.gold >= this.params.craftingGoldReserve && game.canPayCost(cost);
      });
    if (!choice || !game.inventory.hasSpace()) return;

    const originalId = choice.item.id;
    game.unequipSlot(choice.slot);
    game.inventoryUI?.close?.();
    const index = game.inventory.items.findIndex((item: Item) => item.id === originalId);
    if (index < 0) return;
    const beforeLevel = game.inventory.items[index].itemLevel;
    game.upgradeFromInventory(index);
    game.inventoryUI?.close?.();
    if (game.inventory.items[index]?.itemLevel !== beforeLevel + 1) {
      game.equipFromInventory(index);
      game.inventoryUI?.close?.();
      return;
    }
    game.equipFromInventory(index);
    game.inventoryUI?.close?.();
    this.stats.itemUpgrades++;
    this.stats.equipmentChanges++;
    this.upgradedFloors.set(game.floor, used + 1);
  }

  private equipBestInventory(game: any): void {
    // One pass can replace every slot; cap protects against malformed harness state.
    for (let attempt = 0; attempt < 12; attempt++) {
      let bestIndex = -1, bestGain = this.params.equipmentUpgradeMargin;
      let bestSlot: Slot | null = null;
      for (let index = 0; index < game.inventory.items.length; index++) {
        const item = game.inventory.items[index] as Item;
        if (item.requiredLevel > game.player.level) continue;
        const option = this.itemUpgradeOption(game, item);
        if (option.gain > bestGain) {
          bestGain = option.gain;
          bestIndex = index;
          bestSlot = option.targetSlot;
        }
      }
      if (bestIndex < 0 || !bestSlot) break;
      const itemId = game.inventory.items[bestIndex].id;
      if (bestSlot === 'ring' && game.equipment.get('ring')) {
        if (!game.inventory.hasSpace()) break;
        game.unequipSlot('ring');
        game.inventoryUI?.close?.();
        bestIndex = game.inventory.items.findIndex((item: Item) => item.id === itemId);
        if (bestIndex < 0) break;
      }
      game.equipFromInventory(bestIndex);
      this.stats.equipmentChanges++;
      game.inventoryUI?.close?.();
    }
  }

  private itemUpgradeGain(game: any, item: Item): number {
    return this.itemUpgradeOption(game, item).gain;
  }

  private itemUpgradeOption(game: any, item: Item): EquipmentOption {
    const current = this.loadoutUtility(game.equipment, game.bonusAttributes);
    const targets: Slot[] = item.slot === 'ring'
      ? !game.equipment.get('ring') ? ['ring']
        : !game.equipment.get('ring2') ? ['ring2']
          : game.inventory.hasSpace() ? ['ring', 'ring2'] : ['ring2']
      : [item.slot];
    let result: EquipmentOption = { gain: -Infinity, targetSlot: targets[0] };
    for (const targetSlot of targets) {
      const candidate = new EquipmentManager();
      candidate.equipment = { ...game.equipment.equipment, [targetSlot]: item };
      const gain = this.loadoutUtility(candidate, game.bonusAttributes) - current;
      if (gain > result.gain) result = { gain, targetSlot };
    }
    return result;
  }

  private loadoutUtility(equipment: EquipmentManager, extra: any): number {
    const stats: DerivedStats = equipment.getDerivedStats(extra ?? {});
    const attackSpeed = stats.baseAttackSpeed * (1 + stats.attackSpeedBonus);
    const setSpecials = equipment.getActiveSetSpecials().length;
    const firePieces = equipment.getEquippedItems().filter(item => item.setId === 'inferno').length;
    if (this.kind === 'novice') {
      return stats.attack * 3 + attackSpeed * 12 + stats.maxHealth * 0.09 + stats.maxMana * 0.035
        + stats.armor * 0.45 + stats.defense * 1.6 + stats.critChance * 35 + stats.critDamage * 7
        + stats.moveSpeed * 7 + stats.manaRegen * 1.5 + stats.lifeRegen + stats.lifeSteal * 65
        + stats.cooldownReduction * 18 + stats.dodgeChance * 15 + setSpecials * 1.5 + firePieces * 0.15;
    }
    return stats.attack * 4 + attackSpeed * 18 + stats.maxHealth * 0.14 + stats.maxMana * 0.055
      + stats.armor * 0.65 + stats.defense * 2.4 + stats.critChance * 70 + stats.critDamage * 10
      + stats.moveSpeed * 10 + stats.manaRegen * 2.5 + stats.lifeRegen * 1.5 + stats.lifeSteal * 100
      + stats.cooldownReduction * 35 + stats.dodgeChance * 25 + setSpecials * 8 + firePieces * 0.8;
  }

  private handleShop(game: any): void {
    const floor = Number(game.floor);
    this.shopsVisited.set(floor, (this.shopsVisited.get(floor) ?? 0) + 1);
    this.stats.shopVisits++;
    this.shopFloorInProgress = -1;
    this.prepareCharacter(game);

    // Sell only items that are currently wearable and no longer improve the
    // loadout. This uses the game's normal sale transaction and price.
    for (let index = game.inventory.items.length - 1; index >= 0; index--) {
      const item = game.inventory.items[index] as Item;
      if (item.requiredLevel <= game.player.level && this.itemUpgradeGain(game, item) <= 0) {
        game.sellFromInventory(index);
        this.stats.shopSales++;
      }
    }

    for (let purchase = 0; purchase < this.params.purchasesPerShop; purchase++) {
      const affordable = (game.shopStock as any[])
        .filter(entry => entry.price <= game.gold && game.inventory.hasSpace() && entry.item.requiredLevel <= game.player.level)
        .map(entry => ({ entry, gain: this.itemUpgradeGain(game, entry.item) }))
        .filter(candidate => candidate.gain > this.params.equipmentUpgradeMargin)
        .sort((a, b) => b.gain / Math.max(1, b.entry.price) - a.gain / Math.max(1, a.entry.price))[0];
      if (!affordable) break;
      game.buyShopItem(affordable.entry.uid);
      this.stats.shopPurchases++;
      this.equipBestInventory(game);
    }

    if (game.player.health / Math.max(1, game.player.maxHealth) < this.params.healAtHealthRatio) {
      const before = game.shopHeals;
      game.healAtShop();
      if (game.shopHeals > before) this.stats.shopHeals++;
    }
    this.stop(game.input, game.controller);
    game.closeFloorRest();
  }
}

export function createPersonaPolicy(kind: PersonaKind, seed?: number): PersonaPolicy {
  return new GamePersonaPolicy(kind, seed);
}
