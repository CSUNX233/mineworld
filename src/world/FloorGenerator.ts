import type { FloorData, FloorTheme, Room } from '../types';
import { BlockKind } from './Block';
import { RNG } from '../utils/RNG';
import floors from '../data/floors.json';

const FLOOR_THEMES = floors as unknown as FloorTheme[];

function themeForFloor(floor: number): FloorTheme {
  const index = floor < 5 ? 0 : floor < 10 ? 1 : floor < 15 ? 2 : 3;
  return FLOOR_THEMES[Math.min(FLOOR_THEMES.length - 1, index)];
}

function rectsOverlap(a: Room, b: Room, margin: number): boolean {
  return !(
    a.x + a.width + margin <= b.x ||
    b.x + b.width + margin <= a.x ||
    a.z + a.depth + margin <= b.z ||
    b.z + b.depth + margin <= a.z
  );
}

function carveRect(grid: number[][], room: Room, value: number = BlockKind.Floor): void {
  for (let z = room.z; z < room.z + room.depth; z++) {
    for (let x = room.x; x < room.x + room.width; x++) {
      if (z >= 0 && z < grid.length && x >= 0 && x < grid[0].length) {
        grid[z][x] = value;
      }
    }
  }
}

function carveCorridor(
  grid: number[][],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  rng: RNG,
): void {
  let x = ax;
  let z = az;
  const horizontalFirst = rng.chance(0.5);
  const horizontal = (): void => {
    while (x !== bx) {
      if (x >= 0 && x < grid[0].length && z >= 0 && z < grid.length) grid[z][x] = BlockKind.Floor;
      x += Math.sign(bx - x);
    }
  };
  const vertical = (): void => {
    while (z !== bz) {
      if (x >= 0 && x < grid[0].length && z >= 0 && z < grid.length) grid[z][x] = BlockKind.Floor;
      z += Math.sign(bz - z);
    }
  };
  if (horizontalFirst) {
    horizontal();
    vertical();
  } else {
    vertical();
    horizontal();
  }
  if (x >= 0 && x < grid[0].length && z >= 0 && z < grid.length) grid[z][x] = BlockKind.Floor;
}

function isWalkableKind(kind: number): boolean {
  return kind === BlockKind.Floor || kind === BlockKind.Portal;
}

function computeReachable(grid: number[][], size: number, start: { x: number; z: number }): Uint8Array {
  const reachable = new Uint8Array(size * size);
  if (!isWalkableKind(grid[start.z][start.x])) return reachable;
  const queue: number[] = [start.z * size + start.x];
  reachable[queue[0]] = 1;
  while (queue.length > 0) {
    const index = queue.shift()!;
    const x = index % size;
    const z = Math.floor(index / size);
    const neighbors = [
      [x + 1, z],
      [x - 1, z],
      [x, z + 1],
      [x, z - 1],
    ];
    for (const [nx, nz] of neighbors) {
      if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
      const nextIndex = nz * size + nx;
      if (reachable[nextIndex] === 1 || !isWalkableKind(grid[nz][nx])) continue;
      reachable[nextIndex] = 1;
      queue.push(nextIndex);
    }
  }
  return reachable;
}

function findPathToReachable(
  grid: number[][],
  size: number,
  startX: number,
  startZ: number,
  reachable: Uint8Array,
): number[] {
  const startIndex = startZ * size + startX;
  const parent = new Int32Array(size * size).fill(-1);
  const visited = new Uint8Array(size * size);
  const queue: number[] = [startIndex];
  visited[startIndex] = 1;

  while (queue.length > 0) {
    const index = queue.shift()!;
    if (reachable[index] === 1 && isWalkableKind(grid[Math.floor(index / size)][index % size])) {
      const path: number[] = [];
      let current = index;
      while (current !== -1) {
        path.push(current);
        current = parent[current];
      }
      return path;
    }

    const x = index % size;
    const z = Math.floor(index / size);
    const neighbors = [
      [x + 1, z],
      [x - 1, z],
      [x, z + 1],
      [x, z - 1],
    ];
    for (const [nx, nz] of neighbors) {
      if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
      const nextIndex = nz * size + nx;
      if (visited[nextIndex] === 1) continue;
      visited[nextIndex] = 1;
      parent[nextIndex] = index;
      queue.push(nextIndex);
    }
  }
  return [];
}

function ensureConnectivity(grid: number[][], size: number, spawn: { x: number; z: number }): void {
  for (let iteration = 0; iteration < 250; iteration++) {
    const reachable = computeReachable(grid, size, spawn);
    let targetX = -1;
    let targetZ = -1;
    for (let z = 0; z < size && targetX < 0; z++) {
      for (let x = 0; x < size; x++) {
        if (isWalkableKind(grid[z][x]) && reachable[z * size + x] === 0) {
          targetX = x;
          targetZ = z;
          break;
        }
      }
    }
    if (targetX < 0) break;

    const path = findPathToReachable(grid, size, targetX, targetZ, reachable);
    for (const index of path) {
      const x = index % size;
      const z = Math.floor(index / size);
      if (!isWalkableKind(grid[z][x])) grid[z][x] = BlockKind.Floor;
    }
  }
}

