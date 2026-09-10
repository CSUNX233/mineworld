import type { Room } from '../types';

const masks = new WeakMap<Room, Set<string>>();

export function roomContainsCell(room: Room, x: number, z: number): boolean {
  if (!room.cells) return x >= room.x && x < room.x + room.width && z >= room.z && z < room.z + room.depth;
  let mask = masks.get(room);
  if (!mask) { mask = new Set(room.cells.map(cell => `${cell.x},${cell.z}`)); masks.set(room, mask); }
  return mask.has(`${x},${z}`);
}

export function roomContainsPoint(room: Room, x: number, z: number): boolean {
  return roomContainsCell(room, Math.floor(x), Math.floor(z));
}

export function roomCenter(room: Room): { x: number; z: number } {
  return room.center ?? { x: room.x + room.width / 2, z: room.z + room.depth / 2 };
}
