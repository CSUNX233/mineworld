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

export type TacticalRoomTemplateId = 'pillar-court' | 'broken-bulwark' | 'split-gallery' | 'flanking-ring';

export interface TacticalRoomTemplate {
  id: TacticalRoomTemplateId;
  /** Short prototype documentation used when balancing encounters. */
  gameplay: string;
  sightlines: string;
  landmark: string;
  objective: string;
  reward: string;
  enemyFit: string;
  forbidden: string;
  obstacles: (width: number, depth: number) => [number, number][];
}

function lineX(z: number, from: number, to: number): [number, number][] {
  const cells: [number, number][] = [];
  for (let x = from; x <= to; x++) cells.push([x, z]);
  return cells;
}

function lineZ(x: number, from: number, to: number): [number, number][] {
  const cells: [number, number][] = [];
  for (let z = from; z <= to; z++) cells.push([x, z]);
  return cells;
}

/**
 * Four greybox layouts with different movement decisions. Coordinates are derived
 * from each room's dimensions, so these are reusable modules rather than 10x10 skins.
 */
export const TACTICAL_ROOM_TEMPLATES: Record<TacticalRoomTemplateId, TacticalRoomTemplate> = {
  'pillar-court': {
    id: 'pillar-court',
    gameplay: 'Four chunky supports create alternating cover while leaving a broad central crossing.',
    sightlines: 'Long diagonals, broken side-to-side shots.',
    landmark: 'Four square ruin columns.',
    objective: 'Hold or clear the open center.',
    reward: 'Center or rear alcove.',
    enemyFit: 'Mixed melee and mobile ranged groups.',
    forbidden: 'No overlapping full-room area denial.',
    obstacles: (w, d) => [[2, 2], [w - 3, 2], [2, d - 3], [w - 3, d - 3]],
  },
  'broken-bulwark': {
    id: 'broken-bulwark',
    gameplay: 'Two offset defensive walls make the player change lanes instead of firing straight through.',
    sightlines: 'Strong lateral cover with two wide breaches.',
    landmark: 'Staggered collapsed barricades.',
    objective: 'Push through one breach or flank around the wall ends.',
    reward: 'Behind the second wall.',
    enemyFit: 'Guardians, chargers, and short-range pressure.',
    forbidden: 'No extra blockers in either breach.',
    obstacles: (w, d) => [
      ...lineX(Math.max(2, Math.floor(d / 3)), 2, Math.max(2, Math.floor(w / 2) - 1)),
      ...lineX(Math.min(d - 3, Math.floor(d * 2 / 3)), Math.min(w - 3, Math.floor(w / 2) + 1), w - 3),
    ],
  },
  'split-gallery': {
    id: 'split-gallery',
    gameplay: 'A broken lengthwise divider creates two lanes with several crossings and quick side switches.',
    sightlines: 'Long parallel lanes with interrupted cross-lane vision.',
    landmark: 'A cracked central gallery wall.',
    objective: 'Choose a safe lane, then cross when pressure shifts.',
    reward: 'At the far crossing.',
    enemyFit: 'Ranged enemies paired with limited melee pursuit.',
    forbidden: 'No simultaneous lane-wide hazards.',
    obstacles: (w, d) => {
      const x = Math.floor(w / 2);
      return [...lineZ(x, 2, Math.max(2, Math.floor(d / 2) - 2)), ...lineZ(x, Math.floor(d / 2) + 2, d - 3)];
    },
  },
  'flanking-ring': {
    id: 'flanking-ring',
    gameplay: 'A central ruin mass forces clockwise or counter-clockwise approaches around a visible threat.',
    sightlines: 'Center is blocked; four corners retain short sightlines.',
    landmark: 'A dense square reliquary.',
    objective: 'Commit to a flank or reverse direction through the near crossing.',
    reward: 'On the protected side of the reliquary.',
    enemyFit: 'Elite melee, support, or a single readable controller.',
    forbidden: 'No blockers on the perimeter route.',
    obstacles: (w, d) => {
      const cells: [number, number][] = [];
      const minX = Math.floor((w - 3) / 2), minZ = Math.floor((d - 3) / 2);
      for (let z = minZ; z < minZ + 3; z++)
        for (let x = minX; x < minX + 3; x++) cells.push([x, z]);
      return cells;
    },
  },
};