export function generateFloor(seed: number, floor: number): FloorData {
  const rng = new RNG(seed);
  const size = Math.min(80, 40 + Math.max(0, floor) * 4);
  const grid: number[][] = Array.from({ length: size }, () => Array<number>(size).fill(BlockKind.Wall));

  const roomCount = Math.min(14, 7 + Math.floor(size / 14));
  const rooms: Room[] = [];
  const maxAttempts = 180;
  const margin = 2;

  for (let i = 0; i < roomCount; i++) {
    let placed = false;
    for (let attempt = 0; attempt < maxAttempts && !placed; attempt++) {
      const width = rng.int(7, 15);
      const depth = rng.int(7, 15);
      const x = rng.int(2, Math.max(3, size - width - 2));
      const z = rng.int(2, Math.max(3, size - depth - 2));
      const room: Room = { x, z, width, depth };
      if (rooms.every((other) => !rectsOverlap(room, other, margin))) {
        rooms.push(room);
        carveRect(grid, room);
        placed = true;
      }
    }
  }

  if (rooms.length < 2) {
    const first: Room = { x: 3, z: 3, width: 10, depth: 10 };
    const second: Room = { x: size - 14, z: size - 14, width: 10, depth: 10 };
    rooms.length = 0;
    rooms.push(first, second);
    carveRect(grid, first);
    carveRect(grid, second);
  }

  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1];
    const b = rooms[i];
    carveCorridor(
      grid,
      Math.floor(a.x + a.width / 2),
      Math.floor(a.z + a.depth / 2),
      Math.floor(b.x + b.width / 2),
      Math.floor(b.z + b.depth / 2),
      rng,
    );
  }

  const cavernCount = rng.int(2, 4);
  for (let i = 0; i < cavernCount; i++) {
    const cx = rng.int(5, Math.max(6, size - 5));
    const cz = rng.int(5, Math.max(6, size - 5));
    const radius = rng.int(3, 6);
    for (let z = cz - radius; z <= cz + radius; z++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (z < 0 || z >= size || x < 0 || x >= size) continue;
        const dx = x - cx;
        const dz = z - cz;
        if (dx * dx + dz * dz <= radius * radius + rng.float() * 2) {
          grid[z][x] = BlockKind.Floor;
        }
      }
    }
  }

  const spawnRoom = rooms[0];
  const portalRoom = rooms[rooms.length - 1];
  const spawn = {
    x: Math.floor(spawnRoom.x + spawnRoom.width / 2),
    z: Math.floor(spawnRoom.z + spawnRoom.depth / 2),
  };
  const portal = {
    x: Math.floor(portalRoom.x + portalRoom.width / 2),
    z: Math.floor(portalRoom.z + portalRoom.depth / 2),
  };
  grid[portal.z][portal.x] = BlockKind.Portal;

  const floorCells: { x: number; z: number }[] = [];
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      if (grid[z][x] === BlockKind.Floor) floorCells.push({ x, z });
    }
  }

  const obstacleCount = Math.min(floorCells.length * 0.02, 5 + Math.floor(floor / 2) * 2);
  const obstacleCandidates = rng.shuffle(floorCells).filter((cell) => {
    const distToSpawn = Math.abs(cell.x - spawn.x) + Math.abs(cell.z - spawn.z);
    const distToPortal = Math.abs(cell.x - portal.x) + Math.abs(cell.z - portal.z);
    return distToSpawn > 5 && distToPortal > 5;
  });
  for (let i = 0; i < Math.min(obstacleCount, obstacleCandidates.length); i++) {
    grid[obstacleCandidates[i].z][obstacleCandidates[i].x] = BlockKind.Obstacle;
  }

  ensureConnectivity(grid, size, spawn);

  const chestCells = rng.shuffle(floorCells).filter((cell) => {
    const distToSpawn = Math.abs(cell.x - spawn.x) + Math.abs(cell.z - spawn.z);
    const distToPortal = Math.abs(cell.x - portal.x) + Math.abs(cell.z - portal.z);
    return distToSpawn > 8 && distToPortal > 4 && grid[cell.z][cell.x] === BlockKind.Floor;
  });
  const chests = chestCells.slice(0, Math.min(2 + Math.floor(floor / 3), 4));

  return {
    size,
    grid,
    rooms,
    spawn,
    portal,
    chests,
    theme: themeForFloor(floor),
    seed,
    floor,
  };
}

export function isWalkable(floorData: FloorData, x: number, z: number): boolean {
  if (x < 0 || z < 0 || x >= floorData.size || z >= floorData.size) return false;
  return isWalkableKind(floorData.grid[z][x]);
}
