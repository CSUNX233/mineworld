import { createFoundryLayout } from './FoundryLayout';
import { foundryRoomSpec, foundryThemeForFloor, isFoundrySlice } from '../data/FoundryChapter';
import { ruinsRoomSpec, ruinsThemeForFloor, isRuinsChapter, type ChapterRoomSpec } from '../data/RuinsChapter';
import { sanctumRoomSpec, sanctumThemeForFloor, isSanctumChapter } from '../data/SanctumChapter';
import type { FloorData, FloorTheme, Room, RoomKind } from '../types';
import { BlockKind } from './Block';
import { RNG } from '../utils/RNG';
import floors from '../data/floors.json';
import { ROOM_TEMPLATES, TACTICAL_ROOM_TEMPLATES, type TacticalRoomTemplateId } from '../data/rooms';
import { createMapLayout, createChapterMapLayout, type LayoutNode, type RoomShape } from './MapLayout';

const RUINS_THEME: FloorTheme = {
  id: 'stone-ruins', name: '石卫遗迹', wallType: 'brick', floorType: 'dungeon', accentType: 'mossy',
};
// Keep this pool and its order stable for generation versions two and three.
const TACTICAL_TEMPLATE_IDS: TacticalRoomTemplateId[] = ['pillar-court','broken-bulwark','split-gallery','flanking-ring'];

interface SpatialRoom extends Room {
  id: string;
  kind: RoomKind;
  cells: { x: number; z: number }[];
  center: { x: number; z: number };
  entrances: { x: number; z: number }[];
  shape: RoomShape;
  template: TacticalRoomTemplateId;
}

const cellKey = (x: number, z: number) => `${x},${z}`;

function roomDimensions(node: LayoutNode, rng: RNG): { width: number; depth: number } {
  if (node.kind === 'start') return { width: 9, depth: 9 };
  if (node.kind === 'exit') return { width: rng.int(10, 11), depth: rng.int(10, 11) };
  if (node.kind === 'elite') return { width: rng.int(10, 12), depth: rng.int(10, 12) };
  if (node.kind === 'sanctuary' || node.kind === 'treasure')
    return { width: rng.int(8, 10), depth: rng.int(8, 10) };
  return { width: rng.int(9, 12), depth: rng.int(8, 11) };
}

function roomCells(x: number, z: number, width: number, depth: number, shape: RoomShape): { x: number; z: number }[] {
  const cells: { x: number; z: number }[] = [];
  for (let localZ = 0; localZ < depth; localZ++) {
    for (let localX = 0; localX < width; localX++) {
      if (shape === 'cut-corners') {
        const cornerDistance = Math.min(
          localX + localZ, width - 1 - localX + localZ,
          localX + depth - 1 - localZ, width - 1 - localX + depth - 1 - localZ,
        );
        if (cornerDistance < 2) continue;
      }
      if (shape === 'l-shape' && localX >= Math.ceil(width * 0.65) && localZ < Math.floor(depth * 0.38)) continue;
      const edgeX = Math.min(localX, width - 1 - localX), edgeZ = Math.min(localZ, depth - 1 - localZ);
      if (shape === 'octagon' && edgeX + edgeZ < 4) continue;
      if (shape === 'twin-hall' && Math.abs(localX - (width-1)/2) < 2 && edgeZ < 3) continue;
      if (shape === 'u-shape' && localX >= 5 && localX < width-5 && localZ < 3) continue;
      if (shape === 'cross-hall' && edgeX < 3 && edgeZ < 3) continue;
      if (shape === 'three-leaf' && ((localX < 3 && localZ < 3) || (localX >= width-3 && localZ < 3) || (edgeX < 4 && localZ >= depth-3))) continue;
      if (shape === 'four-leaf' && ((edgeX < 2 && edgeZ < 2) || (Math.abs(localX-(width-1)/2)<2 && edgeZ<2) || (Math.abs(localZ-(depth-1)/2)<2 && edgeX<2))) continue;
      // A shallow crescent indentation preserves a broad inner chord and an open outer arc.
      if (shape === 'crescent' && (edgeX + edgeZ < 2 || (localX < 4 && Math.abs(localZ-(depth-1)/2)<2))) continue;
      cells.push({ x: x + localX, z: z + localZ });
    }
  }
  return cells;
}

function nearestRoomCell(cells: { x: number; z: number }[], x: number, z: number): { x: number; z: number } {
  return cells.reduce((best, cell) => {
    const distance = (cell.x - x) ** 2 + (cell.z - z) ** 2;
    const bestDistance = (best.x - x) ** 2 + (best.z - z) ** 2;
    return distance < bestDistance ? cell : best;
  });
}

