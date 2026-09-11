import type { ElementType } from '../types';

export type SkillTrigger = 'active';
export type SkillTag = 'area' | 'consume' | 'fire' | 'frost' | 'lightning' | 'melee' | 'movement' | 'physical' | 'projectile' | 'status';

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
