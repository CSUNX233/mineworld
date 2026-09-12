import type { Item, Slot } from '../types';
import { P5_SETS } from '../data/sets';

/** Stable ties and the actual worn slots make shop assistance predictable. */
export function missingSetCommission(items: Item[]): { id: string; name: string; slots: Slot[] } | undefined {
  const groups = new Map<string, Item[]>();
  for (const item of items) if ((item.equipmentRulesVersion ?? 1) >= 2 && item.setId && P5_SETS[item.setId]) {
    const group = groups.get(item.setId) ?? []; group.push(item); groups.set(item.setId, group);
  }
  const ordered = [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  for (const [id, worn] of ordered) {
    if (worn.length >= 4) continue;
    const slots: Slot[] = ['weapon', 'helmet', 'chest', 'legs', 'boots', 'ring', 'necklace', 'offhand'];
    const missing = slots.filter(slot => slot === 'ring'
      ? worn.filter(item => item.slot === 'ring' || item.slot === 'ring2').length < 2
      : !worn.some(item => item.slot === slot));
    if (missing.length) return { id, name: P5_SETS[id].name, slots: missing };
  }
  return undefined;
}
