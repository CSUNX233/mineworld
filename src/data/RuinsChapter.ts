import type { FloorTheme, Room } from '../types';
import type { TacticalRoomTemplateId } from './rooms';
import type { RoomShape } from '../world/MapLayout';

export interface ChapterRoomSpec {
  template: TacticalRoomTemplateId;
  width?: number;
  depth?: number;
  shape?: RoomShape;
  centerOffsetX?: number;
}
export interface ChapterEncounterSpec {
  monsterIds: readonly string[];
  intent: string;
  /** Base XP paid once on room clear, compensating deliberate low-cost teaching squads. */
  clearXp?: number;
}
export const RUINS_CHAPTER = { firstFloor: 1, lastImplementedFloor: 5, teachingRoom: 'room-0', trialRoom: 'room-6', supplyRoom: 'room-5', bossId: 'oath_gatekeeper' } as const;
export const RUINS_FLOORS: Readonly<Record<number, { name: string; rooms: Readonly<Record<string, ChapterRoomSpec>> }>> = {
  1: { name: '苔痕荒庭', rooms: {
    'room-0': { template: 'ruins-court', width: 14, depth: 12, shape: 'cut-corners' },
    'room-4': { template: 'ruins-double-path', width: 14, depth: 12 },
    'room-5': { template: 'ruins-supply', width: 14, depth: 13, centerOffsetX: -3 },
  } },
  2: { name: '废弃驻所', rooms: {
    'room-0': { template: 'ruins-bulwark', width: 15, depth: 13 },
    'room-2': { template: 'ruins-court', width: 13, depth: 12, shape: 'cut-corners' },
    'room-4': { template: 'ruins-barracks', width: 14, depth: 12, shape: 'l-shape' },
    'room-5': { template: 'ruins-supply', width: 14, depth: 13, centerOffsetX: -3 },
  } },
  3: { name: '失誓礼所', rooms: {
    'room-0': { template: 'ruins-chapel', width: 16, depth: 13, shape: 'twin-hall' },
    'room-2': { template: 'ruins-double-path', width: 14, depth: 12 },
    'room-4': { template: 'ruins-barracks', width: 14, depth: 12, shape: 'cut-corners' },
    'room-5': { template: 'ruins-supply', width: 14, depth: 13, centerOffsetX: -3 },
  } },
  4: { name: '断旗城垣', rooms: {
    'room-0': { template: 'ruins-court', width: 15, depth: 13, shape: 'cut-corners' },
    'room-2': { template: 'ruins-armory', width: 16, depth: 14, shape: 'u-shape' },
    'room-4': { template: 'ruins-ring', width: 16, depth: 14, shape: 'cut-corners' },
    'room-6': { template: 'ruins-trial', width: 16, depth: 14, shape: 'u-shape' },
  } },
  5: { name: '沉铁王门', rooms: {
    'room-4': { template: 'ruins-bulwark', width: 13, depth: 11 },
    'room-1': { template: 'ruins-gate-arena', width: 19, depth: 17, shape: 'octagon' },
  } },
};

const ENCOUNTERS: Readonly<Record<number, Record<string, ChapterEncounterSpec>>> = {
  1: {
    'room-0': { monsterIds: ['slime','slime','zombie','slime'], intent: '宽庭清扫：连续攻击、技能与拾取。' },
    'room-4': { monsterIds: ['zombie','slime','slime','slime'], clearXp: 10, intent: '坍拱两侧均可接近，任一路都能推进。' },
  },
  2: {
    'room-0': { monsterIds: ['ruin_guardian'], intent: '单盾卫首遇：观察正面，沿宽侧路绕后。' },
    'room-2': { monsterIds: ['slime','slime','zombie','slime'], intent: '开阔清扫，试用新装备与技能。' },
    'room-4': { monsterIds: ['orc_warrior','zombie','zombie'], intent: '从交错营房的两条宽路接近步卒。' },
  },
  3: {
    'room-0': { monsterIds: ['ruin_acolyte','zombie','slime'], intent: '先打断有限治疗，或快速击杀连线目标；两侧都能近身。' },
    'room-2': { monsterIds: ['slime','slime','zombie','orc_warrior','slime'], intent: '清扫双径，检查材料与本层商店。' },
    'room-4': { monsterIds: ['skeleton','orc_warrior','zombie','slime'], intent: '射手射后停顿时从侧路接近。' },
  },
  4: {
    'room-0': { monsterIds: ['slime','slime','slime','slime','zombie'], intent: '荒庭群攻，发挥初步构筑。' },
    'room-2': { monsterIds: ['zombie','orc_warrior','zombie'], intent: '宽军械庭保留中央横穿，清扫后推进。' },
    'room-4': { monsterIds: ['ruin_guardian','skeleton','slime','slime'], clearXp: 40, intent: '盾卫与射手：换侧路并决定优先目标。' },
    'room-6': { monsterIds: ['ruin_guardian','skeleton','zombie'], intent: '自愿军械挑战：一波盾卫与射手，完成选择金币或材料。' },
  },
  5: {
    'room-4': { monsterIds: ['orc_warrior','zombie'], intent: '短热身后进入王门，准备第一章阶段检验。' },
    'room-1': { monsterIds: ['oath_gatekeeper'], intent: '断誓门卫：绕侧、打断，并在完整后摇使用技能。' },
  },
};

export function ruinsRoomSpec(floor: number, roomId: string): ChapterRoomSpec | undefined { return RUINS_FLOORS[floor]?.rooms[roomId]; }
export function ruinsEncounterForRoom(floor: number, roomId: string): ChapterEncounterSpec | undefined {
  const encounter = ENCOUNTERS[floor]?.[roomId];
  if (encounter) return encounter;
  if (isRuinsChapter(floor) && roomId === 'room-1') return { monsterIds: ['zombie','slime','slime'], intent: '出口小队：清场即可离开，本层已有机制不再叠加。' };
  return undefined;
}
export function isRuinsChapter(floor: number): boolean { return floor >= 1 && floor <= 5; }
export function ruinsThemeForFloor(floor: number): FloorTheme {
  return { id: 'stone-ruins', name: `石卫遗迹 · ${RUINS_FLOORS[floor]?.name ?? '旧王前哨'}`, wallType: 'brick', floorType: 'dungeon', accentType: 'mossy' };
}
/** Three central rack cells open a local crossing; four-cell end bypasses remain available. */
export function ruinsSupplyCells(room: Room): { x: number; z: number }[] {
  const x = room.x + Math.floor(room.width / 2), z = room.z + Math.floor(room.depth / 2);
  return [-1, 0, 1].map(dz => ({ x, z: z + dz }));
}
