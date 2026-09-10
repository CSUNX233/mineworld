import type { ActorStatus, StatusType } from '../types';
import { RUN_TALENT_DEFS, type RunTalentEffects } from '../data/runTalents';

/** Structural subset shared with RunTalents; keeping rules independent avoids a runtime dependency. */
export interface FireTalentState {
  version: 1;
  unlocked: readonly string[];
  resetsUsed: number;
}

export type FireBranch = 'none' | 'spreading' | 'consuming';

/** All numeric fire tuning consumed by Game is derived in one place. */
export interface FireModifiers {
  enabled: boolean;
  branch: FireBranch;
  igniteChance: number;
  fireballCooldownMultiplier: number;
  fireballManaCostMultiplier: number;
  fireDamageMultiplier: number;
  projectilePierces: number;
  burnDurationSeconds: number;
  burnDurationMultiplier: number;
  burnDamageMultiplier: number;
  spreadOnFireballHit: boolean;
  spreadRadius: number;
  spreadLimit: number;
  spreadDamageMultiplier: number;
  consumeOnFireHit: boolean;
  detonateDamageMultiplier: number;
  detonateManaRefund: number;
  detonateShieldGain: number;
  detonateShieldCapMaxHealthRatio: number;
  lowHealthThreshold: number;
  lowHealthDetonateMultiplier: number;
  lowHealthNonBossOnly: boolean;
}

export interface FireBurnStatus extends ActorStatus {
  type: 'burning';
  /** A copied burn cannot spread again, preventing passive propagation loops. */
  fireSpreadGeneration: 0 | 1;
}

export interface BurnActor {
  statuses: ActorStatus[];
}

export interface ConsumeBurnOptions {
  healthRatio?: number;
  isBoss?: boolean;
}

export interface ConsumedBurn {
  consumed: boolean;
  rawDamage: number;
  manaRefund: number;
  shieldGain: number;
}

const BASE_BURN_DURATION = 3;
const BASE_BURN_DAMAGE_PER_SECOND = 0.2;

export function deriveFireModifiers(state: FireTalentState): FireModifiers {
  const unlocked = new Set(state.unlocked);
  const effects = RUN_TALENT_DEFS
    .filter((talent) => unlocked.has(talent.id))
    .map((talent) => talent.effects ?? {});
  const numbers = (key: keyof RunTalentEffects): number[] => effects
    .map((effect) => effect[key])
    .filter((value): value is number => typeof value === 'number');
  const sum = (key: keyof RunTalentEffects): number => numbers(key).reduce((total, value) => total + value, 0);
  const max = (key: keyof RunTalentEffects, fallback = 0): number => Math.max(fallback, ...numbers(key));
  const flag = (key: keyof RunTalentEffects): boolean => effects.some((effect) => effect[key] === true);

  const enabled = flag('guaranteedIgniteOnDirectFire') || max('igniteChance') > 0;
  const spreading = enabled && flag('spreadOnFireballHit');
  const consuming = enabled && flag('detonateUnlocked');
  // Invalid external state is made deterministic. The tree itself prevents both branches.
  const branch: FireBranch = spreading ? 'spreading' : consuming ? 'consuming' : 'none';
  const baseBurnDuration = branch === 'consuming'
    ? max('consumingBurnDuration', max('igniteDuration', BASE_BURN_DURATION))
    : max('igniteDuration', BASE_BURN_DURATION);
  const burnDurationMultiplier = 1 + sum('burnDurationMultiplierBonus');
  const fireballDamageMultipliers = numbers('fireballDamageMultiplier');
  const manaCostMultipliers = numbers('fireballManaCostMultiplier');

  return {
    enabled,
    branch,
    igniteChance: enabled ? max('igniteChance') : 0,
    fireballCooldownMultiplier: 1,
    fireballManaCostMultiplier: manaCostMultipliers.reduce((total, value) => total * value, 1),
    fireDamageMultiplier: fireballDamageMultipliers.reduce((total, value) => total * value, 1),
    projectilePierces: branch === 'spreading' ? sum('fireballPierceBonus') : 0,
    burnDurationSeconds: baseBurnDuration * burnDurationMultiplier,
    burnDurationMultiplier,
    burnDamageMultiplier: max('igniteDamageRatioPerSecond', BASE_BURN_DAMAGE_PER_SECOND),
    spreadOnFireballHit: branch === 'spreading',
    spreadRadius: branch === 'spreading'
      ? max('spreadRadius') + sum('spreadRadiusBonus')
      : 0,
    spreadLimit: branch === 'spreading'
      ? max('spreadTargets') + sum('spreadTargetsBonus')
      : 0,
    spreadDamageMultiplier: 1,
    consumeOnFireHit: false,
    detonateDamageMultiplier: branch === 'consuming'
      ? max('detonateRemainingDamageMultiplier') + sum('detonateRemainingDamageMultiplierBonus')
      : 0,
    detonateManaRefund: branch === 'consuming' ? max('manaPerDetonateCast') : 0,
    detonateShieldGain: branch === 'consuming' ? max('shieldPerDetonateCast') : 0,
    detonateShieldCapMaxHealthRatio: branch === 'consuming' ? max('shieldCapMaxHealthRatio') : 0,
    lowHealthThreshold: branch === 'consuming' ? max('lowHealthThreshold') : 0,
    lowHealthDetonateMultiplier: branch === 'consuming' ? max('lowHealthConsumeMultiplier', 1) : 1,
    lowHealthNonBossOnly: flag('nonBossOnly'),
  };
}

