import type { SaveData } from '../types';
import { migrateSave } from './SaveMigrations';

const LEGACY_SAVE_KEY = 'mineworld_save_v1';
const SAVE_PREFIX = 'mineworld_save_slot_';
const SLOT_COUNT = 3;

export interface SaveSlotMeta {
  slot: number;
  exists: boolean;
  floor: number;
  level: number;
  updatedAt: number;
}

export class SaveManager {
  static get slotCount(): number {
    return SLOT_COUNT;
  }

  static hasSave(slot = 0): boolean {
    if (slot === 0 && localStorage.getItem(LEGACY_SAVE_KEY) !== null) return true;
    return localStorage.getItem(SAVE_PREFIX + slot) !== null;
  }

  static save(data: SaveData, slot = 0): void {
    try {
      localStorage.setItem(SAVE_PREFIX + slot, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save game', error);
    }
  }

  static load(slot = 0): SaveData | null {
    try {
      const raw = slot === 0
        ? localStorage.getItem(SAVE_PREFIX + slot) ?? localStorage.getItem(LEGACY_SAVE_KEY)
        : localStorage.getItem(SAVE_PREFIX + slot);
      if (!raw) return null;
      const data = JSON.parse(raw) as SaveData;
      if (!data.version || !data.player || !Array.isArray(data.inventory)) return null;
      return migrateSave(data);
    } catch (error) {
      console.warn('Failed to load save', error);
      return null;
    }
  }

  static clear(slot = 0): void {
    localStorage.removeItem(SAVE_PREFIX + slot);
    if (slot === 0) localStorage.removeItem(LEGACY_SAVE_KEY);
  }

  static listSlots(): SaveSlotMeta[] {
    const slots: SaveSlotMeta[] = [];
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const data = SaveManager.load(slot);
      slots.push({
        slot,
        exists: data !== null,
        floor: data?.floor ?? 0,
        level: data?.player.level ?? 0,
        updatedAt: 0,
      });
    }
    return slots;
  }
}
