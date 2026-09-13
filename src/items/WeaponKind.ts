import type { Item } from '../types';

/** Shared by attack behavior, the rigged hero and both fallback view models. */
export function weaponKind(item: Item | null): 'staff' | 'sword' | null {
  if (!item || item.slot !== 'weapon') return null;
  const ids = [item.contentId ?? '', item.id];
  const staff = item.name.includes('法杖') || item.icon === 'staff' || ids.some(id =>
    id.startsWith('staff_') || id.startsWith('weapon_staff') || id.startsWith('starter_staff') || id.startsWith('starter_contract_staff'));
  return staff ? 'staff' : 'sword';
}
