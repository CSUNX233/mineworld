import type { Item, MaterialId, ShopStockEntry } from '../types';
import { MATERIALS } from '../data/materials';
import { RARITY_ORDER } from '../data/recipes';
import { ItemGenerator } from './ItemGenerator';
import { RNG } from '../utils/RNG';

export class ShopSystem {
  static generateStock(floor: number, playerLevel: number, count: number, rng: RNG = new RNG((Math.random() * 0xffffffff) >>> 0)): ShopStockEntry[] {
    const stock: ShopStockEntry[] = [];
    for (let i = 0; i < count; i++) {
      const item = ItemGenerator.generate(floor, rng, playerLevel);
      stock.push({ uid: `${item.id}_${i}_${rng.int(0, 99999)}`, item, price: this.itemPrice(item) });
    }
    return stock;
  }

  static itemPrice(item: Item): number {
    const rarityIndex = RARITY_ORDER.indexOf(item.rarity) + 1;
    return Math.max(item.sellPrice, Math.round((8 + item.itemLevel * 4) * rarityIndex * rarityIndex));
  }

  static materialPrice(material: MaterialId, floor: number): number {
    const def = MATERIALS[material];
    return Math.max(2, Math.round(def.value * (1 + Math.max(0, floor - 1) * 0.04)));
  }
}
