import { cloneData } from '../utils/cloneData';
import type { ArchetypeId } from '../progression/types';
import type { Item } from '../types';

const STARTER_SWORD: Item = {
  id: 'starter_sword',
  name: '营地制式剑',
  slot: 'weapon',
  rarity: 'common',
  baseStats: { attack: 8, attackSpeed: 1.35, critChance: 0.03 },
  affixes: [],
  requiredLevel: 1,
  icon: 'sword',
  itemLevel: 1,
  sellPrice: 0,
  element: 'physical',
  flavor: '每次出发都会重新配发。',
};

const STARTER_STAFF: Item = {
  id: 'starter_staff',
  name: '营地余烬法杖',
  slot: 'weapon',
  rarity: 'common',
  baseStats: { attack: 8, attackSpeed: 0.9, intelligence: 2 },
  affixes: [],
  requiredLevel: 1,
  icon: 'hammer',
  itemLevel: 1,
  sellPrice: 0,
  element: 'fire',
  statusChance: 0.12,
  flavor: '足以点燃余烬法术的基础媒介。',
};

export function starterWeapon(archetype: ArchetypeId): Item {
  if (archetype === 'summoner') return { ...cloneData(STARTER_STAFF), id: 'starter_contract_staff', name: '营地契约法杖', element: 'shadow', statusChance: 0, icon: 'staff', flavor: '无需击杀即可补充亡者编队。' };
  return cloneData(archetype === 'arcanist' ? STARTER_STAFF : STARTER_SWORD);
}
