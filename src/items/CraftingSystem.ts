import type { Item, MaterialId } from '../types';
import { materialForItem } from '../data/materials';
import { RARITY_AFFIX_COUNT, RARITY_ORDER } from '../data/recipes';
import { AffixSystem } from './AffixSystem';
import { baseDefenseFromArmor } from './StatRules';
import { RNG } from '../utils/RNG';

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

  static reforgeCost(item: Item): UpgradeCost {
    const rarityIndex = RARITY_ORDER.indexOf(item.rarity) + 1;
    const gold = Math.round((35 + item.itemLevel * 9) * rarityIndex);
    const materials: MaterialCost[] = [{ materialId: 'element_shard', amount: Math.max(1, Math.ceil(rarityIndex / 2)) }];
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
      id: `${item.id.split('_')[0]}_up_${nextLevel}_${Math.floor(Math.random() * 999999)}`,
      itemLevel: nextLevel,
      baseStats,
      requiredLevel: Math.max(1, nextLevel),
      sellPrice: Math.round(item.sellPrice * 1.2),
    };
  }

  static reforgeItem(item: Item, rng: RNG = new RNG((Math.random() * 0xffffffff) >>> 0)): Item {
    const [min, max] = RARITY_AFFIX_COUNT[item.rarity];
    const count = rng.int(min, max);
    const affixes = AffixSystem.generateAffixes(item.slot, item.rarity, item.itemLevel, rng, count);
    const prefix = affixes.length > 0 ? `${affixes[0].name}` : '';
    return {
      ...item,
      id: `${item.id.split('_')[0]}_rf_${item.itemLevel}_${rng.int(0, 999999)}`,
      name: prefix ? `${prefix}${item.name.replace(/^(.*?之|.*?的)?/, '')}` : item.name,
      affixes,
    };
  }
}
