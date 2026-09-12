import type { Stat } from '../types';

export type CraftingTag = 'melee' | 'fire' | 'frost' | 'lightning' | 'poison' | 'summon' | 'resource' | 'defense';

export interface CraftingTagDefinition {
  id: CraftingTag;
  name: string;
  description: string;
  stats: readonly Stat[];
}

// Existing ordinary affixes contain no elemental or summon damage stat. These
// tags therefore favor real supporting stats rather than inventing damage rolls.
export const CRAFTING_TAGS: readonly CraftingTagDefinition[] = [
  { id: 'melee', name: '近战', description: '偏向攻击、攻速、力量、暴击与吸血；这些词条也可支援其他攻击。', stats: ['attack', 'attackSpeed', 'strength', 'critChance', 'critDamage', 'lifeSteal'] },
  { id: 'fire', name: '火焰', description: '偏向智力、冷却、法力回复与法力容量，支援火焰施法；不产生专属火伤。', stats: ['intelligence', 'cooldown', 'manaRegen', 'maxMana'] },
  { id: 'frost', name: '冰霜', description: '偏向智力、冷却、法力回复与法力容量，支援冰霜施法；不产生专属冰伤。', stats: ['intelligence', 'cooldown', 'manaRegen', 'maxMana'] },
  { id: 'lightning', name: '闪电', description: '偏向智力、冷却、攻速与暴击，支援施法和直接命中；不产生专属雷伤。', stats: ['intelligence', 'cooldown', 'attackSpeed', 'critChance'] },
  { id: 'poison', name: '毒', description: '偏向智力、冷却、攻速与击杀回复，支援持续攻击；不产生专属毒伤。', stats: ['intelligence', 'cooldown', 'attackSpeed', 'killHeal'] },
  { id: 'summon', name: '召唤', description: '偏向智力、冷却、法力回复与法力容量，支援召唤消耗；不产生召唤专属增伤或新单位。', stats: ['intelligence', 'cooldown', 'manaRegen', 'maxMana'] },
  { id: 'resource', name: '资源', description: '偏向法力容量、法力回复、冷却、生命回复与击杀回复。', stats: ['maxMana', 'manaRegen', 'cooldown', 'lifeRegen', 'killHeal'] },
  { id: 'defense', name: '防御', description: '偏向生命、护甲护盾、防御力、护盾恢复与体力。', stats: ['maxHealth', 'armor', 'defense', 'shieldRecoveryRate', 'vitality'] },
];

export function craftingTagDefinition(tag: CraftingTag): CraftingTagDefinition | undefined {
  return CRAFTING_TAGS.find((entry) => entry.id === tag);
}

export function craftingTagsForStat(stat: Stat): CraftingTag[] {
  return CRAFTING_TAGS.filter((entry) => entry.stats.includes(stat)).map((entry) => entry.id);
}
