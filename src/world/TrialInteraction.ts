import type { Room } from '../types';
import { roomCenter } from './RoomGeometry';

/** Shared by the trial monument and its start/reward interaction. */
export function trialInteractionPosition(room: Room): { x: number; z: number } {
  return roomCenter(room);
}
