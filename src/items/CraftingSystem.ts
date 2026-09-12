import type { Item, MaterialId } from '../types';
import { materialForItem } from '../data/materials';
import { RARITY_AFFIX_COUNT, RARITY_ORDER } from '../data/recipes';
import { AffixSystem } from './AffixSystem';
import { baseDefenseFromArmor } from './StatRules';
import { RNG } from '../utils/RNG';
import { craftingTagDefinition, type CraftingTag } from './CraftingTags';
import { equipmentSellPrice } from './ItemValue';

export type { CraftingTag } from './CraftingTags';

export interface ReforgeOptions {
  tag?: CraftingTag;
  lockedAffixId?: string;
}

export const MAX_REFORGES = 3;

export interface MaterialCost {
  materialId: MaterialId;
  amount: number;
}

export interface UpgradeCost {
  gold: number;
  materials: MaterialCost[];
}

export class CraftingSystem {
  static bulkSalvageYield(items: Item[]): MaterialCost[] {
    const totals = new Map<MaterialId, number>();
    for (const item of items) for (const entry of this.salvageYield(item)) {
      totals.set(entry.materialId, (totals.get(entry.materialId) ?? 0) + entry.amount);
    }
    return [...totals].map(([materialId, amount]) => ({ materialId, amount }));
  }

  static salvageYield(item: Item): MaterialCost[] {
    const materialId = materialForItem(item.rarity, item.slot);
    if (!materialId) return [];
    const rarityIndex = RARITY_ORDER.indexOf(item.rarity) + 1;
    const amount = Math.max(1, Math.round((item.itemLevel / 3) * rarityIndex * (item.rarity === 'legendary' ? 2 : 1)));
    return [{ materialId, amount }];
  }

  static upgradeCost(item: Item): UpgradeCost {
    const rarityIndex = RARITY_ORDER.indexOf(item.rarity) + 1;
    const gold = Math.round((25 + item.itemLevel * 8) * rarityIndex);
    const materials: MaterialCost[] = [];
    const primary = materialForItem(item.rarity, item.slot);
    if (primary) materials.push({ materialId: primary, amount: Math.max(1, Math.min(8, Math.ceil(item.itemLevel / 3))) });
    if (item.itemLevel >= 5) materials.push({ materialId: 'element_shard', amount: 1 });
    return { gold, materials };
  }

  static remainingReforges(item: Item): number {
    const count = item.reforgeCount ?? 0;
    return Number.isInteger(count) && count >= 0 ? Math.max(0, MAX_REFORGES - count) : 0;
  }

  static reforgeUnavailableReason(item: Item, options: ReforgeOptions = {}): string | undefined {
    if (!options || typeof options !== 'object' || Array.isArray(options)) return '无效的打造选项';
    if (Object.keys(options).some((key) => key !== 'tag' && key !== 'lockedAffixId')) return '无效的打造选项';
    if (this.remainingReforges(item) <= 0) return '本件装备的三次重铸额度已用完';
    const range = RARITY_AFFIX_COUNT[item.rarity];
    if (!range || range[1] === 0) return '此品质没有可重铸的普通词条';
    if (!Number.isInteger(item.itemLevel) || item.itemLevel < 1 || !Array.isArray(item.affixes)) return '装备数据无效';
    if (options.tag !== undefined && !craftingTagDefinition(options.tag)) return '无效的定向标签';
    const ordinary = item.affixes.filter((affix) => !affix.special);
    let locked = undefined;
    if (options.lockedAffixId !== undefined) {
      if (typeof options.lockedAffixId !== 'string') return '无效的保留词条';
      const matches = ordinary.filter((affix) => affix.id === options.lockedAffixId);
      if (matches.length !== 1) return '只能保留一个本件装备现有的普通词条';
      locked = matches[0];
    }
    const count = ordinary.length || range[0];
    if (count - (locked ? 1 : 0) <= 0) return '没有剩余可重抽的普通词条';
    const lockedDefinition = locked && AffixSystem.definitionId(locked);
    const candidates = AffixSystem.candidates(item.slot).filter((def) => def.id !== lockedDefinition);
    if (candidates.length === 0) return '本底材没有可重抽的普通词条';
    if (count - (locked ? 1 : 0) > candidates.length) return '本底材词条池不足以保留现有词条数量';
    if (options.tag && !candidates.some((def) => def.tags.includes(options.tag!))) return '本底材的剩余词条池不支持此标签';
    return undefined;
  }

