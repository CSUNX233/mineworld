import type { FloorData, Room } from '../types';
import { isWalkable } from './FloorGenerator';

/** A thin, room-facing collision plane spanning one open doorway cell. */
export interface EncounterBarrier {
  roomId: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  inwardX: number;
  inwardZ: number;
}

export const ENCOUNTER_BARRIER_THICKNESS = 0.14;
export const ENCOUNTER_BARRIER_HEIGHT = 4.5;

const EMPTY_BARRIERS: readonly EncounterBarrier[] = Object.freeze([]);
const activeBarriers = new WeakMap<FloorData, EncounterBarrier[]>();

function isDoorCell(floor: FloorData, insideX: number, insideZ: number, outsideX: number, outsideZ: number): boolean {
  return isWalkable(floor, insideX, insideZ) && isWalkable(floor, outsideX, outsideZ);
}

function barriersForRoom(floor: FloorData, room: Room): EncounterBarrier[] {
  if (!room.id) return [];
  const result: EncounterBarrier[] = [];
  const half = ENCOUNTER_BARRIER_THICKNESS / 2;
  const add = (minX: number, maxX: number, minZ: number, maxZ: number, inwardX: number, inwardZ: number) => {
    result.push({ roomId: room.id!, minX, maxX, minZ, maxZ, inwardX, inwardZ });
  };

  for (let z = room.z; z < room.z + room.depth; z++) {
    if (isDoorCell(floor, room.x, z, room.x - 1, z))
      add(room.x - half, room.x + half, z, z + 1, 1, 0);
    const east = room.x + room.width - 1;
    if (isDoorCell(floor, east, z, east + 1, z))
      add(room.x + room.width - half, room.x + room.width + half, z, z + 1, -1, 0);
  }
  for (let x = room.x; x < room.x + room.width; x++) {
    if (isDoorCell(floor, x, room.z, x, room.z - 1))
      add(x, x + 1, room.z - half, room.z + half, 0, 1);
    const south = room.z + room.depth - 1;
    if (isDoorCell(floor, x, south, x, south + 1))
      add(x, x + 1, room.z + room.depth - half, room.z + room.depth + half, 0, -1);
  }
  return result;
}

/** Replaces all active barriers for a floor and returns their render geometry. */
export function setEncounterBarrierRooms(floor: FloorData, roomIds: Iterable<string>): EncounterBarrier[] {
  const locked = new Set(roomIds);
  const barriers = floor.rooms
    .filter(room => room.id && locked.has(room.id))
    .flatMap(room => barriersForRoom(floor, room));
  activeBarriers.set(floor, barriers);
  return barriers;
}

export function clearEncounterBarriers(floor: FloorData): void {
  activeBarriers.delete(floor);
}

export function getEncounterBarriers(floor: FloorData): readonly EncounterBarrier[] {
  return activeBarriers.get(floor) ?? EMPTY_BARRIERS;
}

/** Finds a walkable cell center safely inside a room, useful for old-save repair. */
export function findEncounterRoomPosition(
  floor: FloorData,
  room: Room,
  nearX = room.x + room.width / 2,
  nearZ = room.z + room.depth / 2,
): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null;
  let bestDistance = Infinity;
  for (let z = room.z + 1; z < room.z + room.depth - 1; z++) {
    for (let x = room.x + 1; x < room.x + room.width - 1; x++) {
      if (!isWalkable(floor, x, z)) continue;
      const candidate = { x: x + 0.5, z: z + 0.5 };
      const distance = (candidate.x - nearX) ** 2 + (candidate.z - nearZ) ** 2;
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
  }
  return best;
}

function overlaps(barrier: EncounterBarrier, x: number, z: number, radius: number): boolean {
  return x + radius > barrier.minX && x - radius < barrier.maxX
    && z + radius > barrier.minZ && z - radius < barrier.maxZ;
}

/**
 * Dynamic cylinder collision. Barriers are effectively ceiling-high, so jumping
 * cannot bypass them. When a barrier appears against the entering player, motion
 * farther into that room remains possible until their cylinder clears the plane.
 */
export function encounterBarrierBlocksCylinder(
  floor: FloorData,
  x: number,
  z: number,
  radius: number,
  minY = 0,
  maxY = ENCOUNTER_BARRIER_HEIGHT,
  previousX?: number,
  previousZ?: number,
): boolean {
  if (maxY <= 0 || minY >= ENCOUNTER_BARRIER_HEIGHT) return false;
  for (const barrier of getEncounterBarriers(floor)) {
    if (!overlaps(barrier, x, z, radius)) continue;
    if (previousX !== undefined && previousZ !== undefined
      && overlaps(barrier, previousX, previousZ, radius)) {
      const previousSide = (previousX - (barrier.minX + barrier.maxX) / 2) * barrier.inwardX
        + (previousZ - (barrier.minZ + barrier.maxZ) / 2) * barrier.inwardZ;
      const nextSide = (x - (barrier.minX + barrier.maxX) / 2) * barrier.inwardX
        + (z - (barrier.minZ + barrier.maxZ) / 2) * barrier.inwardZ;
      if (previousSide >= 0 && nextSide >= previousSide - 1e-6) continue;
    }
    return true;
  }
  return false;
}

/** Distance to the first active barrier along a ray. */
export function encounterBarrierRayDistance(
  floor: FloorData,
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  distance: number,
  radius = 0,
): number {
  let nearest = distance;
  for (const barrier of getEncounterBarriers(floor)) {
    let entry = 0;
    let exit = nearest;
    const bounds: [number, number, number, number][] = [
      [origin.x, direction.x, barrier.minX - radius, barrier.maxX + radius],
      [origin.y, direction.y, -radius, ENCOUNTER_BARRIER_HEIGHT + radius],
      [origin.z, direction.z, barrier.minZ - radius, barrier.maxZ + radius],
    ];
    for (const [start, delta, lo, hi] of bounds) {
      if (Math.abs(delta) < 1e-8) {
        if (start < lo || start > hi) { exit = -1; break; }
      } else {
        const a = (lo - start) / delta;
        const b = (hi - start) / delta;
        entry = Math.max(entry, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
      }
    }
    if (entry <= exit) nearest = Math.min(nearest, entry);
  }
  return nearest;
}
