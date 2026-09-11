import type { Stat, StatMap, StatValueMode, StatValueModes } from '../types';

const DEFAULT_INCREASED_STATS = new Set<Stat>(['attackSpeed', 'critChance', 'critDamage', 'moveSpeed', 'shieldRecoveryRate']);

export interface StatBuckets {
  base: StatMap;
  flat: StatMap;
  increased: StatMap;
}

export function defaultAffixValueMode(stat: Stat): StatValueMode {
  return DEFAULT_INCREASED_STATS.has(stat) ? 'increased' : 'flat';
}

export function baseDefenseFromArmor(armor: number | undefined): number {
  if (!armor || armor <= 0) return 0;
  return Math.max(1, Math.min(4, Math.round(armor / 2)));
}

export function statValueMode(stat: Stat, modes?: StatValueModes, fallback: StatValueMode = 'flat'): StatValueMode {
  return modes?.[stat] ?? fallback;
}

export function createStatBuckets(base: StatMap = {}): StatBuckets {
  return { base: { ...base }, flat: {}, increased: {} };
}

export function addStatMap(
  buckets: StatBuckets,
  values: StatMap | undefined,
  modes: StatValueModes | undefined,
  fallback: StatValueMode | ((stat: Stat) => StatValueMode),
): void {
  if (!values) return;
  for (const [key, raw] of Object.entries(values) as [Stat, number | undefined][]) {
    const value = raw ?? 0;
    const fallbackMode = typeof fallback === 'function' ? fallback(key) : fallback;
    const mode = statValueMode(key, modes, fallbackMode);
    const target = buckets[mode];
    target[key] = (target[key] ?? 0) + value;
  }
}

export function addBaseStatMap(buckets: StatBuckets, values: StatMap | undefined): void {
  if (!values) return;
  for (const [key, raw] of Object.entries(values) as [Stat, number | undefined][]) {
    buckets.base[key] = (buckets.base[key] ?? 0) + (raw ?? 0);
  }
}

export function resolveStat(buckets: StatBuckets, stat: Stat): number {
  return (buckets.base[stat] ?? 0) * (1 + (buckets.increased[stat] ?? 0)) + (buckets.flat[stat] ?? 0);
}

export function resolveStats(buckets: StatBuckets): StatMap {
  const result: StatMap = {};
  const stats = new Set<Stat>([
    ...(Object.keys(buckets.base) as Stat[]),
    ...(Object.keys(buckets.flat) as Stat[]),
    ...(Object.keys(buckets.increased) as Stat[]),
  ]);
  stats.forEach((stat) => { result[stat] = resolveStat(buckets, stat); });
  return result;
}
