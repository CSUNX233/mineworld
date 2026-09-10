import type { RoomKind } from '../types';

export type EncounterRole = 'melee' | 'ranged' | 'charger' | 'support' | 'guardian' | 'controller';

export interface EncounterSlot {
  role: EncounterRole;
  min: number;
  max: number;
}

export interface EncounterDefinition {
  id: 'shield_and_support' | 'crossfire_charge' | 'controlled_ground';
  name: string;
  minFloor: number;
  roomKinds: RoomKind[];
  slots: EncounterSlot[];
  intent: string;
  restrictions: string[];
}

export const ENCOUNTERS: EncounterDefinition[] = [
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
