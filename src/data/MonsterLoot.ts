import type { Rarity } from '../types';
import { rarityWeightsForFloor, RARITY_ORDER } from './recipes';

// Existing 25-floor system only; future high-tier maps can introduce a separate source rule.
export const DEATH_REAPER_BOSS_CHANCE = .03;

export function highRarityDropMultiplier(floor: number): number {
  return floor <= 5 ? .7 : floor <= 10 ? .8 : floor <= 15 ? .9 : 1;
}

export function deathReaperBossChance(floor: number): number {
  return DEATH_REAPER_BOSS_CHANCE * highRarityDropMultiplier(floor);
}

/** Monster-only quality tuning: shops, crafting and chest odds are not changed. */
export function monsterLootWeights(floor: number, luck: number, minimum: Rarity = 'common') {
  const gain: Record<Rarity, number> = { common: 1, magic: 1, rare: 1.5, epic: 1.7, legendary: 1.8, mythic: 1 };
  const rank = RARITY_ORDER.indexOf(minimum);
  const weights = rarityWeightsForFloor(floor, luck)
    .filter(entry => RARITY_ORDER.indexOf(entry.rarity) >= rank)
    .map(entry => ({ ...entry, weight: entry.weight * gain[entry.rarity] }));
  const high = weights.filter(entry => entry.rarity === 'epic' || entry.rarity === 'legendary');
  const lower = weights.filter(entry => RARITY_ORDER.indexOf(entry.rarity) < RARITY_ORDER.indexOf('epic'));
  let removed = 0;
  for (const entry of high) {
    const reduction = entry.weight * (1 - highRarityDropMultiplier(floor));
    entry.weight -= reduction; removed += reduction;
  }
  const lowerTotal = lower.reduce((sum, entry) => sum + entry.weight, 0);
  if (lowerTotal > 0) {
    for (const entry of lower) entry.weight += removed * entry.weight / lowerTotal;
  } else if (removed > 0) weights.push({ rarity: 'rare', weight: removed });

  // Apply yellow reduction after the previous orange/red rebalance.
  const yellow = weights.find(entry => entry.rarity === 'rare');
  if (yellow && floor <= 10) {
    const reduction = yellow.weight * (floor <= 5 ? .25 : .1);
    yellow.weight -= reduction;
    const blue = weights.find(entry => entry.rarity === 'magic');
    if (blue) blue.weight += reduction;
    else weights.push({ rarity: 'magic', weight: reduction });
  }
  return weights;
}
export function monsterItemChance(floor: number): number {
  return Math.min(.65, .32 + Math.max(1, floor) * .012);
}
