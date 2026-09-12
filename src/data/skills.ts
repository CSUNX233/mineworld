import type { ElementType } from '../types';

export type SkillTrigger = 'active';
/** Self buffs, squad commands and global detonation do not consume directional aim. */
export function skillUsesDirectionalAim(id: string): boolean {
  return !['guard_counter', 'raise_company', 'soul_burst', 'frost_nova', 'detonate'].includes(id);
}
export type SkillTag = 'summon' | 'defense' | 'hybrid' | 'persistent' | 'area' | 'consume' | 'fire' | 'frost' | 'lightning' | 'melee' | 'movement' | 'physical' | 'projectile' | 'status';

export interface SkillDefinition {
  id: string;
  name: string;
  key: string;
  cooldown: number;
  manaCost: number;
  element: ElementType;
  statusChance?: number;
  icon: string;
  description: string;
  trigger: SkillTrigger;
  tags: readonly SkillTag[];
  talentId?: string;
  maxSlots?: number;
}

export const SKILLS: SkillDefinition[] = [
  { id: 'guard_counter', name: '架势反击', key: 'Digit4', cooldown: 7, manaCost: 10, element: 'physical', icon: 'shield', description: '进入 1.2 秒架势，下一次受击减伤，近处正面敌人的攻击触发反击；错过窗口无反击。', trigger: 'active', tags: ['physical', 'melee', 'defense'], talentId: 'melee_seed' },
  { id: 'seismic_slam', name: '裂地终结', key: 'Digit4', cooldown: 6, manaCost: 14, element: 'physical', icon: 'hammer', description: '沿瞄准方向震裂地面；消耗最多 3 层普攻蓄势提高伤害。', trigger: 'active', tags: ['physical', 'melee', 'area', 'consume'], talentId: 'melee_seed' },
  { id: 'raise_company', name: '亡者编队', key: 'Digit4', cooldown: 5, manaCost: 18, element: 'shadow', icon: 'summon', description: '消耗法力补充战士、护卫与射手；受容量约束，无需击杀启动。', trigger: 'active', tags: ['summon'], talentId: 'summon_seed' },
  { id: 'soul_burst', name: '灵魂献祭', key: 'Digit4', cooldown: 7, manaCost: 12, element: 'fire', icon: 'poison', description: '牺牲一名召唤物：战士爆发、射手范围点燃、护卫转化护盾。', trigger: 'active', tags: ['summon', 'fire', 'consume'], talentId: 'summon_seed' },
  { id: 'flame_rift', name: '燃烧裂隙', key: 'Digit4', cooldown: 6, manaCost: 16, element: 'fire', icon: 'fireball', description: '留下持续 3 秒的狭长火焰区域，每半秒灼烧范围内敌人，不穿墙。', trigger: 'active', tags: ['fire', 'area', 'persistent'], talentId: 'fire_seed' },
  { id: 'ember_blade', name: '余烬斩', key: 'Digit4', cooldown: 5, manaCost: 13, element: 'fire', icon: 'axe', description: '近距离斩击并吞噬目标剩余燃烧，换取即时爆发；需投入近战与火种。', trigger: 'active', tags: ['fire', 'melee', 'consume', 'hybrid'], talentId: 'ember_blade' },
  {
    id: 'whirlwind',
    name: '旋风斩',
    key: 'Digit1',
    cooldown: 4,
    manaCost: 12,
    element: 'physical',
    icon: '🌀',
    description: '横扫前方敌人，造成物理伤害并可能流血。',
    trigger: 'active',
    tags: ['physical', 'melee', 'area', 'status'],
  },
  {
    id: 'dash',
    name: '冲刺斩',
    key: 'Digit2',
    cooldown: 3,
    manaCost: 8,
    element: 'physical',
    icon: '💨',
    description: '向前冲刺并斩击路径上的敌人。',
    trigger: 'active',
    tags: ['physical', 'melee', 'movement'],
  },
  {
    id: 'fireball',
    name: '火球术',
    key: 'Digit3',
    cooldown: 2.5,
    manaCost: 10,
    element: 'fire',
    icon: '🔥',
    description: '发射火球；火种使其可点燃敌人。',
    trigger: 'active',
    tags: ['fire', 'projectile', 'status'],
  },
  {
    id: 'detonate',
    name: '焚火引爆',
    key: 'Digit4',
    cooldown: 4,
    manaCost: 12,
    element: 'fire',
    icon: '💥',
    description: '吞噬目标剩余燃烧，立即造成火焰伤害。',
    trigger: 'active',
    tags: ['fire', 'consume', 'status'],
    talentId: 'consuming_flame',
  },
  {
    id: 'frost_nova',
    name: '冰霜新星',
    key: 'Digit4',
    cooldown: 6,
    manaCost: 18,
    element: 'frost',
    icon: '❄️',
    description: '永冻 6 件解锁：冰霜冲击减速周围敌人；套装扩大范围并提高伤害。',
    trigger: 'active',
    tags: ['frost', 'area', 'status'],
    talentId: 'frost_nova',
  },
  {
    id: 'lightning_chain',
    name: '闪电链',
    key: 'Digit5',
    cooldown: 5,
    manaCost: 16,
    element: 'lightning',
    icon: '⚡',
    description: '风暴 4 件解锁：连锁闪电打击多个敌人并可能感电。',
    trigger: 'active',
    tags: ['lightning', 'projectile', 'status'],
    talentId: 'lightning_chain',
  },
];

export const DEFAULT_SKILL_LOADOUT = ['whirlwind', 'dash', 'fireball'];

export function skillById(id: string): SkillDefinition | undefined {
  return SKILLS.find((skill) => skill.id === id);
}

export function keyToLabel(key: string): string {
  return key.replace('Digit', '');
}
