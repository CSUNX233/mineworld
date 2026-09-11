import { Vector3 } from 'three';
import type { Monster } from '../monsters/Monster';
import type { SummonRole } from '../summons/types';
import type { ElementType, FloorData } from '../types';
import { worldRayDistance } from '../world/SpatialQueries';
import type { P4Modifiers } from './P4Build';

export type P4SkillId =
  | 'guard_counter'
  | 'seismic_slam'
  | 'raise_company'
  | 'soul_burst'
  | 'flame_rift'
  | 'ember_blade';

export interface P4Point {
  x: number;
  y: number;
  z: number;
}

export interface P4RaiseOptions {
  direction: 'legion' | 'elite';
  capacity: number;
  damageMultiplier: number;
  guardMultiplier: number;
}

export interface P4Sacrifice {
  role: SummonRole;
  position: P4Point;
}

export type P4SkillEvent =
  | { kind: 'guard-start'; position: P4Point; duration: number }
  | { kind: 'guard-counter'; position: P4Point; target: Monster }
  | { kind: 'seismic-slam'; position: P4Point; direction: P4Point; charges: number }
  | { kind: 'raise-company'; position: P4Point; options: P4RaiseOptions }
  | { kind: 'soul-burst'; position: P4Point; role: SummonRole }
  | { kind: 'flame-rift-start'; position: P4Point; direction: P4Point; duration: number }
  | { kind: 'flame-rift-tick'; position: P4Point; direction: P4Point }
  | { kind: 'ember-blade'; position: P4Point; direction: P4Point; consumedBurns: number };

/** Game-facing adapter. Damage resolution, status mutation, resources, and summons stay owned by the host. */
export interface P4SkillHost {
  modifiers(): P4Modifiers;
  floor(): FloorData | null;
  playerPosition(): P4Point;
  aimDirection(): P4Point;
  attack(): number;
  maxHealth(): number;
  monsters(): readonly Monster[];
  damage(target: Monster, amount: number, element: ElementType, sourceSkillId: P4SkillId): void;
  ignite(target: Monster, sourceDamage: number, sourceSkillId: P4SkillId): void;
  hasBurn(target: Monster): boolean;
  /** Removes one burn and returns its raw remaining damage before target resistance. */
  consumeBurn(target: Monster): number;
  shield(amount: number): void;
  mana(amount: number): void;
  raiseCompany(options: P4RaiseOptions): boolean;
  sacrificeSummon(): P4Sacrifice | null;
  emit?(event: P4SkillEvent): void;
}

export interface P4CastResult {
  success: boolean;
  reason?: 'locked' | 'no-target' | 'no-summon' | 'summon-rejected';
  targets: number;
  chargesConsumed: number;
}

export interface P4RuntimeStatus {
  guardRemaining: number;
  meleeCharges: number;
  meleeChargeRemaining: number;
  activeFlameRifts: number;
}

interface FlameRift {
  position: P4Point;
  direction: P4Point;
  remaining: number;
  tickAccumulator: number;
}

const P4_SKILL_IDS: ReadonlySet<string> = new Set<P4SkillId>([
  'guard_counter',
  'seismic_slam',
  'raise_company',
  'soul_burst',
  'flame_rift',
  'ember_blade',
]);
const GUARD_DURATION = 1.2;
const MELEE_CHARGE_DURATION = 5;
const MAX_MELEE_CHARGES = 3;
const FLAME_RIFT_DURATION = 3;
const FLAME_RIFT_INTERVAL = 0.5;
const MAX_FLAME_RIFTS = 3;

const point = (source: P4Point): P4Point => ({ x: source.x, y: source.y, z: source.z });

function normalizedDirection(value: P4Point): P4Point {
  const length = Math.hypot(value.x, value.z);
  if (length <= 0.0001) return { x: 0, y: 0, z: 1 };
  return { x: value.x / length, y: 0, z: value.z / length };
}

