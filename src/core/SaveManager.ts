import type { SaveData } from '../types';

const SAVE_KEY = 'mineworld_save_v1';

export class SaveManager {
  static hasSave(): boolean {
    return localStorage.getItem(SAVE_KEY) !== null;
  }

  static save(data: SaveData): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save game', error);
    }
  }

  static load(): SaveData | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as SaveData;
      if (!data.version || !data.player || !Array.isArray(data.inventory)) return null;
      return data;
    } catch (error) {
      console.warn('Failed to load save', error);
      return null;
    }
  }

  static clear(): void {
    localStorage.removeItem(SAVE_KEY);
  }
}
