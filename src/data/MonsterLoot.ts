import type { Rarity } from '../types';
import { rarityWeightsForFloor, RARITY_ORDER } from './recipes';

// Existing 25-floor system only; future high-tier maps can introduce a separate source rule.
export const DEATH_REAPER_BOSS_CHANCE = .03;

/** Monster-only quality tuning: shops, crafting and chest odds are not changed. */
export function monsterLootWeights(floor: number, luck: number, minimum: Rarity = 'common') {
  const gain: Record<Rarity, number> = { common: 1, magic: 1, rare: 1.5, epic: 1.7, legendary: 1.8, mythic: 1 };
  const rank = RARITY_ORDER.indexOf(minimum);
  return rarityWeightsForFloor(floor, luck)
    .filter(entry => RARITY_ORDER.indexOf(entry.rarity) >= rank)
    .map(entry => ({ ...entry, weight: entry.weight * gain[entry.rarity] }));
}
export function monsterItemChance(floor: number): number {
  return Math.min(.65, .32 + Math.max(1, floor) * .012);
}
