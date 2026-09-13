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

export type TacticalRoomTemplateId = import('./LateChapter').LateTemplate
  | 'ruins-court' | 'ruins-double-path' | 'ruins-bulwark' | 'ruins-barracks'
  | 'ruins-chapel' | 'ruins-armory' | 'ruins-ring' | 'ruins-gate-arena' | 'ruins-supply' | 'ruins-trial'
  | 'sanctum-echo' | 'sanctum-inscription' | 'sanctum-procession' | 'sanctum-blade'
  | 'sanctum-ritual' | 'sanctum-trial' | 'sanctum-throne'
  | 'pressure-ring'
  | 'impact-yard'
  | 'resonance-workshop'
  | 'prism-gallery'
  | 'foundry-combination'
  | 'overload-trial'
  | 'furnace-arena'
  | 'pillar-court'
  | 'broken-bulwark'
  | 'split-gallery'
  | 'flanking-ring';

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

function chapterTemplate(id: TacticalRoomTemplateId, gameplay: string, landmark: string, obstacles: TacticalRoomTemplate['obstacles'] = () => []): TacticalRoomTemplate {
  return { id, gameplay, landmark, sightlines: 'Open center and two broad side approaches.', objective: 'Clear learned threats; optional devices require interaction.', reward: 'Existing chapter reward budget.', enemyFit: 'Floor-specific chapter encounter only.', forbidden: 'No blocked entrances, narrow traps or mandatory facility use.', obstacles };
}

/**
 * Greybox layouts with different movement decisions. Coordinates are derived
 * from each room's dimensions, so these are reusable modules rather than 10x10 skins.
 */
