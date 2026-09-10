import { isMobileDevice } from '../utils/mobile';

const SETTINGS_KEY = 'mineworld_settings_v1';

export interface GameSettings {
  lookSensitivity: number;
  cameraFollow: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  lookSensitivity: 1,
  cameraFollow: false,
};

export class SettingsManager {
  private static cached: GameSettings | null = null;
  static load(): GameSettings {
    if (this.cached) return { ...this.cached };
    const defaultSettings: GameSettings = {
      ...DEFAULT_SETTINGS,
      lookSensitivity: isMobileDevice() ? 1.8 : 1,
    };
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return this.cached = defaultSettings;
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      return this.cached = {
        lookSensitivity:
          typeof parsed.lookSensitivity === 'number' && parsed.lookSensitivity > 0
            ? parsed.lookSensitivity
            : defaultSettings.lookSensitivity,
        cameraFollow: parsed.cameraFollow === true,
      };
    } catch {
      return this.cached = defaultSettings;
    }
  }

  static save(settings: GameSettings): void {
    this.cached = { ...settings };
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

  static getCameraFollow(): boolean {
    return SettingsManager.load().cameraFollow;
  }

  static setCameraFollow(value: boolean): void {
    const settings = SettingsManager.load();
    settings.cameraFollow = value;
    SettingsManager.save(settings);
  }
}
