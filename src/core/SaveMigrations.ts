import type { SaveData } from '../types';

export const SAVE_VERSION = 2;
export function migrateSave(data: SaveData): SaveData | null {
  if (data.version !== 1 && data.version !== SAVE_VERSION) return null;
  if (data.version === SAVE_VERSION) return data;
  // The former generator cannot reproduce the new room graph. Preserve the
  // character and inventory, and restart only the current floor's exploration.
  return { ...data, version: SAVE_VERSION, monsters: undefined, portalActive: false,
    floorProgress: undefined, openedChests: [], buildRanks: {}, buildChoiceFloor: 0 };
}
