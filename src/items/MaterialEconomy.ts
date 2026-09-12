import type { MaterialId } from '../types';
import { RNG } from '../utils/RNG';

export interface MaterialOffer { id: string; materialId: MaterialId; amount: number; }
export function materialPool(floor: number): { id: MaterialId; weight: number }[] {
  return [
    {id:'iron',weight:floor < 6 ? 55 : 20}, {id:'silver',weight:30},
    ...(floor >= 5 ? [{id:'gold' as const,weight:25}] : []),
    ...(floor >= 10 ? [{id:'mithril' as const,weight:18}] : []),
    ...(floor >= 15 ? [{id:'void_essence' as const,weight:8}] : []),
  ];
}
/** Two small lots per shelf, deterministic across closing/reloading the same shop. */
export function materialOffers(seed: number, floor: number, refreshes: number): MaterialOffer[] {
  const rng = new RNG((seed ^ Math.imul(floor, 104729) ^ Math.imul(refreshes + 1, 8191)) >>> 0);
  const pool = [...materialPool(floor), {id:'element_shard' as const,weight:40}];
  const offers: MaterialOffer[] = [];
  for (let i = 0; i < 2; i++) {
    const materialId = rng.weighted(pool).id;
    offers.push({id:`${floor}:${refreshes}:${i}`,materialId,amount:materialId === 'iron' || materialId === 'silver' ? 2 : 1});
    pool.splice(pool.findIndex(entry => entry.id === materialId),1);
  }
  return offers;
}