function buildRoom(node: LayoutNode, rng: RNG, chapterFloor?: number, modern = false): SpatialRoom {
  const spec: ChapterRoomSpec | undefined = chapterFloor === undefined ? undefined :
    (modern && isRuinsChapter(chapterFloor) ? ruinsRoomSpec(chapterFloor,node.id) :
      modern && isSanctumChapter(chapterFloor) ? sanctumRoomSpec(chapterFloor,node.id) : foundryRoomSpec(chapterFloor,node.id));
  const dimensions = spec?.width !== undefined && spec.depth !== undefined
    ? { width: spec.width, depth: spec.depth }
    : roomDimensions(node, rng);
  const { width, depth } = dimensions;
  const x = Math.max(2, Math.round(node.cx - width / 2));
  const z = Math.max(2, Math.round(node.cz - depth / 2));
  const shape = spec?.shape ?? node.shape;
  const cells = roomCells(x, z, width, depth, shape);
  const centerCell = nearestRoomCell(cells, Math.floor(node.cx) + (spec?.centerOffsetX ?? 0), Math.floor(node.cz));
  let template = rng.pick(TACTICAL_TEMPLATE_IDS);
  if (node.kind === 'start' || node.kind === 'sanctuary' || node.kind === 'treasure')
    template = rng.pick<TacticalRoomTemplateId>(['pillar-court', 'split-gallery']);
  // The exit is a readable, open boss arena with cover around its perimeter.
  if (node.kind === 'exit') template = 'pillar-court';
  if (spec) template = spec.template;
  return {
    id: node.id, kind: node.kind, required: node.required,
    x, z, width, depth, cells,
    center: { x: centerCell.x + 0.5, z: centerCell.z + 0.5 },
    entrances: [], shape, template,
  };
}

function carveWide(grid: number[][], x: number, z: number, protectedCells: Set<string>): void {
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cellX = x + dx, cellZ = z + dz;
      if (cellZ <= 0 || cellX <= 0 || cellZ >= grid.length - 1 || cellX >= grid.length - 1) continue;
      grid[cellZ][cellX] = BlockKind.Floor;
      protectedCells.add(cellKey(cellX, cellZ));
    }
  }
}

function carveLine(grid: number[][], from: { x: number; z: number }, to: { x: number; z: number }, protectedCells: Set<string>): void {
  let x = from.x, z = from.z;
  const dx = Math.abs(to.x - x), sx = x < to.x ? 1 : -1;
  const dz = -Math.abs(to.z - z), sz = z < to.z ? 1 : -1;
  let error = dx + dz;
  for (;;) {
    carveWide(grid, x, z, protectedCells);
    if (x === to.x && z === to.z) break;
    const doubled = error * 2;
    if (doubled >= dz) { error += dz; x += sx; }
    if (doubled <= dx) { error += dx; z += sz; }
  }
}

function carveConnection(
  grid: number[][],
  from: { x: number; z: number },
  to: { x: number; z: number },
  protectedCells: Set<string>,
  rng: RNG,
): void {
  const nearlyStraight = Math.abs(from.x - to.x) <= 2 || Math.abs(from.z - to.z) <= 2;
  if (nearlyStraight || rng.chance(0.35)) {
    carveLine(grid, from, to, protectedCells);
    return;
  }
  const bend = rng.chance(0.5) ? { x: to.x, z: from.z } : { x: from.x, z: to.z };
  carveLine(grid, from, bend, protectedCells);
  carveLine(grid, bend, to, protectedCells);
}

function roomCenterCell(room: SpatialRoom): { x: number; z: number } {
  return { x: Math.floor(room.center.x), z: Math.floor(room.center.z) };
}

function collectEntrances(room: SpatialRoom, grid: number[][]): { x: number; z: number }[] {
  const mask = new Set(room.cells.map(cell => cellKey(cell.x, cell.z)));
  return room.cells.filter(cell => {
    const neighbours = [[cell.x - 1, cell.z], [cell.x + 1, cell.z], [cell.x, cell.z - 1], [cell.x, cell.z + 1]];
    return neighbours.some(([x, z]) => !mask.has(cellKey(x, z)) && grid[z]?.[x] === BlockKind.Floor);
  }).map(cell => ({ x: cell.x, z: cell.z }));
}

function addRoomObstacles(room: SpatialRoom, grid: number[][], protectedCells: Set<string>): void {
  const localObstacles = TACTICAL_ROOM_TEMPLATES[room.template].obstacles(room.width, room.depth);
  const center = roomCenterCell(room);
  const mask = new Set(room.cells.map(cell => cellKey(cell.x, cell.z)));
  for (const [localX, localZ] of localObstacles) {
    const x = room.x + localX, z = room.z + localZ;
    if (!mask.has(cellKey(x, z)) || (!['pressure-ring','ruins-supply'].includes(room.template) && protectedCells.has(cellKey(x, z)))) continue;
    if (Math.abs(x - center.x) + Math.abs(z - center.z) <= 1) continue;
    grid[z][x] = BlockKind.Obstacle;
  }
}

