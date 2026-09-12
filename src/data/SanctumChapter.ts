import type { FloorTheme, Room } from '../types';
import type { ChapterEncounterSpec, ChapterRoomSpec } from './RuinsChapter';

export const SANCTUM_CHAPTER = { firstFloor: 11, lastImplementedFloor: 15, teachingRoom: 'room-0', trialRoom: 'room-6', bossId: 'bellkeeper' } as const;
export const SANCTUM_FLOORS: Readonly<Record<number, { name: string; rooms: Readonly<Record<string, ChapterRoomSpec>> }>> = {
  11: { name: '缄默墓廊', rooms: {
    'room-0': { template: 'sanctum-echo', width: 15, depth: 13, shape: 'cut-corners' },
    'room-2': { template: 'sanctum-procession', width: 18, depth: 11, shape: 'l-shape' },
    'room-4': { template: 'sanctum-echo', width: 15, depth: 13, shape: 'cross-hall' },
  } },
  12: { name: '送葬回庭', rooms: {
    'room-0': { template: 'sanctum-inscription', width: 16, depth: 14, shape: 'three-leaf' },
    'room-2': { template: 'sanctum-ritual', width: 15, depth: 15, shape: 'three-leaf' },
    'room-4': { template: 'sanctum-procession', width: 18, depth: 11, shape: 'l-shape' },
  } },
  13: { name: '万名骨殿', rooms: {
    'room-0': { template: 'sanctum-blade', width: 16, depth: 13, shape: 'crescent' },
    'room-2': { template: 'sanctum-ritual', width: 15, depth: 15, shape: 'three-leaf' },
    'room-4': { template: 'sanctum-inscription', width: 16, depth: 14, shape: 'three-leaf' },
  } },
  14: { name: '倒悬钟庭', rooms: {
    'room-0': { template: 'sanctum-procession', width: 18, depth: 11, shape: 'l-shape' },
    'room-2': { template: 'sanctum-blade', width: 16, depth: 13, shape: 'crescent' },
    'room-4': { template: 'sanctum-echo', width: 16, depth: 14, shape: 'cross-hall' },
    'room-6': { template: 'sanctum-trial', width: 17, depth: 15, shape: 'four-leaf' },
  } },
  15: { name: '无名王座', rooms: {
    'room-4': { template: 'sanctum-procession', width: 14, depth: 11, shape: 'cut-corners' },
    'room-1': { template: 'sanctum-throne', width: 19, depth: 19, shape: 'octagon' },
  } },
};
const mourners = (n: number): string[] => Array.from({ length: n }, () => 'sanctum_mourner');
const ENCOUNTERS: Readonly<Record<number, Record<string, ChapterEncounterSpec>>> = {
  11: {
    'room-0': { monsterIds: ['bell_acolyte'], intent: '双叩首遇：离开第一击轮廓，绕侧输出；第二击仍在原位置。' },
    'room-2': { monsterIds: mourners(9), intent: '宽葬列清扫，完整发挥范围与召唤输出。' },
    'room-4': { monsterIds: ['bell_acolyte',...mourners(8)], clearXp: 80, intent: '只一种回响机制，第二击结束留完整后摇。' },
  },
  12: {
    'room-0': { monsterIds: ['epitaph_attendant'], intent: '点名首遇：先把随行印记留在侧袋，落定后离开。' },
    'room-2': { monsterIds: mourners(9), intent: '葬仪台自愿触发，只伤敌人；不开也能清场。' },
    'room-4': { monsterIds: ['bell_acolyte',...mourners(8)], clearXp: 70, intent: '清扫葬列，在回响前避开原轮廓。' },
  },
  13: {
    'room-0': { monsterIds: ['returning_blade'], intent: '返刃首遇：横移离开去回原线，离手时近身。' },
    'room-2': { monsterIds: ['coffin_bearer',...mourners(7)], intent: '首次负棺者：直接爆发可跳过开棺，葬仪可辅助清扫。' },
    'room-4': { monsterIds: ['epitaph_attendant',...mourners(8)], clearXp: 65, intent: '在外侧布置落点，中央始终可通过。' },
  },
  14: {
    'room-0': { monsterIds: ['name_digger',...mourners(7)], intent: '短线骨脊可绕侧；低位段可跳但不强制。' },
    'room-2': { monsterIds: ['returning_blade',...mourners(7)], intent: '成型构筑清扫，避开飞刃原线。' },
    'room-4': { monsterIds: ['bell_acolyte','epitaph_attendant',...mourners(6)], intent: '必经组合：回响与点名错峰，先安排外侧落点。' },
    'room-6': { monsterIds: ['bell_acolyte','epitaph_attendant',...mourners(4)], intent: '自愿无名者安葬：学过的双叩与点名，金币或材料奖励。' },
  },
  15: {
    'room-4': { monsterIds: ['bell_acolyte',...mourners(4)], intent: '短热身，准备末代司钟人的同类回响。' },
    'room-1': { monsterIds: ['bellkeeper'], intent: '末代司钟人：辨认第一击，避开原位回响，将葬印留在外侧槽。' },
  },
};
export function sanctumRoomSpec(floor: number, roomId: string): ChapterRoomSpec | undefined { return SANCTUM_FLOORS[floor]?.rooms[roomId]; }
export function sanctumEncounterForRoom(floor: number, roomId: string): ChapterEncounterSpec | undefined {
  const encounter = ENCOUNTERS[floor]?.[roomId];
  if (encounter) return encounter;
  if (isSanctumChapter(floor) && roomId === 'room-1') return { monsterIds: mourners(floor === 14 ? 4 : 7), intent: '出口葬列清扫，清场立即解除屏障与残留伤害。' };
  return undefined;
}
export function isSanctumChapter(floor: number): boolean { return floor >= 11 && floor <= 15; }
export function sanctumThemeForFloor(floor: number): FloorTheme {
  return { id: 'sanctum', name: `沉钟圣陵 · ${SANCTUM_FLOORS[floor]?.name ?? '骨石圣堂'}`, wallType: 'darkstone', floorType: 'dungeon', accentType: 'mossy' };
}
export function sanctumRitualPositions(room: Room): { x: number; z: number }[] {
  return [{ x: room.x + 3.5, z: room.z + room.depth / 2 }, { x: room.x + room.width - 3.5, z: room.z + room.depth - 3.5 }];
}
export function sanctumThroneSlots(room: Room): { x: number; z: number }[] {
  return [{ x: room.x + 4.5, z: room.z + room.depth / 2 }, { x: room.x + room.width - 4.5, z: room.z + room.depth / 2 }, { x: room.x + room.width / 2, z: room.z + room.depth - 4.5 }];
}