/**
 * Creates raw fire DoT. Chance and direct-hit checks belong to Game; resistance is
 * intentionally absent here so each tick is reduced exactly once by ElementSystem.
 */
export function createBurn(
  sourceDamage: number,
  mods: FireModifiers,
  immunities?: readonly StatusType[],
): FireBurnStatus | null {
  if (!mods.enabled || immunities?.includes('burning')) return null;
  const duration = Math.max(0, mods.burnDurationSeconds);
  if (duration <= 0 || sourceDamage <= 0) return null;
  return {
    type: 'burning',
    duration,
    maxDuration: duration,
    damagePerTick: sourceDamage * mods.burnDamageMultiplier,
    sourceElement: 'fire',
    fireSpreadGeneration: 0,
  };
}

/** Copies remaining raw burn once. Game chooses nearby targets and applies the status. */
export function createSpreadBurn(
  source: ActorStatus,
  mods: FireModifiers,
  immunities?: readonly StatusType[],
): FireBurnStatus | null {
  const generation = (source as Partial<FireBurnStatus>).fireSpreadGeneration ?? 0;
  if (!mods.spreadOnFireballHit || source.type !== 'burning' || generation > 0) return null;
  if (immunities?.includes('burning') || source.duration <= 0 || source.damagePerTick <= 0) return null;
  return {
    type: 'burning',
    duration: source.duration,
    maxDuration: source.duration,
    damagePerTick: source.damagePerTick * mods.spreadDamageMultiplier,
    sourceElement: 'fire',
    fireSpreadGeneration: 1,
  };
}

/** Removes the burn before returning its raw remaining damage, preventing re-entry chains. */
export function consumeBurn(
  actor: BurnActor,
  mods: FireModifiers,
  options: ConsumeBurnOptions = {},
): ConsumedBurn {
  if (mods.branch !== 'consuming') return { consumed: false, rawDamage: 0, manaRefund: 0, shieldGain: 0 };
  const index = actor.statuses.findIndex((status) => status.type === 'burning');
  if (index < 0) return { consumed: false, rawDamage: 0, manaRefund: 0, shieldGain: 0 };

  const [burn] = actor.statuses.splice(index, 1);
  let multiplier = mods.detonateDamageMultiplier;
  const lowHealth = options.healthRatio !== undefined && options.healthRatio <= mods.lowHealthThreshold;
  const validTarget = !mods.lowHealthNonBossOnly || !options.isBoss;
  if (mods.lowHealthThreshold > 0 && lowHealth && validTarget) multiplier *= mods.lowHealthDetonateMultiplier;

  return {
    consumed: true,
    rawDamage: Math.max(0, burn.damagePerTick * Math.max(0, burn.duration) * multiplier),
    manaRefund: mods.detonateManaRefund,
    shieldGain: mods.detonateShieldGain,
  };
}
