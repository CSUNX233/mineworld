import type { MaterialId } from '../types';

export interface MaterialDefinition {
  id: MaterialId;
  name: string;
  color: string;
  value: number;
  sourceRarity: string[];
  sourceSlot: string[];
}

export const MATERIALS: Record<MaterialId, MaterialDefinition> = {
  iron: {
    id: 'iron',
    name: '铁块',
    color: '#aeb7c5',
    value: 4,
    sourceRarity: ['common', 'magic'],
    sourceSlot: ['weapon', 'helmet', 'chest', 'legs', 'boots', 'offhand'],
  },
  silver: {
    id: 'silver',
    name: '银锭',
    color: '#d9e2ec',
    value: 10,
    sourceRarity: ['magic', 'rare'],
    sourceSlot: ['weapon', 'ring', 'necklace', 'offhand'],
  },
  gold: {
    id: 'gold',
    name: '金锭',
    color: '#ffd24a',
    value: 22,
    sourceRarity: ['rare', 'epic'],
    sourceSlot: ['weapon', 'ring', 'necklace', 'helmet'],
  },
  mithril: {
    id: 'mithril',
    name: '秘银',
    color: '#7fc4ff',
    value: 45,
    sourceRarity: ['epic', 'legendary'],
    sourceSlot: ['weapon', 'chest', 'helmet', 'legs', 'boots', 'offhand'],
  },
  void_essence: {
    id: 'void_essence',
    name: '虚空精华',
    color: '#b06bff',
    value: 80,
    sourceRarity: ['legendary'],
    sourceSlot: ['ring', 'necklace', 'offhand'],
  },
  element_shard: {
    id: 'element_shard',
    name: '元素碎片',
    color: '#ff8cff',
    value: 28,
    sourceRarity: ['rare', 'epic', 'legendary'],
    sourceSlot: ['weapon', 'ring', 'necklace', 'offhand', 'helmet'],
  },
};

export const MATERIAL_ORDER: MaterialId[] = ['iron', 'silver', 'gold', 'mithril', 'element_shard', 'void_essence'];

export function materialForItem(rarity: string, slot: string): MaterialId | null {
  if (rarity === 'mythic') return 'void_essence';
  if (slot === 'ring2') slot = 'ring';
  for (const id of MATERIAL_ORDER) {
    const def = MATERIALS[id];
    if (def.sourceRarity.includes(rarity) && def.sourceSlot.includes(slot)) return id;
  }
  return null;
}
