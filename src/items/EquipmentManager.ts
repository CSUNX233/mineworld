import type { Item, Slot, StatMap } from '../types';
import { setDefinition } from '../data/sets';
import {
  addBaseStatMap,
  addStatMap,
  baseDefenseFromArmor,
  createStatBuckets,
  defaultAffixValueMode,
  resolveStat,
  resolveStats,
  type StatBuckets,
} from './StatRules';

export interface DerivedStats {
  maxHealth: number;
  maxMana: number;
  attack: number;
  baseAttackSpeed: number;
  attackSpeedBonus: number;
  critChance: number;
  critDamage: number;
  armor: number;
  defense: number;
  shieldRechargeDelay: number;
  moveSpeed: number;
  lifeSteal: number;
  killHeal: number;
  luck: number;
  pickupRange: number;
  manaRegen: number;
  lifeRegen: number;
  cooldownReduction: number;
  dodgeChance: number;
}

const ALL_SLOTS: Slot[] = ['weapon', 'helmet', 'chest', 'legs', 'boots', 'ring', 'ring2', 'necklace', 'offhand'];

const BASE_STATS: StatMap = {
  maxHealth: 100,
  maxMana: 50,
  attack: 5,
  critChance: 0.05,
  critDamage: 1.5,
  armor: 0,
  defense: 0,
  shieldRecoveryRate: 1,
  moveSpeed: 1,
  lifeSteal: 0,
  killHeal: 0,
  luck: 0,
  pickupRange: 2.2,
  manaRegen: 1,
  lifeRegen: 1,
  strength: 5,
  agility: 0,
  vitality: 5,
  intelligence: 5,
};

export interface SetBonusInfo {
  setId: string;
  count: number;
  effects: StatMap;
  equipmentRulesVersion?: number;
}

const EMPTY_STATS: StatMap = {};

export class EquipmentManager {
  private items: Partial<Record<Slot, Item>> = {};
  private cachedStats: DerivedStats | null = null;
  private cachedExtra: StatMap | null = null;
  private cachedSpecialCounts: Map<string, number> | null = null;
  get equipment(): Partial<Record<Slot, Item>> { return this.items; }
  set equipment(value: Partial<Record<Slot, Item>>) { this.items = value; this.invalidate(); }
  private invalidate(): void { this.cachedStats = null; this.cachedSpecialCounts = null; }

  equip(item: Item): Item | null {
    this.invalidate();
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
    this.invalidate();
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
    return this.getSpecialCount(special) > 0;
  }

  getSpecialCount(special: string): number {
    if (!this.cachedSpecialCounts) this.cachedSpecialCounts = this.buildSpecialCounts();
    return this.cachedSpecialCounts.get(special) ?? 0;
  }

  getTotalStats(): StatMap {
    return resolveStats(this.buildStatBuckets());
  }

  getActiveSetBonuses(): SetBonusInfo[] {
    const result: SetBonusInfo[] = [];
    this.groupSetCounts().forEach(({ count, setId, equipmentRulesVersion }) => {
      const setDef = setDefinition(setId, equipmentRulesVersion);
      if (!setDef) return;
      const bonuses = setDef.bonuses;
      const effects: StatMap = {};
      for (const [threshold, stats] of Object.entries(bonuses)) {
        if (count >= Number(threshold)) for (const [stat,value] of Object.entries(stats.stats)) {
          effects[stat as keyof StatMap] = (effects[stat as keyof StatMap] ?? 0) + (value ?? 0);
        }
      }
      const active = Object.keys(bonuses).some(threshold => count >= Number(threshold));
      if (active) result.push({ setId, count, effects, equipmentRulesVersion });
    });
    return result;
  }

