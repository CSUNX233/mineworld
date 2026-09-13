import type { Room } from '../types';
import { roomCenter } from './RoomGeometry';

interface Point { x: number; z: number }
/** One stable pool sized to the largest room; room changes do not recompile lighting shaders. */
export class RoomLightSelection {
  private readonly groups: number[][];
  readonly capacity: number;
  constructor(sources: readonly Point[], private readonly rooms: readonly Room[]) {
    this.groups = Array.from({length: Math.max(1, rooms.length)}, () => []);
    sources.forEach((source, index) => this.groups[this.nearest(source)].push(index));
    this.capacity = Math.max(0, ...this.groups.map(group => group.length));
  }
  select(viewer: Point): number[] { return this.groups[this.nearest(viewer)]; }
  private nearest(point: Point): number {
    let selected = 0, best = Infinity, centerDistance = Infinity;
    this.rooms.forEach((room, index) => {
      const rectDistance = (x: number, z: number, w: number, d: number) =>
        Math.max(x - point.x, 0, point.x - x - w) ** 2 + Math.max(z - point.z, 0, point.z - z - d) ** 2;
      let distance = rectDistance(room.x, room.z, room.width, room.depth);
      if (room.cells?.length) {
        distance = Infinity;
        for (const cell of room.cells) {
          distance = Math.min(distance, rectDistance(cell.x, cell.z, 1, 1));
          if (distance === 0) break;
        }
      }
      const center = roomCenter(room), tie = (point.x-center.x)**2 + (point.z-center.z)**2;
      if (distance < best || (distance === best && tie < centerDistance)) {
        selected=index; best=distance; centerDistance=tie;
      }
    });
    return selected;
  }
}
