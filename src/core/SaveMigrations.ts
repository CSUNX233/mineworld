import { cloneData } from '../utils/cloneData';
import type { SaveData } from '../types';
import { BASIC_RUN_DEFINITION } from '../data/runProgression';

export const SAVE_VERSION = 2;
export const ENVELOPE_VERSION = 3;
export function migrateSave(data: SaveData): SaveData | null {
  if (data.version !== 1 && data.version !== SAVE_VERSION) return null;
  if (data.version === SAVE_VERSION) return data;
  // The former generator cannot reproduce the new room graph. Preserve the
  // character and inventory, and restart only the current floor's exploration.
  return { ...data, version: SAVE_VERSION, monsters: undefined, portalActive: false,
    floorProgress: undefined, openedChests: [], buildRanks: {}, buildChoiceFloor: 0 };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function upgradeEnvelopeRules(value: unknown): unknown {
  if (!isRecord(value) || value.version !== ENVELOPE_VERSION || !isRecord(value.activeRun)) {
    return value;
  }

  const activeRun = value.activeRun;
  if (activeRun.runDefinitionId !== 'basic-five-floors' || activeRun.rulesVersion !== 1) {
    return value;
  }

  if (activeRun.snapshot !== null) {
    if (!isRecord(activeRun.snapshot)
      || !Number.isInteger(activeRun.snapshot.floor)
      || (activeRun.snapshot.floor as number) < 1
      || (activeRun.snapshot.floor as number) > 5) {
      return value;
    }
  }

  const upgraded = cloneData(value);
  const upgradedRun = upgraded.activeRun as Record<string, unknown>;
  upgradedRun.runDefinitionId = BASIC_RUN_DEFINITION.id;
  upgradedRun.rulesVersion = BASIC_RUN_DEFINITION.rulesVersion;
  return upgraded;
}
