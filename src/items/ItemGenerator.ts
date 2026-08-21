import type { ElementType, Item, Rarity, StatMap } from '../types';
import itemData from '../data/items.json';
import { RARITY_AFFIX_COUNT, RARITY_ORDER, rarityWeightsForFloor } from '../data/recipes';
import { AffixSystem } from './AffixSystem';
import { RNG } from '../utils/RNG';

interface BaseItemDef {
  id: string;
  name: string;
  slot: Item['slot'];
  icon: string;
  baseStats: StatMap;
  setId?: string;
}

const BASE_ITEMS = itemData as unknown as BaseItemDef[];

const LEGENDARY_FLAVORS = [
  '它记得所有主人的名字，但从未回答过其中任何一人。',
  '血不会让它变钝，只会让它更饿。',
  '这力量从不许诺救赎，只在你身后低语：再近一点。',
  '当深渊第一次睁开眼，它就已经在你的手中。',
  '死者的余烬仍在剑锋上燃烧，等待下一次苏醒。',
  '命运把它交给你，不是因为你有资格，而是因为只剩你了。',
  '它被锻造于世界尚未有名字的年代。',
  '每一道裂纹里，都藏着一个未被偿还的誓言。',
];

export class ItemGenerator {
  static generate(
    floor: number,
    rng: RNG = new RNG((Math.random() * 0xffffffff) >>> 0),
    playerLevel: number = floor,
  ): Item {
    const base = rng.pick(BASE_ITEMS);
    const rarity = rng.weighted(rarityWeightsForFloor(floor)).rarity;
    const itemLevel = Math.max(1, floor + rng.int(-1, 2));
    const [minAffixes, maxAffixes] = RARITY_AFFIX_COUNT[rarity];
    const affixCount = rng.int(minAffixes, maxAffixes);
    const affixes = AffixSystem.generateAffixes(base.slot, rarity, itemLevel, rng, affixCount);

    const baseStats: StatMap = {};
    for (const [key, value] of Object.entries(base.baseStats)) {
      baseStats[key as keyof StatMap] = this.scaleBaseStat(key, value, itemLevel);
    }

    const prefix = affixes.length > 0 ? `${affixes[0].name}` : '';
    const name = prefix ? `${prefix}${base.name}` : base.name;
    const sellPrice = this.sellPrice(rarity, itemLevel);
    const element = this.elementForBase(base);
    const statusChance = element === 'physical' ? undefined : 0.08;

    return {
      id: `${base.id}_${rarity}_${itemLevel}_${rng.int(0, 999999)}`,
      name,
      slot: base.slot,
      rarity,
      baseStats,
      affixes,
      requiredLevel: Math.max(1, Math.min(itemLevel, Math.max(1, playerLevel))),
      icon: base.icon,
      itemLevel,
      sellPrice,
      setId: base.setId,
      element,
      statusChance,
      flavor: rarity === 'legendary' ? rng.pick(LEGENDARY_FLAVORS) : undefined,
    };
  }

  private static elementForBase(base: BaseItemDef): ElementType {
    if (base.setId === 'inferno') return 'fire';
    if (base.setId === 'glacier' || base.setId === 'frost') return 'frost';
    if (base.setId === 'storm') return 'lightning';
    if (base.setId === 'venom') return 'poison';
    if (base.setId === 'shadow') return 'shadow';
    return 'physical';
  }

  private static scaleBaseStat(key: string, value: number, itemLevel: number): number {
    if (key === 'attackSpeed') return value;
    const scale = 1 + Math.max(0, itemLevel - 1) * 0.055;
    const raw = value * scale;
    const integer = ['attack', 'maxHealth', 'armor', 'strength', 'agility', 'vitality', 'intelligence'].includes(key);
    return integer ? Math.max(1, Math.round(raw)) : Number(raw.toFixed(4));
  }

  private static sellPrice(rarity: Rarity, itemLevel: number): number {
    const multiplier = RARITY_ORDER.indexOf(rarity) + 1;
    return Math.round((5 + itemLevel * 2) * multiplier * multiplier);
  }
}
