import type { RoomKind } from '../types';

export type EncounterRole = 'melee' | 'ranged' | 'charger' | 'support' | 'guardian' | 'controller';

export interface EncounterSlot {
  role: EncounterRole;
  min: number;
  max: number;
}

export interface EncounterDefinition {
  id: 'foundry_impact' | 'foundry_chain' | 'foundry_prism' | 'foundry_combination' | 'foundry_trial' | 'foundry_regent' | 'pressure_lesson' | 'shield_and_support' | 'crossfire_charge' | 'controlled_ground';
  monsterIds?: string[];
  template?: string;
  name: string;
  minFloor: number;
  roomKinds: RoomKind[];
  slots: EncounterSlot[];
  intent: string;
  restrictions: string[];
}

export const ENCOUNTERS: EncounterDefinition[] = [
  { id: 'foundry_impact', name: '撞击试验场', template: 'impact-yard', minFloor: 7, roomKinds: [], slots: [], monsterIds: ['ram_beast'], intent: '引向裂纹隔板或墙体，趁眩晕输出；恢复时的低波可跳过或绕侧。', restrictions: ['显式房间配置，禁止混入随机怪物池'] },
  { id: 'foundry_chain', name: '共鸣工坊', template: 'resonance-workshop', minFloor: 8, roomKinds: [], slots: [], monsterIds: ['chain_smith', 'zombie', 'ruin_guardian'], intent: '命中铸链师打断供能，或击杀受益者令其失衡；持续伤害不受供能减伤。', restrictions: ['显式房间配置，禁止混入随机怪物池'] },
  { id: 'foundry_prism', name: '掩体射线厅', template: 'prism-gallery', minFloor: 8, roomKinds: [], slots: [], monsterIds: ['prism_sentry', 'slime'], intent: '射线方向锁定后横移，利用立柱遮挡，在射击后摇接近。', restrictions: ['显式房间配置，禁止混入随机怪物池'] },
  { id: 'foundry_combination', name: '过载枢纽', template: 'foundry-combination', minFloor: 9, roomKinds: [], slots: [], monsterIds: ['ram_beast', 'prism_sentry', 'slime'], intent: '冲锋与射线错峰施放；先利用掩体，再选择击杀目标。', restrictions: ['显式房间配置，禁止混入随机怪物池'] },
  { id: 'foundry_trial', name: '自愿过载试炼', template: 'overload-trial', minFloor: 9, roomKinds: [], slots: [], monsterIds: ['chain_smith', 'prism_sentry', 'orc_warrior', 'slime'], intent: '供能与远程交叉压力；完成后在装置处选择金币或打造材料。', restrictions: ['显式房间配置，禁止混入随机怪物池'] },
  { id: 'foundry_regent', name: '总炉核心', template: 'furnace-arena', minFloor: 10, roomKinds: [], slots: [], monsterIds: ['furnace_regent'], intent: '引导冲锋撞阀柱；跳过低位震波或走缺口，趁核心暴露反击。', restrictions: ['显式房间配置，禁止混入随机怪物池'] },
  { id: 'pressure_lesson', name: '泄压双环 · 阀门监工', minFloor: 6, roomKinds: [],
    slots: [{role: 'controller', min: 1, max: 1}],
    intent: '离开箭头管道，或直接命中监工打断蓄力；喷汽不能跳过。',
    restrictions: ['教学房仅一只监工', '两端保留换线口'] },
  {
    id: 'shield_and_support',
    name: '护卫仪式',
    minFloor: 3,
    roomKinds: ['battle', 'elite', 'exit'],
    slots: [
      { role: 'guardian', min: 1, max: 2 },
      { role: 'support', min: 1, max: 1 },
      { role: 'melee', min: 0, max: 3 },
    ],
    intent: '护卫挡住正面火力，支援者的可打断治疗要求玩家决定击杀顺序。',
    restrictions: ['支援者最多 1 只', '小房间只生成 1 名护卫', '不与区域控制者同时生成'],
  },
  {
    id: 'crossfire_charge',
    name: '追猎交叉火力',
    minFloor: 5,
    roomKinds: ['battle', 'elite', 'exit'],
    slots: [
      { role: 'ranged', min: 1, max: 3 },
      { role: 'charger', min: 1, max: 3 },
      { role: 'melee', min: 0, max: 2 },
    ],
    intent: '射手迫使玩家追击，冲锋者在移动路线上施压，并保留可利用的间隙。',
    restrictions: ['至少保留 3 格出生距离', '小房间同时冲锋者最多 1 只'],
  },
  {
    id: 'controlled_ground',
    name: '裂地围猎',
    minFloor: 6,
    roomKinds: ['battle', 'elite', 'exit'],
    slots: [
      { role: 'controller', min: 1, max: 1 },
      { role: 'melee', min: 1, max: 4 },
      { role: 'ranged', min: 0, max: 2 },
    ],
    intent: '控制者锁定玩家当前位置，近战单位追赶转移后的玩家，考验安全空间管理。',
    restrictions: ['区域控制者最多 1 只', '危险区总量受房间面积限制', '必须留有至少 15% 可走安全格'],
  },
];

export function encounterById(id: string | undefined): EncounterDefinition | undefined {
  return ENCOUNTERS.find(encounter => encounter.id === id);
}
