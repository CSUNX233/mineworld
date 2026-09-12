import type { Rarity } from '../types';
import { RARITY_ORDER } from '../data/recipes';

/** One level/rarity price rule for generated and upgraded equipment. */
export function equipmentSellPrice(rarity: Rarity, itemLevel: number): number {
  const multiplier = RARITY_ORDER.indexOf(rarity) + 1;
  return Math.round((5 + itemLevel * 2) * multiplier * multiplier);
}
