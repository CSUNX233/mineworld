import type { Item, Slot, StatMap } from '../types';
import { SETS } from '../data/sets';

export interface DerivedStats {
  maxHealth: number;
  maxMana: number;
  attack: number;
  baseAttackSpeed: number;
  attackSpeedBonus: number;
  critChance: number;
  critDamage: number;
  armor: number;
  moveSpeed: number;
  lifeSteal: number;
  killHeal: number;
  luck: number;
  pickupRange: number;
  manaRegen: number;
  lifeRegen: number;
}

const ALL_SLOTS: Slot[] = ['weapon', 'helmet', 'chest', 'legs', 'boots', 'ring', 'ring2', 'necklace', 'offhand'];

const BASE_STATS: StatMap = {
  maxHealth: 100,
  maxMana: 50,
  attack: 5,
  critChance: 0.05,
  critDamage: 0,
  armor: 0,
  moveSpeed: 1,
  lifeSteal: 0,
  killHeal: 0,
  luck: 0,
  pickupRange: 2.2,
  manaRegen: 1,
  lifeRegen: 1,
  strength: 5,
  agility: 5,
  vitality: 5,
  intelligence: 5,
};

export interface SetBonusInfo {
  setId: string;
  count: number;
  effects: StatMap;
}

export class EquipmentManager {
  equipment: Partial<Record<Slot, Item>> = {};

  equip(item: Item): Item | null {
    if (item.slot === 'ring') {
      const target: Slot = this.equipment.ring ? 'ring2' : 'ring';
      const previous = this.equipment[target] ?? null;
      this.equipment[target] = item;
      return previous;
    }
    const previous = this.equipment[item.slot] ?? null;
    this.equipment[item.slot] = item;
    return previous;
  }

  unequip(slot: Slot): Item | null {
    const item = this.equipment[slot] ?? null;
    delete this.equipment[slot];
    return item;
  }

  get(slot: Slot): Item | null {
    return this.equipment[slot] ?? null;
  }

  getEquippedItems(): Item[] {
    return ALL_SLOTS.map((slot) => this.equipment[slot]).filter((item): item is Item => Boolean(item));
  }

  hasSpecial(special: string): boolean {
    const itemSpecial = this.getEquippedItems().some((item) => item.affixes.some((affix) => affix.special === special));
    const setSpecial = this.getActiveSetSpecials().includes(special);
    return itemSpecial || setSpecial;
  }

  getTotalStats(): StatMap {
    const totals: StatMap = { ...BASE_STATS };
    const add = (stats?: StatMap): void => {
      if (!stats) return;
      for (const [key, value] of Object.entries(stats)) {
        totals[key as keyof StatMap] = (totals[key as keyof StatMap] ?? 0) + (value ?? 0);
      }
    };

    for (const item of this.getEquippedItems()) {
      add(item.baseStats);
      item.affixes.forEach((affix) => add(affix.values));
    }
    this.getActiveSetBonuses().forEach((set) => add(set.effects));
    return totals;
  }

  getActiveSetBonuses(): SetBonusInfo[] {
    const counts = new Map<string, number>();
    this.getEquippedItems().forEach((item) => {
      if (!item.setId) return;
      counts.set(item.setId, (counts.get(item.setId) ?? 0) + 1);
    });
    const result: SetBonusInfo[] = [];
    counts.forEach((count, setId) => {
      const setDef = SETS[setId];
      if (!setDef) return;
      const bonuses = setDef.bonuses;
      const effects: StatMap = {};
      for (const [threshold, stats] of Object.entries(bonuses)) {
        if (count >= Number(threshold)) Object.assign(effects, stats.stats);
      }
      if (Object.keys(effects).length > 0) result.push({ setId, count, effects });
    });
    return result;
  }

  getActiveSetSpecials(): string[] {
    const counts = new Map<string, number>();
    this.getEquippedItems().forEach((item) => {
      if (!item.setId) return;
      counts.set(item.setId, (counts.get(item.setId) ?? 0) + 1);
    });
    const specials = new Set<string>();
    counts.forEach((count, setId) => {
      const setDef = SETS[setId];
      if (!setDef) return;
      for (const [threshold, bonus] of Object.entries(setDef.bonuses)) {
        if (bonus.special && count >= Number(threshold)) specials.add(bonus.special);
      }
    });
    return [...specials];
  }

  getDerivedStats(extra: StatMap = {}): DerivedStats {
    const stats = { ...this.getTotalStats() };
    for (const [key, value] of Object.entries(extra)) {
      stats[key as keyof StatMap] = (stats[key as keyof StatMap] ?? 0) + (value ?? 0);
    }
    const weapon = this.get('weapon');
    const baseAttackSpeed = weapon?.baseStats.attackSpeed ?? 1;
    const attackSpeedBonus = stats.attackSpeed ?? 0;
    const strength = stats.strength ?? 5;
    const vitality = stats.vitality ?? 5;
    const intelligence = stats.intelligence ?? 5;

    return {
      maxHealth: (stats.maxHealth ?? 0) + vitality * 8,
      maxMana: (stats.maxMana ?? 0) + intelligence * 4,
      attack: (stats.attack ?? 0) + strength * 1.5,
      baseAttackSpeed,
      attackSpeedBonus,
      critChance: stats.critChance ?? 0,
      critDamage: 1.5 + (stats.critDamage ?? 0),
      armor: stats.armor ?? 0,
      moveSpeed: stats.moveSpeed ?? 1,
      lifeSteal: stats.lifeSteal ?? 0,
      killHeal: stats.killHeal ?? 0,
      luck: stats.luck ?? 0,
      pickupRange: stats.pickupRange ?? 2.2,
      manaRegen: stats.manaRegen ?? 1,
      lifeRegen: stats.lifeRegen ?? 1,
    };
  }
}
