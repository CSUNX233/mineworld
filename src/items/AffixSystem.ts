import type { Affix, Rarity, Slot, Stat, StatMap } from '../types';
import affixData from '../data/affixes.json';
import { RNG } from '../utils/RNG';
import { RARITY_ORDER } from '../data/recipes';

interface AffixDef {
  id: string;
  name: string;
  stat: Stat;
  min: number;
  max: number;
  weight: number;
  slots: Slot[];
}

const AFFIXES = affixData as unknown as AffixDef[];

const INTEGER_STATS = new Set<Stat>([
  'attack',
  'maxHealth',
  'armor',
  'strength',
  'agility',
  'vitality',
  'intelligence',
  'luck',
  'killHeal',
  'maxMana',
]);

const SPECIAL_AFFIXES: Affix[] = [
  {
    id: 'chain_lightning',
    name: '雷暴的',
    tier: 1,
    values: {},
    special: 'chainLightning',
  },
  {
    id: 'explosive_kill',
    name: '爆裂的',
    tier: 1,
    values: {},
    special: 'explosiveKill',
  },
  {
    id: 'aegis_walk',
    name: '壁垒的',
    tier: 1,
    values: {},
    special: 'aegisWalk',
  },
  {
    id: 'meteor',
    name: '陨星的',
    tier: 1,
    values: {},
    special: 'meteorOnAttack',
  },
  {
    id: 'bone_caller',
    name: '唤骨的',
    tier: 1,
    values: {},
    special: 'summonSkeletonOnKill',
  },
  {
    id: 'executioner',
    name: '处刑的',
    tier: 1,
    values: {},
    special: 'executeFullHealth',
  },
  {
    id: 'phantom',
    name: '幻影的',
    tier: 1,
    values: {},
    special: 'dashInvincibility',
  },
  {
    id: 'wildfire',
    name: '燎原的',
    tier: 1,
    values: {},
    special: 'fireTrail',
  },
  {
    id: 'blood_oath',
    name: '血誓的',
    tier: 1,
    values: {},
    special: 'lowHealthShield',
  },
];

export class AffixSystem {
  static rollAffixes(slot: Slot, rarity: Rarity, itemLevel: number, rng: RNG): Affix[] {
    const count = rng.int(0, 0);
    return count > 0 ? [] : [];
  }

  static generateAffixes(slot: Slot, rarity: Rarity, itemLevel: number, rng: RNG, count: number): Affix[] {
    const available = AFFIXES.filter((def) => def.slots.includes(slot));
    const picked: Affix[] = [];
    const used = new Set<string>();

    for (let i = 0; i < count && available.length > 0; i++) {
      const candidates = available.filter((def) => !used.has(def.id));
      if (candidates.length === 0) break;
      const def = rng.weighted(candidates);
      used.add(def.id);
      let value = this.rollValue(def, itemLevel, rng);
      if (def.id === 'renewing') {
        const rarityIndex = RARITY_ORDER.indexOf(rarity);
        const min = 2 + rarityIndex;
        const max = Math.min(20, 8 + rarityIndex * 3);
        value = Math.round(min + rng.float() * Math.max(0, max - min));
      }
      picked.push({
        id: `${def.id}_${itemLevel}_${i}`,
        name: def.name,
        tier: Math.max(1, Math.ceil(itemLevel / 7)),
        values: { [def.stat]: value },
      });
    }

    if (rarity === 'legendary') {
      const special = rng.pick(SPECIAL_AFFIXES);
      picked.push({ ...special, id: `${special.id}_${itemLevel}` });
    }

    return picked;
  }

  private static rollValue(def: AffixDef, itemLevel: number, rng: RNG): number {
    const scale = 1 + Math.max(0, itemLevel - 1) * 0.025;
    const raw = (def.min + rng.float() * (def.max - def.min)) * scale;
    return INTEGER_STATS.has(def.stat) ? Math.max(1, Math.round(raw)) : Number(raw.toFixed(4));
  }

  static describe(affix: Affix): string {
    if (affix.special === 'chainLightning') return '攻击有 15% 概率释放连锁闪电';
    if (affix.special === 'explosiveKill') return '击杀敌人时产生爆炸';
    if (affix.special === 'aegisWalk') return '移动时缓慢积累护盾';
    if (affix.special === 'meteorOnAttack') return '攻击有概率召唤陨石轰击目标';
    if (affix.special === 'summonSkeletonOnKill') return '击杀敌人时召唤骷髅为你作战';
    if (affix.special === 'executeFullHealth') return '满血时造成的伤害提高';
    if (affix.special === 'dashInvincibility') return '冲刺后短暂无敌';
    if (affix.special === 'fireTrail') return '移动时留下灼烧路径';
    if (affix.special === 'lowHealthShield') return '生命低于 30% 时获得护盾';
    return Object.entries(affix.values)
      .map(([stat, value]) => `${statLabel(stat as Stat)} +${formatValue(stat as Stat, value)}`)
      .join('，');
  }
}

export function statLabel(stat: Stat): string {
  const labels: Record<Stat, string> = {
    attack: '攻击',
    attackSpeed: '攻击速度',
    critChance: '暴击率',
    critDamage: '暴击伤害',
    maxHealth: '最大生命',
    armor: '护甲',
    moveSpeed: '移动速度',
    cooldown: '冷却缩减',
    pickupRange: '拾取范围',
    luck: '幸运',
    strength: '力量',
    agility: '敏捷',
    vitality: '体力',
    intelligence: '智力',
    lifeSteal: '生命偷取',
    killHeal: '击杀回复',
    maxMana: '最大法力',
    manaRegen: '法力回复',
    lifeRegen: '生命回复',
  };
  return labels[stat] ?? stat;
}

export function formatValue(stat: Stat, value: number): string {
  if (INTEGER_STATS.has(stat)) return String(value);
  if (stat === 'critChance' || stat === 'critDamage' || stat === 'lifeSteal' || stat === 'moveSpeed' || stat === 'attackSpeed' || stat === 'cooldown') {
    return `${Math.round(value * 100)}%`;
  }
  if (stat === 'manaRegen') return `${value.toFixed(1)}/s`;
  if (stat === 'lifeRegen') return `${value.toFixed(1)}/s`;
  return String(value);
}