function distanceSquared(left: P4Point, right: P4Point): number {
  return (left.x - right.x) ** 2 + (left.z - right.z) ** 2;
}

export class P4SkillRuntime {
  private guardRemaining = 0;
  private guardDirection: P4Point = { x: 0, y: 0, z: 1 };
  private meleeCharges = 0;
  private meleeChargeRemaining = 0;
  private readonly flameRifts: FlameRift[] = [];

  constructor(private readonly host: P4SkillHost) {}

  handles(skillId: string): skillId is P4SkillId {
    return P4_SKILL_IDS.has(skillId);
  }

  get status(): Readonly<P4RuntimeStatus> {
    return {
      guardRemaining: this.guardRemaining,
      meleeCharges: this.meleeCharges,
      meleeChargeRemaining: this.meleeChargeRemaining,
      activeFlameRifts: this.flameRifts.length,
    };
  }

  cast(skillId: P4SkillId): P4CastResult {
    const modifiers = this.host.modifiers();
    if (!this.isUnlocked(skillId, modifiers)) return this.failed('locked');
    if (skillId === 'guard_counter') return this.castGuardCounter();
    if (skillId === 'seismic_slam') return this.castSeismicSlam(modifiers);
    if (skillId === 'raise_company') return this.castRaiseCompany(modifiers);
    if (skillId === 'soul_burst') return this.castSoulBurst(modifiers);
    if (skillId === 'flame_rift') return this.castFlameRift();
    return this.castEmberBlade();
  }

  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.guardRemaining = Math.max(0, this.guardRemaining - dt);
    if (this.meleeChargeRemaining > 0) {
      this.meleeChargeRemaining = Math.max(0, this.meleeChargeRemaining - dt);
      if (this.meleeChargeRemaining === 0) this.meleeCharges = 0;
    }

