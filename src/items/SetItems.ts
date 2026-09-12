import type { Item, StatMap } from '../types';
import { P5_SETS } from '../data/sets';

export interface EquipmentBaseDefinition {
  id: string;
  name: string;
  slot: Item['slot'];
  icon: string;
  baseStats: StatMap;
  setId?: string;
  tags?: string[];
}

/** Equal slot budgets keep set identity in mechanisms rather than raw attributes. */
const SLOT_TEMPLATES: EquipmentBaseDefinition[] = [
  { id: 'weapon', name: '战刃', slot: 'weapon', icon: 'sword', baseStats: { attack: 14, attackSpeed: 1, critChance: 0.03 } },
  { id: 'helmet', name: '头冠', slot: 'helmet', icon: 'helmet', baseStats: { maxHealth: 16, armor: 3 } },
  { id: 'chest', name: '胸甲', slot: 'chest', icon: 'chest', baseStats: { maxHealth: 24, armor: 5 } },
  { id: 'legs', name: '护腿', slot: 'legs', icon: 'legs', baseStats: { maxHealth: 18, armor: 4 } },
  { id: 'boots', name: '长靴', slot: 'boots', icon: 'boots', baseStats: { maxHealth: 10, armor: 2, moveSpeed: 0.04 } },
  { id: 'ring', name: '指环', slot: 'ring', icon: 'ring', baseStats: { critChance: 0.02, lifeSteal: 0.01 } },
  { id: 'necklace', name: '护符', slot: 'necklace', icon: 'necklace', baseStats: { maxHealth: 14, manaRegen: 1 } },
  { id: 'offhand', name: '符盾', slot: 'offhand', icon: 'shield', baseStats: { maxHealth: 18, armor: 4 } },
];

export const P5_SET_ITEMS: EquipmentBaseDefinition[] = Object.values(P5_SETS).flatMap(set =>
  SLOT_TEMPLATES.map(template => {
    // Staff names are also the existing game's explicit ranged-weapon discriminator.
    const staff = template.slot === 'weapon'
      && ['frost', 'glacier', 'inferno', 'storm', 'soul_banner', 'soul_pyre'].includes(set.id);
    return {
      ...template,
      id: `p5_${set.id}_${template.slot}`,
      name: `${set.name}${staff ? '法杖' : template.name}`,
      icon: staff ? 'hammer' : template.icon,
      baseStats: { ...template.baseStats },
      setId: set.id,
      tags: [...(set.tags ?? [])],
    };
  }),
);

/** Small base compensation keeps general gear useful without multiplying attack cadence. */
export const P5_GENERAL_ITEMS: EquipmentBaseDefinition[] = SLOT_TEMPLATES.map(template => ({
  ...template,
  id: `p5_general_${template.slot}`,
  name: `旅者${template.name}`,
  baseStats: Object.fromEntries(Object.entries(template.baseStats).map(([key, value]) =>
    [key, key === 'attackSpeed' ? value : Number((value * 1.08).toFixed(4))])),
}));

export const P5_BASE_ITEMS: EquipmentBaseDefinition[] = [...P5_GENERAL_ITEMS, ...P5_SET_ITEMS];
