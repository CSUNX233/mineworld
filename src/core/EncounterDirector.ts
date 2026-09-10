import type { FloorData, FloorProgress, Room } from '../types';

export class EncounterDirector {
  readonly state: FloorProgress;
  constructor(readonly floor: FloorData, saved?: FloorProgress) {
    const valid = new Set(floor.rooms.map(room => room.id));
    const clean = (ids?: string[]) => [...new Set((ids ?? []).filter(id => valid.has(id)))];
    this.state = {
      visited: clean(saved?.visited), started: clean(saved?.started),
      cleared: clean(saved?.cleared), usedSanctuaries: clean(saved?.usedSanctuaries),
    };
  }

  roomAt(x: number, z: number): Room | undefined {
    return this.floor.rooms.find(room => x >= room.x && x < room.x + room.width && z >= room.z && z < room.z + room.depth);
  }

  enter(x: number, z: number): Room | null {
    const room = this.roomAt(x, z);
    if (!room?.id) return null;
    if (!this.state.visited.includes(room.id)) this.state.visited.push(room.id);
    if (!['battle', 'elite', 'exit'].includes(room.kind!) || this.state.started.includes(room.id)) return null;
    this.state.started.push(room.id);
    return room;
  }

  complete(livingRoomIds: Set<string>): Room[] {
    const completed = this.floor.rooms.filter(room => room.id && this.state.started.includes(room.id)
      && !this.state.cleared.includes(room.id) && !livingRoomIds.has(room.id));
    completed.forEach(room => this.state.cleared.push(room.id!));
    return completed;
  }

  get remainingObjectives(): Room[] {
    return this.floor.rooms.filter(room => room.required && !this.state.cleared.includes(room.id!));
  }

  get portalReady(): boolean { return this.remainingObjectives.length === 0; }
}
