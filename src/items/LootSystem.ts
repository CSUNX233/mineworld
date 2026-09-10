import type { Item, MonsterDefinition } from '../types';
import { ItemGenerator } from './ItemGenerator';

export type LootDrop =
  | { kind: 'gold'; amount: number }
  | { kind: 'health'; amount: number }
  | { kind: 'mana'; amount: number }
  | { kind: 'reforgeTicket'; amount: number }
  | { kind: 'item'; item: Item };

export class LootSystem {
  static rollLoot(
    monster: MonsterDefinition,
    floor: number,
    luck: number,
    isBoss = false,
    playerLevel: number = floor,
  ): LootDrop[] {
    const drops: LootDrop[] = [];
    drops.push({ kind: 'gold', amount: Math.round((3 + floor * 2 + Math.random() * floor * 4) * (1 + luck / 100)) });

    const healthChance = 0.08 + floor * 0.002;
    const manaChance = 0.06 + floor * 0.002;
    const itemChance = Math.min(0.65, 0.25 + floor * 0.01 + (isBoss ? 0.4 : 0));

    if (Math.random() < healthChance) drops.push({ kind: 'health', amount: 20 + floor * 3 });
    if (Math.random() < manaChance) drops.push({ kind: 'mana', amount: 12 + floor * 2 });
    if (Math.random() < 0.02) drops.push({ kind: 'reforgeTicket', amount: 1 });
    if (Math.random() < itemChance || isBoss) {
      drops.push({ kind: 'item', item: ItemGenerator.generate(floor, undefined, playerLevel, undefined, undefined, luck) });
    }
    return drops;
  }
}
