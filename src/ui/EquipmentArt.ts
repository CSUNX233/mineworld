import type { Item } from '../types';

export type ItemArtSource = Pick<Item, 'icon'> & Partial<Pick<Item, 'id' | 'setId' | 'slot' | 'equipmentRulesVersion'>>;

const SET_IDS = new Set(['warlord', 'warbringer', 'frost', 'shadow', 'inferno', 'glacier',
  'venom', 'sanguine', 'storm', 'soul_banner', 'soul_pyre', 'embersteel']);
const SLOTS = new Set(['weapon', 'helmet', 'chest', 'legs', 'boots', 'ring', 'ring2', 'necklace', 'offhand']);

/** Resolve at display time so existing P5 saves receive artwork without changing item identity. */
export function equipmentArtPath(item: ItemArtSource): string | undefined {
  if (item.setId === 'death_reaper' && item.slot && SLOTS.has(item.slot))
    return `assets/ui/sunlit/death-reaper/${item.slot}.webp`;
  if ((item.equipmentRulesVersion ?? 1) < 2 || !item.setId || !SET_IDS.has(item.setId)
    || !item.slot || !SLOTS.has(item.slot)) return undefined;
  // Two real ring identities use their own slots; duplicate copies retain the same artwork.
  const slot = item.slot;
  return `assets/ui/sunlit/equipment/${item.setId}-${slot}.webp`;
}
