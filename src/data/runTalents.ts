import type { StatMap } from '../types';

export type RunTalentLane =
  | 'core'
  | 'spreading'
  | 'consuming'
  | 'melee-core'
  | 'cleave'
  | 'guard'
  | 'summon-core'
  | 'legion'
  | 'elite'
  | 'hybrid'
  | 'utility';

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
  guardCounterUnlocked?: boolean;
  seismicSlamUnlocked?: boolean;
  raiseCompanyUnlocked?: boolean;
  soulBurstUnlocked?: boolean;
  flameRiftUnlocked?: boolean;
  emberBladeUnlocked?: boolean;
  cleaveDamageBonus?: number;
  seismicSlamDamageBonus?: number;
  counterDamageBonus?: number;
  counterDamageReductionOverride?: number;
  counterManaRefund?: number;
  counterShieldBonus?: number;
  summonCapacityBonus?: number;
  summonCapacityOverride?: number;
  summonDamageBonus?: number;
  summonGuardBonus?: number;
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
      flameRiftUnlocked: true,
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
    id: 'melee_seed',
    name: '战意',
    description: '解锁主动技能「架势反击」与「裂地终结」，普通攻击命中可为裂地终结积攒蓄势。',
    cost: 1,
    lane: 'melee-core',
    tier: 0,
    effects: { guardCounterUnlocked: true, seismicSlamUnlocked: true },
  },
  {
    id: 'melee_cleave',
    name: '断岳之势',
    description: '裂地终结伤害提高 45%，但架势反击减伤由 55% 降至 35%。',
    cost: 1,
    lane: 'cleave',
    tier: 1,
    requires: ['melee_seed'],
    excludes: ['melee_guard'],
    effects: { cleaveDamageBonus: 0.45, counterDamageReductionOverride: 0.35 },
  },
  {
    id: 'melee_cleave_edge',
    name: '裂阵锋芒',
    description: '裂地终结伤害再提高 25%。',
    cost: 1,
    lane: 'cleave',
    tier: 2,
    requires: ['melee_cleave'],
    effects: { cleaveDamageBonus: 0.25 },
  },
  {
    id: 'melee_cleave_aftershock',
    name: '余震追击',
    description: '裂地终结的最终伤害提高 30%。',
    cost: 1,
    lane: 'cleave',
    tier: 3,
    requires: ['melee_cleave_edge'],
    effects: { seismicSlamDamageBonus: 0.3 },
  },
  {
    id: 'melee_guard',
    name: '守势反击',
    description: '架势反击减伤提高至 70%、反击伤害提高 30%，成功反击回复 5 点法力并获得 10 点额外护盾；裂地终结伤害降低 25%。',
    cost: 1,
    lane: 'guard',
    tier: 1,
    requires: ['melee_seed'],
    excludes: ['melee_cleave'],
    effects: {
      cleaveDamageBonus: -0.25,
      counterDamageBonus: 0.3,
      counterDamageReductionOverride: 0.7,
      counterManaRefund: 5,
      counterShieldBonus: 10,
    },
  },
  {
    id: 'melee_guard_reserve',
    name: '回澜',
    description: '成功反击额外回复 3 点法力。',
    cost: 1,
    lane: 'guard',
    tier: 2,
    requires: ['melee_guard'],
    effects: { counterManaRefund: 3 },
  },
  {
    id: 'melee_guard_bastion',
    name: '壁垒回响',
    description: '反击伤害再提高 25%，成功反击额外获得 8 点护盾。',
    cost: 1,
    lane: 'guard',
    tier: 3,
    requires: ['melee_guard_reserve'],
    effects: { counterDamageBonus: 0.25, counterShieldBonus: 8 },
  },
  {
    id: 'summon_seed',
    name: '魂契',
    description: '解锁主动技能「亡者编队」与「灵魂献祭」，获得 4 点基础召唤容量。',
    cost: 1,
    lane: 'summon-core',
    tier: 0,
    effects: { raiseCompanyUnlocked: true, soulBurstUnlocked: true },
  },
  {
    id: 'summon_legion',
    name: '混编军团',
    description: '召唤容量从 4 提高至 6，但每个召唤物只造成 80% 伤害。',
    cost: 1,
    lane: 'legion',
    tier: 1,
    requires: ['summon_seed'],
    excludes: ['summon_elite'],
    effects: { summonCapacityBonus: 2, summonDamageBonus: -0.2 },
  },
  {
    id: 'summon_legion_drill',
    name: '协同操练',
    description: '混编召唤物的伤害倍率提高 10 个百分点。',
    cost: 1,
    lane: 'legion',
    tier: 2,
    requires: ['summon_legion'],
    effects: { summonDamageBonus: 0.1 },
  },
  {
    id: 'summon_legion_vanguard',
    name: '前列轮替',
    description: '召唤物提供的护卫效果提高 20%。',
    cost: 1,
    lane: 'legion',
    tier: 3,
    requires: ['summon_legion_drill'],
    effects: { summonGuardBonus: 0.2 },
  },
  {
    id: 'summon_elite',
    name: '精锐魂契',
    description: '召唤容量固定为 4；召唤物造成 125% 伤害，护卫效果提高 50%。',
    cost: 1,
    lane: 'elite',
    tier: 1,
    requires: ['summon_seed'],
    excludes: ['summon_legion'],
    effects: { summonCapacityOverride: 4, summonDamageBonus: 0.25, summonGuardBonus: 0.5 },
  },
  {
    id: 'summon_elite_training',
    name: '魂火精炼',
    description: '精锐召唤物的伤害倍率再提高 15 个百分点。',
    cost: 1,
    lane: 'elite',
    tier: 2,
    requires: ['summon_elite'],
    effects: { summonDamageBonus: 0.15 },
  },
  {
    id: 'summon_elite_guardian',
    name: '不灭近卫',
    description: '精锐召唤物提供的护卫效果再提高 25%。',
    cost: 1,
    lane: 'elite',
    tier: 3,
    requires: ['summon_elite_training'],
    effects: { summonGuardBonus: 0.25 },
  },
  {
    id: 'ember_blade',
    name: '余烬斩',
    description: '同时掌握战意与火种后，解锁主动技能「余烬斩」。',
    cost: 1,
    lane: 'hybrid',
    tier: 1,
    requires: ['melee_seed', 'fire_seed'],
    effects: { emberBladeUnlocked: true },
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