  static canReforge(item: Item, options: ReforgeOptions = {}): boolean {
    return this.reforgeUnavailableReason(item, options) === undefined;
  }

  static reforgeCost(item: Item, options: ReforgeOptions = {}): UpgradeCost {
    const reason = this.reforgeUnavailableReason(item, options);
    if (reason) throw new Error(reason);
    const rarityIndex = RARITY_ORDER.indexOf(item.rarity) + 1;
    const surcharge = (options.tag ? 0.25 : 0) + (options.lockedAffixId ? 0.5 : 0);
    const gold = Math.round((35 + item.itemLevel * 9) * rarityIndex * (1 + surcharge));
    const materials: MaterialCost[] = [{ materialId: 'element_shard', amount: Math.max(1, Math.ceil(rarityIndex / 2)) }];
    if (options.tag) materials[0].amount += 1;
    if (options.lockedAffixId) materials[0].amount += 1;
    const primary = materialForItem(item.rarity, item.slot);
    if (primary && rarityIndex >= 3) materials.push({ materialId: primary, amount: Math.max(1, Math.ceil(item.itemLevel / 5)) });
    return { gold, materials };
  }

  static upgradeItem(item: Item): Item {
    const nextLevel = item.itemLevel + 1;
    const factor = 1.055;
    const baseStats = { ...item.baseStats };
    if (baseStats.defense === undefined && (baseStats.armor ?? 0) > 0) {
      baseStats.defense = baseDefenseFromArmor(baseStats.armor);
    }
    for (const [key, value] of Object.entries(baseStats)) {
      if (key === 'attackSpeed') continue;
      const raw = value * factor;
      const integer = ['attack', 'maxHealth', 'armor', 'defense', 'strength', 'agility', 'vitality', 'intelligence', 'maxMana', 'killHeal', 'luck'].includes(key);
      baseStats[key as keyof typeof baseStats] = integer ? Math.max(1, Math.round(raw)) : Number(raw.toFixed(4));
    }
    return {
      ...item,
      itemLevel: nextLevel,
      baseStats,
      requiredLevel: Math.max(1, nextLevel),
      sellPrice: equipmentSellPrice(item.rarity, nextLevel),
    };
  }

  static reforgeItem(item: Item, rng: RNG = new RNG((Math.random() * 0xffffffff) >>> 0), options: ReforgeOptions = {}): Item {
    const reason = this.reforgeUnavailableReason(item, options);
    if (reason) throw new Error(reason);
    const ordinary = item.affixes.filter((affix) => !affix.special);
    const locked = ordinary.find((affix) => affix.id === options.lockedAffixId);
    const lockedDefinition = locked && AffixSystem.definitionId(locked);
    const count = (ordinary.length || RARITY_AFFIX_COUNT[item.rarity][0]) - (locked ? 1 : 0);
    const rolled = AffixSystem.generateAffixes(item.slot, item.rarity, item.itemLevel, rng, count, {
      tag: options.tag,
      guaranteeTag: Boolean(options.tag),
      excludeAffixIds: lockedDefinition ? [lockedDefinition] : [],
      includeSpecial: false,
    });
    if (rolled.length === 0) throw new Error('没有可重抽的普通词条');
    const copyAffix = (affix: Item['affixes'][number]) => ({
      ...affix,
      values: { ...affix.values },
      ...(affix.valueModes ? { valueModes: { ...affix.valueModes } } : {}),
    });
    const affixes = [...(locked ? [copyAffix(locked)] : []), ...rolled, ...item.affixes.filter((affix) => affix.special).map(copyAffix)];
    const prefix = affixes.length > 0 ? `${affixes[0].name}` : '';
    return {
      ...item,
      name: item.contentId || item.setId ? item.name : prefix ? `${prefix}${item.name.replace(/^(.*?之|.*?的)?/, '')}` : item.name,
      affixes,
      reforgeCount: (item.reforgeCount ?? 0) + 1,
    };
  }
}
