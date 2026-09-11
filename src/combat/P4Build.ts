import { RUN_TALENT_DEFS, type RunTalentEffects } from '../data/runTalents';

/** Structural subset shared with RunTalents, so combat derivation has no progression dependency. */
export interface P4TalentState {
  version: 1;
  unlocked: readonly string[];
  resetsUsed: number;
}

export type MeleeDirection = 'none' | 'cleave' | 'guard';
export type SummonDirection = 'none' | 'legion' | 'elite';

/** Runtime-ready tuning for the melee, summon, and hybrid P4 additions. */
export interface P4Modifiers {
  meleeDirection: MeleeDirection;
  summonDirection: SummonDirection;
  cleaveMultiplier: number;
  seismicSlamMultiplier: number;
  counterDamageMultiplier: number;
  counterDamageReduction: number;
  counterManaRefund: number;
  guardShieldBonus: number;
  capacity: number;
  damageMultiplier: number;
  summonGuardMultiplier: number;
  guardCounterUnlocked: boolean;
  seismicSlamUnlocked: boolean;
  raiseCompanyUnlocked: boolean;
  soulBurstUnlocked: boolean;
  flameRiftUnlocked: boolean;
  emberBladeUnlocked: boolean;
}

const BASE_SUMMON_CAPACITY = 4;
const BASE_COUNTER_DAMAGE_REDUCTION = 0.55;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

export function deriveP4Modifiers(state: P4TalentState): P4Modifiers {
  const unlocked = new Set(state.unlocked);
  const effects = RUN_TALENT_DEFS
    .filter((talent) => unlocked.has(talent.id))
    .map((talent) => talent.effects ?? {});
  const numbers = (key: keyof RunTalentEffects): number[] => effects
    .map((effect) => effect[key])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const sum = (key: keyof RunTalentEffects): number =>
    numbers(key).reduce((total, value) => total + value, 0);
  const flag = (key: keyof RunTalentEffects): boolean =>
    effects.some((effect) => effect[key] === true);

  const meleeEnabled = unlocked.has('melee_seed');
  const summonEnabled = unlocked.has('summon_seed');
  const meleeDirection: MeleeDirection = !meleeEnabled
    ? 'none'
    : unlocked.has('melee_cleave')
      ? 'cleave'
      : unlocked.has('melee_guard')
        ? 'guard'
        : 'none';
  const summonDirection: SummonDirection = !summonEnabled
    ? 'none'
    : unlocked.has('summon_legion')
      ? 'legion'
      : unlocked.has('summon_elite')
        ? 'elite'
        : 'none';

  const counterReductionOverrides = numbers('counterDamageReductionOverride');
  const counterDamageReduction = counterReductionOverrides.length > 0
    ? counterReductionOverrides[counterReductionOverrides.length - 1]
    : BASE_COUNTER_DAMAGE_REDUCTION;
  const capacityOverride = numbers('summonCapacityOverride')[0];
  const capacity = summonEnabled
    ? capacityOverride ?? BASE_SUMMON_CAPACITY + sum('summonCapacityBonus')
    : 0;

  return {
    meleeDirection,
    summonDirection,
    cleaveMultiplier: meleeEnabled ? Math.max(0, 1 + sum('cleaveDamageBonus')) : 1,
    seismicSlamMultiplier: meleeEnabled ? Math.max(0, 1 + sum('seismicSlamDamageBonus')) : 1,
    counterDamageMultiplier: meleeEnabled ? Math.max(0, 1 + sum('counterDamageBonus')) : 1,
    counterDamageReduction: clamp(counterDamageReduction, 0, 1),
    counterManaRefund: meleeEnabled ? Math.max(0, sum('counterManaRefund')) : 0,
    guardShieldBonus: meleeEnabled ? Math.max(0, sum('counterShieldBonus')) : 0,
    capacity: Math.max(0, Math.floor(capacity)),
    damageMultiplier: summonEnabled ? Math.max(0, 1 + sum('summonDamageBonus')) : 1,
    summonGuardMultiplier: summonEnabled ? Math.max(0, 1 + sum('summonGuardBonus')) : 1,
    guardCounterUnlocked: meleeEnabled && flag('guardCounterUnlocked'),
    seismicSlamUnlocked: meleeEnabled && flag('seismicSlamUnlocked'),
    raiseCompanyUnlocked: summonEnabled && flag('raiseCompanyUnlocked'),
    soulBurstUnlocked: summonEnabled && flag('soulBurstUnlocked'),
    flameRiftUnlocked: unlocked.has('fire_seed') && flag('flameRiftUnlocked'),
    emberBladeUnlocked: unlocked.has('melee_seed')
      && unlocked.has('fire_seed')
      && flag('emberBladeUnlocked'),
  };
}
