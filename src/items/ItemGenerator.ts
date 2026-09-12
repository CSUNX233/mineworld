import type { ElementType, Item, Rarity, StatMap } from '../types';
import itemData from '../data/items.json';
import { RARITY_AFFIX_COUNT, rarityWeightsForFloor } from '../data/recipes';
import { AffixSystem } from './AffixSystem';
import { baseDefenseFromArmor } from './StatRules';
import { RNG } from '../utils/RNG';
import type { ArchetypeId } from '../progression/types';
import { matchesRewardPreference, p5PreferredCandidates, REWARD_PREFERENCE_CHANCE, type EquipmentMechanismTag } from './RewardPreference';
import { P5_BASE_ITEMS } from './SetItems';
import { equipmentSellPrice } from './ItemValue';

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
    rarityOverride?: Rarity,
    slotOverride?: Item['slot'],
    luck = 0,
    rewardPreference?: ArchetypeId,
    forcePreference = false,
    equipmentRulesVersion = 1,
    mechanism?: EquipmentMechanismTag,
    setOverride?: string,
  ): Item {
    const pool = equipmentRulesVersion >= 2 ? P5_BASE_ITEMS : BASE_ITEMS;
    const baseSlot = equipmentRulesVersion >= 2 && slotOverride === 'ring2' ? 'ring' : slotOverride;
    const candidates = baseSlot ? pool.filter(base => base.slot === baseSlot) : pool;
    let base = rng.pick(candidates);
    const rarity = rarityOverride ?? rng.weighted(rarityWeightsForFloor(floor, luck)).rarity;
    if (rewardPreference && (forcePreference || rng.chance(REWARD_PREFERENCE_CHANCE))) {
      const preferredCandidates = equipmentRulesVersion >= 2
        ? p5PreferredCandidates(candidates, rewardPreference, mechanism)
        : candidates.filter(candidate => matchesRewardPreference(candidate, rewardPreference));
      if (preferredCandidates.length > 0) base = rng.pick(preferredCandidates);
    }
    if (equipmentRulesVersion >= 2 && setOverride) {
      const matching = candidates.filter(candidate => candidate.setId === setOverride);
      if (matching.length) base = rng.pick(matching);
    }
    const itemLevel = Math.max(1, floor + rng.int(-1, 2));
    const [minAffixes, maxAffixes] = RARITY_AFFIX_COUNT[rarity];
    const affixCount = rng.int(minAffixes, maxAffixes);
    const affixes = AffixSystem.generateAffixes(base.slot, rarity, itemLevel, rng, affixCount);

    const baseStats: StatMap = {};
    for (const [key, value] of Object.entries(base.baseStats)) {
      baseStats[key as keyof StatMap] = this.scaleBaseStat(key, value, itemLevel);
    }
    if (baseStats.defense === undefined && (baseStats.armor ?? 0) > 0) {
      baseStats.defense = baseDefenseFromArmor(baseStats.armor);
    }

    const prefix = affixes.length > 0 ? `${affixes[0].name}` : '';
    const name = prefix ? `${prefix}${base.name}` : base.name;
    const sellPrice = equipmentSellPrice(rarity, itemLevel);
    const element = this.elementForBase(base);
    const statusChance = element === 'physical' ? undefined : 0.08;

    return {
      id: `${base.id}_${rarity}_${itemLevel}_${rng.int(0, 999999)}`,
      ...(equipmentRulesVersion >= 2 ? { contentId: base.id, equipmentRulesVersion: 2 } : {}),
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
    if (base.setId === 'inferno' || base.setId === 'embersteel' || base.setId === 'soul_pyre') return 'fire';
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
    const integer = ['attack', 'maxHealth', 'armor', 'defense', 'strength', 'agility', 'vitality', 'intelligence'].includes(key);
    return integer ? Math.max(1, Math.round(raw)) : Number(raw.toFixed(4));
  }

}
