import type { ElementType } from '../types';

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
  },
  {
    id: 'fireball',
    name: '火球术',
    key: 'Digit3',
    cooldown: 5,
    manaCost: 14,
    element: 'fire',
    icon: '🔥',
    description: '发射火球，造成火焰伤害并可能燃烧。',
  },
  {
    id: 'frost_nova',
    name: '冰霜新星',
    key: 'Digit4',
    cooldown: 6,
    manaCost: 18,
    element: 'frost',
    icon: '❄️',
    description: '冻结周围敌人，造成冰霜伤害。',
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
    description: '连锁闪电打击多个敌人并可能感电。',
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