function openCellNear(
  room: SpatialRoom,
  grid: number[][],
  rng: RNG,
  excluded: readonly { x: number; z: number }[] = [],
  minimumDistance = 0,
): { x: number; z: number } {
  const center = roomCenterCell(room);
  const isSeparated = (cell: { x: number; z: number }): boolean => excluded.every(excludedCell =>
    Math.hypot(cell.x - excludedCell.x, cell.z - excludedCell.z) > minimumDistance,
  );
  const candidates = room.cells.filter(cell =>
    grid[cell.z][cell.x] === BlockKind.Floor
    && isSeparated(cell)
    && Math.abs(cell.x - center.x) + Math.abs(cell.z - center.z) >= 2
    && cell.x > room.x && cell.x < room.x + room.width - 1
    && cell.z > room.z && cell.z < room.z + room.depth - 1,
  );
  if (candidates.length) return rng.pick(candidates);
  const fallback = room.cells.filter(cell => grid[cell.z][cell.x] === BlockKind.Floor && isSeparated(cell));
  if (fallback.length) return rng.pick(fallback);
  throw new Error(`No separated open cell remains in room ${room.id}.`);
}

/** Versions 2–4 retain their maps; version 5 adds the ruins and sanctum chapters. */
function generateSpatialFloor(seed: number, floor: number, version: 2 | 3 | 4 | 5 = 2): FloorData {
  const rng = new RNG(seed);
  const foundry = (version === 3 && floor === 6) || (version >= 4 && isFoundrySlice(floor));
  const ruins = version >= 5 && isRuinsChapter(floor), sanctum = version >= 5 && isSanctumChapter(floor);
  const layout = foundry ? createFoundryLayout(rng, floor) : ruins || sanctum ? createChapterMapLayout(rng,floor) : createMapLayout(rng);
  const rooms = layout.nodes.map(node => buildRoom(node, rng, foundry || ruins || sanctum ? floor : undefined,version >= 5));
  const size = Math.max(48, ...rooms.map(room => Math.max(room.x + room.width, room.z + room.depth) + 3));
  const grid = Array.from({ length: size }, () => Array<number>(size).fill(BlockKind.Wall));
  const protectedCells = new Set<string>();

  for (const room of rooms)
    for (const cell of room.cells) grid[cell.z][cell.x] = BlockKind.Floor;

  const byId = new Map(rooms.map(room => [room.id, room]));
  for (const [fromId, toId] of layout.edges) {
    const from = byId.get(fromId), to = byId.get(toId);
    if (!from || !to) continue;
    carveConnection(grid, roomCenterCell(from), roomCenterCell(to), protectedCells, rng);
  }

  for (const room of rooms) addRoomObstacles(room, grid, protectedCells);
  for (const room of rooms) room.entrances = collectEntrances(room, grid);

  const startRoom = byId.get('room-7')!;
  const exitRoom = byId.get('room-1')!;
  const spawn = roomCenterCell(startRoom);
  // The tactical template may have placed a pillar at the nominal center.
  // Reserve a small entry area before building/rendering the floor.
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (startRoom.cells.some(cell => cell.x === spawn.x + dx && cell.z === spawn.z + dz))
      grid[spawn.z + dz][spawn.x + dx] = BlockKind.Floor;
  }
  const portal = roomCenterCell(exitRoom);
  grid[portal.z][portal.x] = BlockKind.Portal;

  const chests = rooms.filter(room => room.kind === 'treasure').map(room => room.template === 'ruins-supply'
    ? { x: room.x + Math.floor(room.width / 2) - 1, z: room.z + Math.floor(room.depth / 2) }
    : openCellNear(room, grid, rng));
  const merchantRng = new RNG((seed ^ 0x5a17cafe ^ Math.imul(floor, 0x45d9f3b)) >>> 0);
  const safeRooms = rooms.filter(room =>
    room.kind === 'treasure' || room.kind === 'sanctuary' || (foundry && floor === 10 && room.kind === 'start'),
  );
  const merchantRoom = merchantRng.pick(safeRooms);
  const merchant = floor % 3 === 0 || merchantRng.chance(0.35)
    ? openCellNear(merchantRoom, grid, merchantRng, [portal, ...chests], 2) : undefined;

  return {
    generationVersion: version, layoutKind: layout.kind,
    size, grid, rooms, spawn, portal, chests, merchant,
    connections: layout.edges, theme: foundry ? foundryThemeForFloor(floor) : ruins ? ruinsThemeForFloor(floor) : sanctum ? sanctumThemeForFloor(floor) : RUINS_THEME, seed, floor,
  };
}

