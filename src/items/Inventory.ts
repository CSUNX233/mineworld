import type { Item } from '../types';
import { RARITY_ORDER } from '../data/recipes';

const SLOT_ORDER = ['weapon', 'helmet', 'chest', 'legs', 'boots', 'ring', 'ring2', 'necklace', 'offhand'];

export class Inventory {
  readonly capacity: number;
  items: Item[] = [];

  constructor(capacity = 48) {
    this.capacity = capacity;
  }

  add(item: Item): boolean {
    if (this.items.length >= this.capacity) return false;
    this.items.push(item);
    return true;
  }

  remove(index: number): Item | null {
    if (index < 0 || index >= this.items.length) return null;
    return this.items.splice(index, 1)[0] ?? null;
  }

  removeById(id: string): Item | null {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) return null;
    return this.remove(index);
  }

  hasSpace(): boolean {
    return this.items.length < this.capacity;
  }

  sort(): void {
    this.items.sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity)
      || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot)
      || b.itemLevel - a.itemLevel || a.name.localeCompare(b.name, 'zh-CN'));
  }
}
