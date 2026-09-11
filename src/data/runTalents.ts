import type { StatMap } from '../types';

export type RunTalentLane = 'core' | 'spreading' | 'consuming' | 'utility';

export interface RunTalentEffects {
  igniteChance?: number;
  igniteDuration?: number;
  igniteDamageRatioPerSecond?: number;
  guaranteedIgniteOnDirectFire?: boolean;
  spreadOnFireballHit?: boolean;
  spreadTargets?: number;
  spreadRadius?: number;
  spreadTargetsBonus?: number;
  spreadRadiusBonus?: number;
  fireballPierceBonus?: number;
  fireballDamageMultiplier?: number;
  burnDurationMultiplierBonus?: number;
  detonateUnlocked?: boolean;
  consumingBurnDuration?: number;
  fireballManaCostMultiplier?: number;
  detonateRemainingDamageMultiplier?: number;
  detonateRemainingDamageMultiplierBonus?: number;
  manaPerDetonateCast?: number;
  shieldPerDetonateCast?: number;
  shieldCapMaxHealthRatio?: number;
  lowHealthThreshold?: number;
  lowHealthConsumeMultiplier?: number;
  nonBossOnly?: boolean;
}

export interface RunTalentDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  lane: RunTalentLane;
  tier: number;
  requires?: readonly string[];
  excludes?: readonly string[];
  passive?: StatMap;
  effects?: Readonly<RunTalentEffects>;
}

/**
 * P2 only ships the fire tree. Its root guarantees ignition from direct fire
 * damage, and the basic fireball is always available without finding an item.
 */
export const RUN_TALENT_DEFS: readonly RunTalentDef[] = Object.freeze([
  {
    id: 'fire_seed',
    name: '火种',
    description: '直接火焰伤害必定点燃目标 3 秒，每秒造成该次原始火焰伤害 20% 的伤害。',
    cost: 1,
    lane: 'core',
    tier: 0,
    effects: {
      igniteChance: 1,
      igniteDuration: 3,
      igniteDamageRatioPerSecond: 0.2,
      guaranteedIgniteOnDirectFire: true,
    },
  },
  {
    id: 'spreading_flame',
    name: '蔓延之火',
    description: '火球伤害降低 20%、穿透 +1；每次命中把点燃传播给 3 米内至多 2 个敌人。',
    cost: 1,
    lane: 'spreading',
    tier: 1,
    requires: ['fire_seed'],
    excludes: ['consuming_flame'],
    effects: {
      spreadOnFireballHit: true,
      spreadTargets: 2,
      spreadRadius: 3,
      fireballPierceBonus: 1,
      fireballDamageMultiplier: 0.8,
    },
  },
  {
    id: 'ember_relay',
    name: '余烬接力',
    description: '火球额外穿透 1 个目标。',
    cost: 1,
    lane: 'spreading',
    tier: 2,
    requires: ['spreading_flame'],
    effects: { fireballPierceBonus: 1 },
  },
  {
    id: 'wide_wildfire',
    name: '燎原',
    description: '火球命中的点燃传播半径增加 1.5 米。',
    cost: 1,
    lane: 'spreading',
    tier: 3,
    requires: ['ember_relay'],
    effects: { spreadRadiusBonus: 1.5 },
  },
  {
    id: 'many_sparks',
    name: '万点火星',
    description: '每次燃烧扩散额外影响 2 个目标。',
    cost: 1,
    lane: 'spreading',
    tier: 3,
    requires: ['ember_relay'],
    effects: { spreadTargetsBonus: 2 },
  },
  {
    id: 'lasting_embers',
    name: '不熄余烬',
    description: '燃烧持续时间提高 40%。',
    cost: 2,
    lane: 'spreading',
    tier: 4,
    requires: ['wide_wildfire', 'many_sparks'],
    effects: { burnDurationMultiplierBonus: 0.4 },
  },
  {
    id: 'consuming_flame',
    name: '吞噬之火',
    description: '解锁主动引爆：燃烧延长至 4 秒；引爆消耗燃烧并造成 2 倍剩余伤害。火球耗蓝提高 20%。',
    cost: 1,
    lane: 'consuming',
    tier: 1,
    requires: ['fire_seed'],
    excludes: ['spreading_flame'],
    effects: {
      detonateUnlocked: true,
      consumingBurnDuration: 4,
      fireballManaCostMultiplier: 1.2,
      detonateRemainingDamageMultiplier: 2,
    },
  },
  {
    id: 'searing_appetite',
    name: '炽烈胃口',
    description: '引爆的剩余燃烧伤害倍率提高 0.5。',
    cost: 1,
    lane: 'consuming',
    tier: 2,
    requires: ['consuming_flame'],
    effects: { detonateRemainingDamageMultiplierBonus: 0.5 },
  },
  {
    id: 'mana_from_ashes',
    name: '烬中汲取',
    description: '每次成功引爆燃烧回复 4 点法力，不随命中目标数叠加。',
    cost: 1,
    lane: 'consuming',
    tier: 3,
    requires: ['searing_appetite'],
    effects: { manaPerDetonateCast: 4 },
  },
  {
    id: 'ash_guard',
    name: '灰烬护体',
    description: '每次成功引爆燃烧获得 8 点护盾，不随目标数叠加；额外护盾最多为最大生命 20%，不降低已有的更高护盾。',
    cost: 1,
    lane: 'consuming',
    tier: 3,
    requires: ['searing_appetite'],
    effects: { shieldPerDetonateCast: 8, shieldCapMaxHealthRatio: 0.2 },
  },
  {
    id: 'cremation',
    name: '火葬',
    description: '对生命不高于 25% 的非 Boss 敌人，引爆伤害翻倍。',
    cost: 2,
    lane: 'consuming',
    tier: 4,
    requires: ['mana_from_ashes', 'ash_guard'],
    effects: { lowHealthThreshold: 0.25, lowHealthConsumeMultiplier: 2, nonBossOnly: true },
  },
  {
    id: 'tempered_skin',
    name: '淬火皮肤',
    description: '防御力 +6。',
    cost: 1,
    lane: 'utility',
    tier: 1,
    passive: { defense: 6 },
  },
  {
    id: 'deep_reservoir',
    name: '深层魔力',
    description: '最大法力 +20。',
    cost: 1,
    lane: 'utility',
    tier: 1,
    passive: { maxMana: 20 },
  },
  {
    id: 'vital_spark',
    name: '生命火花',
    description: '最大生命 +24。',
    cost: 1,
    lane: 'utility',
    tier: 1,
    passive: { maxHealth: 24 },
  },
  {
    id: 'steady_flame',
    name: '稳定燃烧',
    description: '绝对技能冷却缩减增加 8 个百分点。',
    cost: 1,
    lane: 'utility',
    tier: 1,
    passive: { cooldown: 0.08 },
  },
  {
    id: 'scavenger_instinct',
    name: '拾荒本能',
    description: '幸运 +10。',
    cost: 1,
    lane: 'utility',
    tier: 1,
    passive: { luck: 10 },
  },
]);

export const RUN_TALENT_BY_ID: ReadonlyMap<string, RunTalentDef> = new Map(
  RUN_TALENT_DEFS.map((talent) => [talent.id, talent]),
);
