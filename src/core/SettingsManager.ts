import { isMobileDevice } from '../utils/mobile';

const SETTINGS_KEY = 'mineworld_settings_v1';

export interface GameSettings {
  lookSensitivity: number;
}

const DEFAULT_SETTINGS: GameSettings = {
  lookSensitivity: 1,
};

export class SettingsManager {
  static load(): GameSettings {
    const defaultSettings: GameSettings = {
      ...DEFAULT_SETTINGS,
      lookSensitivity: isMobileDevice() ? 1.8 : 1,
    };
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return defaultSettings;
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      return {
        lookSensitivity:
          typeof parsed.lookSensitivity === 'number' && parsed.lookSensitivity > 0
            ? parsed.lookSensitivity
            : defaultSettings.lookSensitivity,
      };
    } catch {
      return defaultSettings;
    }
  }

  static save(settings: GameSettings): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn('Failed to save settings', error);
    }
  }

  static getLookSensitivity(): number {
    return SettingsManager.load().lookSensitivity;
  }

  static setLookSensitivity(value: number): void {
    const settings = SettingsManager.load();
    settings.lookSensitivity = value;
    SettingsManager.save(settings);
  }
}