/** Stable legacy generator used by generationVersion 1 saves. */
export function generateLegacyFloor(seed: number, floor: number): FloorData {
  const rng = new RNG(seed);
  const size = 40;
  const grid = Array.from({ length: size }, () => Array<number>(size).fill(BlockKind.Wall));
  const kinds: RoomKind[] = ['battle', 'exit', 'battle', 'elite', 'battle', 'elite', 'treasure', 'start', 'sanctuary'];
  if (rng.chance(0.5)) [kinds[6], kinds[8]] = [kinds[8], kinds[6]];
  const templates = Object.keys(ROOM_TEMPLATES) as (keyof typeof ROOM_TEMPLATES)[];
  const rooms: Room[] = kinds.map((kind, i) => ({
    id: `room-${i}`, kind, required: i === 1 || i === 4,
    x: 3 + (i % 3) * 12, z: 3 + Math.floor(i / 3) * 12,
    width: 10, depth: 10,
    template: ['start', 'treasure', 'sanctuary', 'exit'].includes(kind) ? 'open' : rng.pick(templates),
  }));
  for (const room of rooms) {
    for (let z = room.z; z < room.z + room.depth; z++)
      for (let x = room.x; x < room.x + room.width; x++) grid[z][x] = BlockKind.Floor;
    for (const [x, z] of ROOM_TEMPLATES[room.template as keyof typeof ROOM_TEMPLATES])
      grid[room.z + z][room.x + x] = BlockKind.Obstacle;
  }
  const edges: [number, number][] = [[0,1],[1,2],[2,5],[5,8],[8,7],[7,6],[6,3],[3,0],[7,4],[4,1], rng.chance(0.5) ? [3,4] : [4,5]];
  const center = (room: Room) => ({ x: room.x + 5, z: room.z + 5 });
  for (const [a, b] of edges) {
    const start = center(rooms[a]), end = center(rooms[b]);
    for (let z = Math.min(start.z,end.z); z <= Math.max(start.z,end.z); z++)
      for (let x = Math.min(start.x,end.x); x <= Math.max(start.x,end.x); x++)
        for (let offset = -1; offset <= 1; offset++)
          grid[z + (start.z === end.z ? offset : 0)][x + (start.x === end.x ? offset : 0)] = BlockKind.Floor;
  }
  // Rotate the entire graph, retaining the short route and wide doorways.
  const turns = rng.int(0, 3);
  let rotated = grid;
  const point = (p: { x: number; z: number }) => {
    let { x, z } = p;
    for (let i = 0; i < turns; i++) [x,z] = [size - 1 - z,x];
    return { x,z };
  };
  for (let i = 0; i < turns; i++) rotated = rotated.map((row,z) => row.map((_,x) => rotated[size - 1 - x][z]));
  const spawn = point(center(rooms[7]));
  const portal = point(center(rooms[1]));
  const chests = rooms.filter(room => room.kind === 'treasure').map(room => point(center(room)));
  for (const room of rooms) {
    const corners = [point({x:room.x,z:room.z}),point({x:room.x+9,z:room.z+9})];
    room.x = Math.min(...corners.map(p => p.x)); room.z = Math.min(...corners.map(p => p.z));
  }
  rotated[portal.z][portal.x] = BlockKind.Portal;
  // Separate RNG stream keeps existing terrain and saved coordinates stable.
  const merchantRng = new RNG((seed ^ 0x5a17cafe) >>> 0);
  const merchantRoom = merchantRng.pick(rooms.filter(room => room.kind === 'treasure' || room.kind === 'sanctuary'));
  const merchant = floor % 3 === 0 || merchantRng.chance(0.35)
    ? { x: merchantRoom.x + merchantRng.pick([2, 7]), z: merchantRoom.z + 2 } : undefined;
  const themes = floors as FloorTheme[];
  return { size, grid: rotated, rooms, spawn, portal, chests, merchant,
    connections: edges.map(([a,b]) => [rooms[a].id!,rooms[b].id!]),
    theme: themes[Math.min(themes.length - 1, Math.floor(Math.max(0, floor - 1) / 5))], seed, floor };
}

export function generateFloor(seed: number, floor: number, generationVersion: number = 5): FloorData {
  if (generationVersion === 1) return generateLegacyFloor(seed, floor);
  const spatialVersion = generationVersion === 3 ? 3 : generationVersion === 4 ? 4 : generationVersion === 5 ? 5 : 2;
  return generateSpatialFloor(seed, floor, spatialVersion);
}

export function isWalkable(floor: FloorData, x: number, z: number): boolean {
  if (x < 0 || z < 0 || x >= floor.size || z >= floor.size) return false;
  return floor.grid[z][x] === BlockKind.Floor || floor.grid[z][x] === BlockKind.Portal;
}
