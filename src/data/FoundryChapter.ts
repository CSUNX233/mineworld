import type { FloorTheme } from '../types';
import type { TacticalRoomTemplateId } from './rooms';
import type { ChapterEncounterSpec } from './RuinsChapter';

/** Only the first valve lesson stays solitary; subsequent floor-six rooms support crowd combat. */
const OPENING_ENCOUNTERS: Readonly<Record<string, ChapterEncounterSpec>> = {
  'room-2': { monsterIds: ['orc_warrior', 'zombie', 'zombie', 'slime', 'slime'], intent: '清扫运输支廊的步卒与杂兵，保留两侧通路。' },
  'room-4': { monsterIds: ['ruin_guardian', 'skeleton', 'orc_warrior', 'zombie', 'slime', 'slime', 'slime'], intent: '盾卫与射手守住前庭，绕侧接近；杂兵适合范围技能清扫。' },
  'room-1': { monsterIds: ['skeleton', 'orc_warrior', 'zombie', 'zombie', 'slime', 'slime'], intent: '清除出口守卫，利用射手停顿接近目标。' },
};
export function foundryOpeningEncounter(floor: number, roomId: string): ChapterEncounterSpec | undefined {
  return floor === 6 ? OPENING_ENCOUNTERS[roomId] : undefined;
}

export interface FoundryRoomSpec {
  template: TacticalRoomTemplateId;
  width?: number;
  depth?: number;
  centerOffsetX?: number;
}

export interface FoundryFloorSpec {
  name: string;
  rooms: Readonly<Record<string, FoundryRoomSpec>>;
}

/** Version four enables the complete chapter; version three still gates itself to floor six. */
export const FOUNDRY_CHAPTER = {
  firstFloor: 6,
  lastImplementedFloor: 10,
  monsterId: 'valve_overseer',
  teachingRoom: 'room-0',
  windup: 1.4,
  activeDuration: 2,
  cooldown: 6,
  interruptRecovery: 2,
} as const;

export const FOUNDRY_FLOORS: Readonly<Record<number, FoundryFloorSpec>> = {
  6: {
    name: '铸造前庭',
    rooms: { 'room-0': { template: 'pressure-ring', width: 15, depth: 13, centerOffsetX: 3 } },
  },
  7: {
    name: '运输支廊',
    rooms: { 'room-0': { template: 'impact-yard', width: 16, depth: 13 } },
  },
  8: {
    name: '共鸣车间',
    rooms: {
      'room-0': { template: 'resonance-workshop', width: 15, depth: 13 },
      'room-2': { template: 'prism-gallery', width: 15, depth: 12 },
    },
  },
  9: {
    name: '过载枢纽',
    rooms: {
      'room-0': { template: 'foundry-combination', width: 16, depth: 13 },
      'room-6': { template: 'overload-trial', width: 17, depth: 15 },
    },
  },
  10: {
    name: '总炉核心',
    rooms: {
      'room-0': { template: 'foundry-combination', width: 13, depth: 11 },
      'room-1': { template: 'furnace-arena', width: 19, depth: 17 },
    },
  },
};

export const FOUNDRY_THEME: FloorTheme = {
  id: 'foundry', name: '失控铸造所 · 铸造前庭',
  wallType: 'darkstone', floorType: 'dungeon', accentType: 'lava',
};

export function foundryThemeForFloor(floor: number): FloorTheme {
  const spec = FOUNDRY_FLOORS[floor];
  return spec ? { ...FOUNDRY_THEME, name: `失控铸造所 · ${spec.name}` } : FOUNDRY_THEME;
}

export function foundryRoomSpec(floor: number, roomId: string): FoundryRoomSpec | undefined {
  return FOUNDRY_FLOORS[floor]?.rooms[roomId];
}

export function isFoundrySlice(floor: number): boolean {
  return floor >= FOUNDRY_CHAPTER.firstFloor && floor <= FOUNDRY_CHAPTER.lastImplementedFloor;
}
