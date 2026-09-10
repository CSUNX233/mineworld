import type { FloorData, FloorTheme, Room, RoomKind } from '../types';
import { BlockKind } from './Block';
import { RNG } from '../utils/RNG';
import floors from '../data/floors.json';
import { ROOM_TEMPLATES } from '../data/rooms';

/** Bounded room graph: two objective rooms on a short spine, optional loops. */
export function generateFloor(seed: number, floor: number): FloorData {
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
  const themes = floors as FloorTheme[];
  return { size, grid: rotated, rooms, spawn, portal, chests,
    connections: edges.map(([a,b]) => [rooms[a].id!,rooms[b].id!]),
    theme: themes[Math.min(themes.length - 1, Math.floor(Math.max(0, floor - 1) / 5))], seed, floor };
}

export function isWalkable(floor: FloorData, x: number, z: number): boolean {
  if (x < 0 || z < 0 || x >= floor.size || z >= floor.size) return false;
  return floor.grid[z][x] === BlockKind.Floor || floor.grid[z][x] === BlockKind.Portal;
}
