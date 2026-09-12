import type { Item } from '../types';

export type ItemArtSource = Pick<Item, 'icon'> & Partial<Pick<Item, 'id' | 'setId' | 'slot' | 'equipmentRulesVersion'>>;

const SET_IDS = new Set(['warlord', 'warbringer', 'frost', 'shadow', 'inferno', 'glacier',
  'venom', 'sanguine', 'storm', 'soul_banner', 'soul_pyre', 'embersteel']);
const SLOTS = new Set(['weapon', 'helmet', 'chest', 'legs', 'boots', 'ring', 'ring2', 'necklace', 'offhand']);

/** Resolve at display time so existing P5 saves receive artwork without changing item identity. */
export function equipmentArtPath(item: ItemArtSource): string | undefined {
  if ((item.equipmentRulesVersion ?? 1) < 2 || !item.setId || !SET_IDS.has(item.setId)
    || !item.slot || !SLOTS.has(item.slot)) return undefined;
  let slot = item.slot;
  if ((slot === 'ring' || slot === 'ring2') && item.id) {
    // Two visual designs, stable across inventory movement, upgrading, reforge and save/load.
    let hash = 2166136261;
    for (let i = 0; i < item.id.length; i++) hash = Math.imul(hash ^ item.id.charCodeAt(i), 16777619);
    slot = (hash >>> 0) % 2 === 0 ? 'ring' : 'ring2';
  }
  return `assets/ui/sunlit/equipment/${item.setId}-${slot}.webp`;
}