  getP5SetCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    this.groupSetCounts().forEach(group => {
      if (group.equipmentRulesVersion >= 2) counts[group.setId] = group.count;
    });
    return counts;
  }

  private groupSetCounts(): Map<string, { setId: string; equipmentRulesVersion: number; count: number }> {
    const groups = new Map<string, { setId: string; equipmentRulesVersion: number; count: number }>();
    this.getEquippedItems().forEach(item => {
      if (!item.setId) return;
      const equipmentRulesVersion = (item.equipmentRulesVersion ?? 1) >= 2 ? 2 : 1;
      const key = `${equipmentRulesVersion}:${item.setId}`;
      const group = groups.get(key);
      if (group) group.count++;
      else groups.set(key, { setId: item.setId, equipmentRulesVersion, count: 1 });
    });
    return groups;
  }

  getActiveSetSpecials(): string[] {
    return [...this.getActiveSetSpecialCounts().keys()];
  }

  private buildSpecialCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    const add = (special: string): void => {
      counts.set(special, (counts.get(special) ?? 0) + 1);
    };
    this.getEquippedItems().forEach((item) => {
      item.affixes.forEach((affix) => {
        if (affix.special) add(affix.special);
      });
    });
    this.getActiveSetSpecialCounts().forEach((count, special) => {
      counts.set(special, (counts.get(special) ?? 0) + count);
    });
    return counts;
  }

  private getActiveSetSpecialCounts(): Map<string, number> {
    const specialCounts = new Map<string, number>();
    this.groupSetCounts().forEach(({ count, setId, equipmentRulesVersion }) => {
      const setDef = setDefinition(setId, equipmentRulesVersion);
      if (!setDef) return;
      const activeSpecials = new Set<string>();
      for (const [threshold, bonus] of Object.entries(setDef.bonuses)) {
        if (bonus.special && count >= Number(threshold)) activeSpecials.add(bonus.special);
      }
      activeSpecials.forEach((special) => {
        specialCounts.set(special, (specialCounts.get(special) ?? 0) + 1);
      });
    });
    return specialCounts;
  }

  getDerivedStats(extra: StatMap = EMPTY_STATS): DerivedStats {
    if (this.cachedStats && this.cachedExtra === extra) return this.cachedStats;
    this.cachedExtra = extra;
    const buckets = this.buildStatBuckets(extra);
    const strength = resolveStat(buckets, 'strength');
    const agility = Math.max(0, resolveStat(buckets, 'agility'));
    const vitality = resolveStat(buckets, 'vitality');
    const intelligence = resolveStat(buckets, 'intelligence');
    buckets.base.attack = (buckets.base.attack ?? 0) + strength * 1.5;
    buckets.base.maxHealth = (buckets.base.maxHealth ?? 0) + vitality * 8;
    buckets.base.maxMana = (buckets.base.maxMana ?? 0) + intelligence * 4;
    const stats = resolveStats(buckets);
    const weapon = this.get('weapon');
    const baseAttackSpeed = Math.max(0.15, Math.min(3.5, weapon?.baseStats.attackSpeed ?? 1));
    const actualAttackSpeed = Math.max(0.15, Math.min(3.5, stats.attackSpeed ?? baseAttackSpeed));
    const attackSpeedBonus = actualAttackSpeed / baseAttackSpeed - 1;

    this.cachedStats = {
      maxHealth: Math.max(1, stats.maxHealth ?? 0),
      maxMana: Math.max(0, stats.maxMana ?? 0),
      attack: Math.max(0, stats.attack ?? 0),
      baseAttackSpeed,
      attackSpeedBonus,
      critChance: Math.max(0, Math.min(0.65, stats.critChance ?? 0)),
      critDamage: Math.max(1, Math.min(3, stats.critDamage ?? 1.5)),
      armor: Math.max(0, stats.armor ?? 0),
      defense: Math.max(0, stats.defense ?? 0),
      shieldRechargeDelay: Math.max(2.5, 5 / Math.max(0.01, stats.shieldRecoveryRate ?? 1)),
      moveSpeed: Math.max(0, Math.min(2, stats.moveSpeed ?? 1)),
      lifeSteal: Math.max(0, Math.min(0.15, stats.lifeSteal ?? 0)),
      killHeal: stats.killHeal ?? 0,
      luck: stats.luck ?? 0,
      pickupRange: stats.pickupRange ?? 2.2,
      manaRegen: stats.manaRegen ?? 1,
      lifeRegen: Math.max(1, Math.min(stats.lifeRegen ?? 1, (stats.maxHealth ?? 1) * 0.03)),
      cooldownReduction: Math.max(0, Math.min(0.6, stats.cooldown ?? 0)),
      dodgeChance: Math.min(0.45, 0.05 + 0.35 * agility / (agility + 60)),
    };
    return this.cachedStats;
  }

  private buildStatBuckets(extra: StatMap = EMPTY_STATS): StatBuckets {
    const buckets = createStatBuckets(BASE_STATS);
    for (const item of this.getEquippedItems()) {
      const itemBase = { ...item.baseStats };
      if (itemBase.defense === undefined && (itemBase.armor ?? 0) > 0) {
        itemBase.defense = baseDefenseFromArmor(itemBase.armor);
      }
      delete itemBase.attackSpeed;
      addBaseStatMap(buckets, itemBase);
      if (item.slot !== 'weapon' && item.baseStats.attackSpeed) {
        addStatMap(buckets, { attackSpeed: item.baseStats.attackSpeed }, { attackSpeed: 'increased' }, 'flat');
      }
      item.affixes.forEach((affix) => {
        addStatMap(buckets, affix.values, affix.valueModes, defaultAffixValueMode);
      });
    }
    buckets.base.attackSpeed = Math.max(0.15, this.get('weapon')?.baseStats.attackSpeed ?? 1);
    this.groupSetCounts().forEach(({ count, setId, equipmentRulesVersion }) => {
      const setDef = setDefinition(setId, equipmentRulesVersion);
      if (!setDef) return;
      Object.entries(setDef.bonuses).forEach(([threshold, bonus]) => {
        if (count >= Number(threshold)) addStatMap(buckets, bonus.stats, bonus.valueModes, 'flat');
      });
    });
    addStatMap(buckets, extra, undefined, 'flat');
    return buckets;
  }
}
