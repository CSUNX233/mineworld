import type { Item, MaterialId, ShopStockEntry, Rarity, Slot } from '../types';
import { MATERIALS } from '../data/materials';
import { RARITY_ORDER } from '../data/recipes';
import { ItemGenerator } from './ItemGenerator';
import { RNG } from '../utils/RNG';
import { CraftingSystem } from './CraftingSystem';

export const SHOP_SLOTS: { slot: Slot; label: string }[] = [
  { slot: 'weapon', label: '武器' }, { slot: 'helmet', label: '头盔' },
  { slot: 'chest', label: '胸甲' }, { slot: 'legs', label: '护腿' },
  { slot: 'boots', label: '靴子' }, { slot: 'ring', label: '戒指' },
  { slot: 'necklace', label: '项链' }, { slot: 'offhand', label: '副手' },
];

export class ShopSystem {
  static generateStock(floor: number, playerLevel: number, count: number, rng: RNG = new RNG((Math.random() * 0xffffffff) >>> 0)): ShopStockEntry[] {
    const stock: ShopStockEntry[] = [];
    for (let i = 0; i < count; i++) {
      const rarity = i === 0 ? 'magic' : i === 1 ? 'rare' : rng.weighted(this.gambleWeights(floor)).rarity;
      const item = ItemGenerator.generate(floor, rng, playerLevel, rarity);
      stock.push({ uid: `${item.id}_${i}_${rng.int(0, 99999)}`, item, price: this.itemPrice(item, floor) });
    }
    return stock;
  }

  static itemPrice(item: Item, floor = item.itemLevel): number {
    const rarityIndex = RARITY_ORDER.indexOf(item.rarity) + 1;
    const recovery = this.recoveryValue(item, floor);
    return Math.max(Math.ceil(recovery * 1.25), Math.round((8 + item.itemLevel * 4) * rarityIndex * rarityIndex));
  }

  static recoveryValue(item: Item, floor: number): number {
    return Math.max(item.sellPrice, CraftingSystem.salvageYield(item).reduce(
      (total, entry) => total + entry.amount * this.materialPrice(entry.materialId, floor), 0));
  }

  /** Expected main-route gold: two room rewards plus six/eight normal kills. */
  static floorIncome(floor: number): number {
    return (floor < 4 ? 6 : 8) * (3 + 4 * floor) + 2 * (10 + 2 * floor);
  }

  static refreshPrice(floor: number, refreshes: number): number {
    return Math.ceil(this.floorIncome(floor) * .2 * (1 + refreshes));
  }

  static healPrice(floor: number): number { return Math.ceil(this.floorIncome(floor) * .25); }

  static gambleWeights(floor: number): { rarity: Rarity; weight: number }[] {
    return floor < 5 ? [{ rarity: 'magic', weight: 75 }, { rarity: 'rare', weight: 25 }]
      : [{ rarity: 'magic', weight: 72 }, { rarity: 'rare', weight: 25 }, { rarity: 'epic', weight: 3 }];
  }

  static gamblePrice(floor: number, slot: Slot): number {
    const level = floor + 2;
    const expectedRecovery = this.gambleWeights(floor).reduce((total, entry) => {
      const multiplier = RARITY_ORDER.indexOf(entry.rarity) + 1;
      const item = { slot, rarity: entry.rarity, itemLevel: level, sellPrice: (5 + level * 2) * multiplier ** 2 } as Item;
      return total + this.recoveryValue(item, floor) * entry.weight / 100;
    }, 0);
    return Math.ceil(Math.max(this.floorIncome(floor) * .65, expectedRecovery * 1.35));
  }

  static gamble(floor: number, playerLevel: number, slot: Slot, rng: RNG): Item {
    return ItemGenerator.generate(floor, rng, playerLevel, rng.weighted(this.gambleWeights(floor)).rarity, slot);
  }

  static materialPrice(material: MaterialId, floor: number): number {
    const def = MATERIALS[material];
    return Math.max(2, Math.round(def.value * (1 + Math.max(0, floor - 1) * 0.04)));
  }
}
