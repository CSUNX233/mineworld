import type { Room } from '../types';

interface RoomMask { x: number; z: number; width: number; depth: number; cells: Uint8Array }
const masks = new WeakMap<Room, RoomMask>();

export function roomContainsCell(room: Room, x: number, z: number): boolean {
  if (!room.cells) return x >= room.x && x < room.x + room.width && z >= room.z && z < room.z + room.depth;
  let mask = masks.get(room);
  if (!mask) {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const cell of room.cells) {
      minX = Math.min(minX, cell.x); minZ = Math.min(minZ, cell.z);
      maxX = Math.max(maxX, cell.x); maxZ = Math.max(maxZ, cell.z);
    }
    const width = room.cells.length ? maxX - minX + 1 : 0;
    const depth = room.cells.length ? maxZ - minZ + 1 : 0;
    mask = { x: minX, z: minZ, width, depth, cells: new Uint8Array(width * depth) };
    for (const cell of room.cells) mask.cells[(cell.z - minZ) * width + cell.x - minX] = 1;
    masks.set(room, mask);
  }
  // Preserve exact cell membership, including masks that extend past their nominal rectangle.
  const localX = x - mask.x, localZ = z - mask.z;
  return Number.isInteger(localX) && Number.isInteger(localZ)
    && localX >= 0 && localX < mask.width && localZ >= 0 && localZ < mask.depth
    && mask.cells[localZ * mask.width + localX] === 1;
}

export function roomContainsPoint(room: Room, x: number, z: number): boolean {
  return roomContainsCell(room, Math.floor(x), Math.floor(z));
}

export function roomCenter(room: Room): { x: number; z: number } {
  return room.center ?? { x: room.x + room.width / 2, z: room.z + room.depth / 2 };
}
