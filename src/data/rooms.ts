import type { RoomKind } from '../types';

export const ROOM_LABELS: Record<RoomKind, string> = {
  start: '入口营地', battle: '战斗房', elite: '精英试炼', treasure: '宝藏房', sanctuary: '恢复圣所', exit: '出口守卫',
};
export const ROOM_COLORS: Record<RoomKind, number> = {
  start: 0x91b3c8, battle: 0xe5ae5b, elite: 0xe06578, treasure: 0xffd76a, sanctuary: 0x7cddad, exit: 0xad8aee,
};
// Local obstacle coordinates. Central three-wide axes always remain clear.
export const ROOM_TEMPLATES = {
  open: [],
  pillars: [[2, 2], [7, 2], [2, 7], [7, 7]],
  cover: [[2, 2], [3, 2], [6, 7], [7, 7]],
  flanks: [[1, 3], [2, 3], [7, 6], [8, 6]],
} satisfies Record<string, number[][]>;