    for (let index = this.flameRifts.length - 1; index >= 0; index--) {
      const rift = this.flameRifts[index];
      const activeDt = Math.min(rift.remaining, dt);
      rift.remaining = Math.max(0, rift.remaining - dt);
      rift.tickAccumulator += activeDt;
      let ticks = 0;
      while (rift.tickAccumulator + 1e-8 >= FLAME_RIFT_INTERVAL && ticks < 6) {
        rift.tickAccumulator -= FLAME_RIFT_INTERVAL;
        this.tickFlameRift(rift);
        ticks++;
      }
      if (rift.remaining <= 0) this.flameRifts.splice(index, 1);
    }
  }

  clear(): void {
    this.guardRemaining = 0;
    this.meleeCharges = 0;
    this.meleeChargeRemaining = 0;
    this.flameRifts.length = 0;
  }

  basicHit(): void {
    if (!this.host.modifiers().seismicSlamUnlocked) return;
    this.meleeCharges = Math.min(MAX_MELEE_CHARGES, this.meleeCharges + 1);
    this.meleeChargeRemaining = MELEE_CHARGE_DURATION;
  }

  /** Returns the remaining incoming damage after a one-hit guard window. */
  interceptDamage(incomingDamage: number, source?: Monster): number {
    if (!Number.isFinite(incomingDamage) || incomingDamage <= 0) return Math.max(0, incomingDamage || 0);
    if (this.guardRemaining <= 0 || !this.host.modifiers().guardCounterUnlocked) return incomingDamage;

    this.guardRemaining = 0;
    const modifiers = this.host.modifiers();
    if (source && !source.dead && this.canCounter(source)) {
      const counterDamage = this.host.attack() * 1.4 * modifiers.counterDamageMultiplier;
      this.host.damage(source, counterDamage, 'physical', 'guard_counter');
      this.host.mana(modifiers.counterManaRefund);
      this.host.shield(modifiers.guardShieldBonus);
      this.host.emit?.({ kind: 'guard-counter', position: point(source.position), target: source });
    }
    return incomingDamage * (1 - modifiers.counterDamageReduction);
  }

  private castGuardCounter(): P4CastResult {
    this.guardRemaining = GUARD_DURATION;
    this.guardDirection = normalizedDirection(this.host.aimDirection());
    this.host.emit?.({
      kind: 'guard-start',
      position: point(this.host.playerPosition()),
      duration: GUARD_DURATION,
    });
    return { success: true, targets: 0, chargesConsumed: 0 };
  }

  private castSeismicSlam(modifiers: P4Modifiers): P4CastResult {
    const origin = point(this.host.playerPosition());
    const direction = normalizedDirection(this.host.aimDirection());
    const charges = this.meleeCharges;
    this.meleeCharges = 0;
    this.meleeChargeRemaining = 0;
    const damage = this.host.attack()
      * 1.35
      * (1 + charges * 0.35)
      * modifiers.cleaveMultiplier
      * modifiers.seismicSlamMultiplier;
    const targets = this.targetsInStrip(origin, direction, 6, 1.05);
    for (const target of targets) this.host.damage(target, damage, 'physical', 'seismic_slam');
    this.host.emit?.({ kind: 'seismic-slam', position: origin, direction, charges });
    return { success: true, targets: targets.length, chargesConsumed: charges };
  }

  private castRaiseCompany(modifiers: P4Modifiers): P4CastResult {
    const options: P4RaiseOptions = {
      direction: modifiers.summonDirection === 'elite' ? 'elite' : 'legion',
      capacity: modifiers.capacity,
      damageMultiplier: modifiers.damageMultiplier,
      guardMultiplier: modifiers.summonGuardMultiplier,
    };
    if (!this.host.raiseCompany(options)) return this.failed('summon-rejected');
    this.host.emit?.({ kind: 'raise-company', position: point(this.host.playerPosition()), options });
    return { success: true, targets: 0, chargesConsumed: 0 };
  }

  private castSoulBurst(modifiers: P4Modifiers): P4CastResult {
    const sacrifice = this.host.sacrificeSummon();
    if (!sacrifice) return this.failed('no-summon');
    const origin = point(sacrifice.position);
    let affected = 0;

    if (sacrifice.role === 'guardian') {
      this.host.shield(this.host.maxHealth() * 0.16 * modifiers.summonGuardMultiplier);
    } else {
      const radius = sacrifice.role === 'archer' ? 4.5 : 3.2;
      const targets = this.targetsInRadius(origin, radius);
      affected = targets.length;
      for (const target of targets) {
        if (sacrifice.role === 'warrior') {
          this.host.damage(target, this.host.attack() * 2 * modifiers.damageMultiplier, 'physical', 'soul_burst');
        } else {
          const sourceDamage = this.host.attack() * 0.8 * modifiers.damageMultiplier;
          this.host.damage(target, sourceDamage * 0.65, 'fire', 'soul_burst');
          this.host.ignite(target, sourceDamage, 'soul_burst');
        }
      }
    }

    this.host.emit?.({ kind: 'soul-burst', position: origin, role: sacrifice.role });
    return { success: true, targets: affected, chargesConsumed: 0 };
  }

  private castFlameRift(): P4CastResult {
    const direction = normalizedDirection(this.host.aimDirection());
    const owner = this.host.playerPosition();
    const position = point(owner);
    if (this.flameRifts.length >= MAX_FLAME_RIFTS) this.flameRifts.shift();
    this.flameRifts.push({
      position,
      direction,
      remaining: FLAME_RIFT_DURATION,
      tickAccumulator: 0,
    });
    this.host.emit?.({
      kind: 'flame-rift-start',
      position: point(position),
      direction: point(direction),
      duration: FLAME_RIFT_DURATION,
    });
    return { success: true, targets: 0, chargesConsumed: 0 };
  }

  private castEmberBlade(): P4CastResult {
    const origin = point(this.host.playerPosition());
    const direction = normalizedDirection(this.host.aimDirection());
    const targets = this.targetsInCone(origin, direction, 3.1, 0.62);
    if (targets.length === 0) return this.failed('no-target');

    let consumedBurns = 0;
    for (const target of targets) {
      const remainingBurn = this.host.hasBurn(target) ? Math.max(0, this.host.consumeBurn(target)) : 0;
      if (remainingBurn > 0) consumedBurns++;
      this.host.damage(target, this.host.attack() * 1.45 + remainingBurn * 1.35, 'fire', 'ember_blade');
    }
    this.host.emit?.({ kind: 'ember-blade', position: origin, direction, consumedBurns });
    return { success: true, targets: targets.length, chargesConsumed: 0 };
  }

  private tickFlameRift(rift: FlameRift): void {
    const targets = this.targetsInStrip(rift.position, rift.direction, 6, 0.72);
    const sourceDamage = this.host.attack() * 0.32;
    for (const target of targets) {
      this.host.damage(target, sourceDamage, 'fire', 'flame_rift');
      this.host.ignite(target, sourceDamage, 'flame_rift');
    }
    this.host.emit?.({
      kind: 'flame-rift-tick',
      position: point(rift.position),
      direction: point(rift.direction),
    });
  }

  private isUnlocked(skillId: P4SkillId, modifiers: P4Modifiers): boolean {
    if (skillId === 'guard_counter') return modifiers.guardCounterUnlocked;
    if (skillId === 'seismic_slam') return modifiers.seismicSlamUnlocked;
    if (skillId === 'raise_company') return modifiers.raiseCompanyUnlocked;
    if (skillId === 'soul_burst') return modifiers.soulBurstUnlocked;
    if (skillId === 'flame_rift') return modifiers.flameRiftUnlocked;
    return modifiers.emberBladeUnlocked;
  }

  private canCounter(source: Monster): boolean {
    const origin = this.host.playerPosition();
    const dx = source.position.x - origin.x;
    const dz = source.position.z - origin.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 4 || distance <= 0.0001) return false;
    const facing = (dx * this.guardDirection.x + dz * this.guardDirection.z) / distance;
    return facing >= 0.2 && this.hasLineOfSight(origin, source.position);
  }

  private targetsInStrip(origin: P4Point, direction: P4Point, length: number, halfWidth: number): Monster[] {
    return this.host.monsters().filter((target) => {
      if (target.dead) return false;
      const dx = target.position.x - origin.x;
      const dz = target.position.z - origin.z;
      const forward = dx * direction.x + dz * direction.z;
      const lateral = Math.abs(dx * direction.z - dz * direction.x);
      return forward >= 0 && forward <= length && lateral <= halfWidth
        && this.hasLineOfSight(origin, target.position);
    });
  }

  private targetsInCone(origin: P4Point, direction: P4Point, range: number, halfAngle: number): Monster[] {
    const minimumDot = Math.cos(halfAngle);
    return this.host.monsters().filter((target) => {
      if (target.dead) return false;
      const dx = target.position.x - origin.x;
      const dz = target.position.z - origin.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= 0.0001 || distance > range) return false;
      const facing = (dx * direction.x + dz * direction.z) / distance;
      return facing >= minimumDot && this.hasLineOfSight(origin, target.position);
    });
  }

  private targetsInRadius(origin: P4Point, radius: number): Monster[] {
    const radiusSquared = radius ** 2;
    return this.host.monsters().filter((target) => !target.dead
      && distanceSquared(origin, target.position) <= radiusSquared
      && this.hasLineOfSight(origin, target.position));
  }

  private hasLineOfSight(from: P4Point, to: P4Point): boolean {
    const floor = this.host.floor();
    if (!floor) return true;
    const origin = new Vector3(from.x, 1, from.z);
    const direction = new Vector3(to.x - from.x, 0, to.z - from.z);
    const distance = direction.length();
    return distance <= 0.01
      || worldRayDistance(floor, origin, direction.normalize(), distance) >= distance - 0.05;
  }

  private failed(reason: NonNullable<P4CastResult['reason']>): P4CastResult {
    return { success: false, reason, targets: 0, chargesConsumed: 0 };
  }
}