export const TACTICAL_ROOM_TEMPLATES: Record<TacticalRoomTemplateId, TacticalRoomTemplate> = {
  'ruins-court': chapterTemplate('ruins-court', 'Open sweeping combat.', 'Broken arch and moss-edged courtyard.'),
  'ruins-double-path': chapterTemplate('ruins-double-path', 'Either broad side of a ruined arch rejoins.', 'Offset collapsed arch.', (w,d) => [[Math.floor(w/2),3],[Math.floor(w/2),4],[Math.floor(w/2)+1,3]]),
  'ruins-bulwark': chapterTemplate('ruins-bulwark', 'Circle either end of a short shield defense.', 'Short broken flag defense.', (w,d) => lineX(Math.floor(d/2)-2, Math.floor(w/2)-2, Math.floor(w/2)+2)),
  'ruins-barracks': chapterTemplate('ruins-barracks', 'Staggered cover leaves two approaches to ranged enemies.', 'Offset abandoned bunk blocks.', (w,d) => [[4,3],[5,3],[w-5,d-4],[w-6,d-4]]),
  'ruins-chapel': chapterTemplate('ruins-chapel', 'Two communicating shrine halls reveal healing links.', 'Paired broken shrine foundations.', (w,d) => [[3,3],[w-4,d-4]]),
  'ruins-armory': chapterTemplate('ruins-armory', 'A wide U courtyard retains the central crossing.', 'Old weapons racks.', (w,d) => [[3,3],[w-4,3]]),
  'ruins-ring': chapterTemplate('ruins-ring', 'Wide asymmetric loop has an open cross shortcut.', 'Two split reliquary remnants.', (w,d) => [[Math.floor(w/2)-2,Math.floor(d/2)-2],[Math.floor(w/2)-2,Math.floor(d/2)-1],[Math.floor(w/2)+2,Math.floor(d/2)+1],[Math.floor(w/2)+2,Math.floor(d/2)+2]]),
  'ruins-gate-arena': chapterTemplate('ruins-gate-arena', 'Circle the gatekeeper and punish committed recovery.', 'Iron royal gate with a small furnace glow.', (w,d) => [[3,3],[w-4,3],[3,d-4],[w-4,d-4]]),
  'ruins-supply': chapterTemplate('ruins-supply', 'Open the rack to expose the existing reward and local shortcut.', 'Collapsed supply shelf.', (w,d) => lineZ(Math.floor(w/2),4,d-5)),
  'ruins-trial': chapterTemplate('ruins-trial', 'Voluntary one-wave shield and archer challenge.', 'Old armory challenge standard.', (w,d) => [[3,3],[w-4,3]]),
  'sanctum-echo': chapterTemplate('sanctum-echo', 'Move off the first strike and avoid returning before the echo.', 'Paired bell scars in an open hall.'),
  'sanctum-inscription': chapterTemplate('sanctum-inscription', 'Leave a tracking inscription in a wide outer pocket.', 'Three leaf inscription court.'),
  'sanctum-procession': chapterTemplate('sanctum-procession', 'Sweep weak mourners across a broad funeral court.', 'Low staggered tomb beds.', (w,d) => [[3,3],[4,3],[w-5,d-4],[w-4,d-4]]),
  'sanctum-blade': chapterTemplate('sanctum-blade', 'Inner chord and outer arc both reach the blade keeper.', 'Crescent bone gallery with a broad inner chord.'),
  'sanctum-ritual': chapterTemplate('sanctum-ritual', 'Two optional funeral platforms harm enemies after a marked delay.', 'Two opposed funeral platforms.'),
  'sanctum-trial': chapterTemplate('sanctum-trial', 'Voluntary burial trial with familiar echo and mark threats.', 'Asymmetric four leaf burial court.'),
  'sanctum-throne': chapterTemplate('sanctum-throne', 'An open octagon joins three optional outer inscription slots.', 'Sunken bell throne and three outer slots.'),
  'pressure-ring': {
    id: 'pressure-ring', gameplay: 'Switch between two broad pressure lanes or interrupt the overseer.',
    sightlines: 'Open crossings at both ends.', landmark: 'Offset boiler island.',
    objective: 'Clear the overseer.', reward: 'Normal encounter rewards.',
    enemyFit: 'One valve overseer.', forbidden: 'No other controller or blocked safe lane.',
    obstacles: (w, d) => Array.from({length: 9}, (_, i) => [Math.floor(w / 2) - 1 + i % 3, Math.floor(d / 2) - 2 + Math.floor(i / 3)] as [number, number]),
  },
  'impact-yard': {
    id: 'impact-yard',
    gameplay: 'Bait the rammer across an open lane or circle through either broad side route.',
    sightlines: 'Two unobstructed widthwise lanes cross staggered cover groups.',
    landmark: 'A broad impact-testing apron with cracked divider mounts.',
    objective: 'Exploit a wall impact without making it mandatory for traversal.',
    reward: 'At the rear edge, visible from both outer routes.',
    enemyFit: 'One rammer with a small, low-pressure escort.',
    forbidden: 'No static divider across either route; breakable panels are runtime facilities.',
    obstacles: (w, d) => [
      [3, 3], [4, 3], [3, 4],
      [w - 5, 3], [w - 4, 3], [w - 4, 4],
      [4, d - 4], [5, d - 4],
      [w - 6, d - 5], [w - 5, d - 5],
    ],
  },
  'resonance-workshop': {
    id: 'resonance-workshop',
    gameplay: 'Move between two open work bays to break support links or focus a powered target.',
    sightlines: 'Both bays see the shared center through a wide connection and a side bypass.',
    landmark: 'Paired coil foundations flanking the central supply point.',
    objective: 'Choose between disrupting the chain caster and bursting its beneficiaries.',
    reward: 'Beyond the second bay with both approaches open.',
    enemyFit: 'One chain caster and at most two ordinary frontliners.',
    forbidden: 'No healer or narrow single-file connection between bays.',
    obstacles: (w, d) => {
      const midX = Math.floor(w / 2), midZ = Math.floor(d / 2);
      return [
        [midX - 3, midZ - 2], [midX - 3, midZ - 1], [midX - 2, midZ - 2],
        [midX + 2, midZ + 1], [midX + 3, midZ + 1], [midX + 3, midZ + 2],
      ];
    },
  },
  'prism-gallery': {
    id: 'prism-gallery',
    gameplay: 'Advance between three staggered cover groups during committed beam shots.',
    sightlines: 'Long diagonal shots remain possible, with two separate covered approaches.',
    landmark: 'Three offset prism-proof column clusters.',
    objective: 'Break line of sight, then close distance during the sentinel recovery.',
    reward: 'In the far-side cover pocket.',
    enemyFit: 'One prism sentinel, or two with staggered firing windows.',
    forbidden: 'No cover arrangement that lets both sentinels seal every exit.',
    obstacles: (w, d) => {
      const midZ = Math.floor(d / 2);
      return [
        [3, 3], [3, 4], [4, 3],
        [w - 5, midZ - 1], [w - 4, midZ - 1], [w - 4, midZ],
        [4, d - 4], [5, d - 4], [5, d - 5],
      ];
    },
  },
  'foundry-combination': {
    id: 'foundry-combination',
    gameplay: 'Change lanes around offset machinery while deciding which learned threat to disable first.',
    sightlines: 'A broken center line preserves cross-room views and two flanking routes.',
    landmark: 'Alternating furnace and coil foundations.',
    objective: 'Resolve two familiar mechanics without losing the safe cross-route.',
    reward: 'At the far crossing after the required encounter.',
    enemyFit: 'Two previously taught foundry roles with limited ordinary support.',
    forbidden: 'No third controller or overlapping full-lane attacks.',
    obstacles: (w, d) => {
      const midX = Math.floor(w / 2), midZ = Math.floor(d / 2);
      return [
        [midX - 3, midZ - 3], [midX - 2, midZ - 3], [midX - 3, midZ - 2],
        [midX + 2, midZ + 2], [midX + 3, midZ + 2], [midX + 3, midZ + 3],
        [3, midZ + 2], [w - 4, midZ - 2],
      ];
    },
  },
  'overload-trial': {
    id: 'overload-trial',
    gameplay: 'Loop through three broad combat zones or take the open central cross-route.',
    sightlines: 'Zone edges interrupt long shots without hiding the optional activation point.',
    landmark: 'Three overload pads surrounding an inactive central pulse mount.',
    objective: 'Voluntarily clear at most two waves for a resource choice.',
    reward: 'At the entry-side controller after completion.',
    enemyFit: 'Two learned mechanics across separate waves.',
    forbidden: 'Never auto-start, block the exit, or combine a beam with the pulse landing area.',
    obstacles: (w, d) => {
      const midX = Math.floor(w / 2), midZ = Math.floor(d / 2);
      return [
        [3, 3], [4, 3], [3, 4],
        [w - 5, 3], [w - 4, 3], [w - 4, 4],
        [3, d - 4], [4, d - 4], [3, d - 5],
        [w - 5, d - 4], [w - 4, d - 4], [w - 4, d - 5],
        [midX - 3, midZ], [midX + 3, midZ],
      ];
    },
  },
  'furnace-arena': {
    id: 'furnace-arena',
    gameplay: 'Circle a wide perimeter, cross the open center, and steer the boss toward valve columns.',
    sightlines: 'The center and all three runtime valve positions remain mutually readable.',
    landmark: 'Cut-corner grand furnace floor with an uninterrupted outer ring.',
    objective: 'Create core exposure windows while preserving a ground route through every attack.',
    reward: 'Chapter completion portal at arena center after the boss falls.',
    enemyFit: 'The Furnace Regent and its single late-phase reinforcement pair.',
    forbidden: 'No static valve collision or obstacle sealing the perimeter; valves are runtime facilities.',
    obstacles: (w, d) => [
      [3, 3], [4, 3], [3, 4],
      [w - 5, 3], [w - 4, 3], [w - 4, 4],
      [3, d - 4], [4, d - 4], [3, d - 5],
      [w - 5, d - 4], [w - 4, d - 4], [w - 4, d - 5],
    ],
  },
  ...Object.fromEntries(['abyss-lamp','abyss-mirror','abyss-eye','abyss-sweep','abyss-store','abyss-trial','abyss-throne','citadel-banner','citadel-wave','citadel-seal','citadel-muster','citadel-store','citadel-trial','citadel-throne'].map(id => [id, chapterTemplate(id as TacticalRoomTemplateId, '宽场与可选机关', id)])) as Record<import('./LateChapter').LateTemplate, TacticalRoomTemplate>,
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
