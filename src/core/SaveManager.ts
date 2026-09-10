import type { SaveEnvelopeV3, SaveResult, SlotReadResult } from '../progression/types';
import type { SaveData } from '../types';
import { RunManager } from './RunManager';
import { ENVELOPE_VERSION, migrateSave, upgradeEnvelopeRules } from './SaveMigrations';
import { validateLegacySaveData, validateSaveEnvelope } from './SaveValidation';

const LEGACY_SAVE_KEY = 'mineworld_save_v1';
const SAVE_PREFIX = 'mineworld_save_slot_';
const MIGRATION_BACKUP_PREFIX = 'mineworld_save_migration_backup_slot_';
const SLOT_COUNT = 5;
let fallbackProfileCounter = 0;

export interface SaveSlotMeta {
  slot: number;
  exists: boolean;
  floor: number;
  level: number;
  updatedAt: number;
  state?: 'empty' | 'legacy' | 'camp' | 'active' | 'summary' | 'invalid';
  metaPoints?: number;
}

function validSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < SLOT_COUNT;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createProfileId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Some restricted browser contexts expose crypto but reject randomUUID.
  }
  fallbackProfileCounter += 1;
  return `profile-${Date.now().toString(36)}-${fallbackProfileCounter.toString(36)}`;
}

function rawForSlot(slot: number): { raw: string | null; sourceKey: string } {
  const slotKey = SAVE_PREFIX + slot;
  const slotRaw = localStorage.getItem(slotKey);
  if (slotRaw !== null) return { raw: slotRaw, sourceKey: slotKey };
  if (slot === 0) return { raw: localStorage.getItem(LEGACY_SAVE_KEY), sourceKey: LEGACY_SAVE_KEY };
  return { raw: null, sourceKey: slotKey };
}

function parseRaw(raw: string): SlotReadResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    return { kind: 'invalid', error: `Save is not valid JSON: ${errorMessage(error)}` };
  }

  if (typeof value === 'object' && value !== null && 'version' in value
    && (value as { version?: unknown }).version === ENVELOPE_VERSION) {
    const checked = validateSaveEnvelope(upgradeEnvelopeRules(value));
    return checked.ok
      ? { kind: 'ready', envelope: checked.value }
      : { kind: 'invalid', error: checked.error };
  }

  const legacy = validateLegacySaveData(value);
  if (!legacy.ok) return { kind: 'invalid', error: legacy.error };
  return { kind: 'legacy', data: legacy.value, sourceVersion: legacy.value.version };
}

export class SaveManager {
  static get slotCount(): number {
    return SLOT_COUNT;
  }

  static hasSave(slot = 0): boolean {
    if (!validSlot(slot)) return false;
    try {
      return rawForSlot(slot).raw !== null;
    } catch {
      return false;
    }
  }

  static readSlot(slot = 0): SlotReadResult {
    if (!validSlot(slot)) return { kind: 'error', error: `Invalid save slot: ${slot}` };
    try {
      const { raw } = rawForSlot(slot);
      return raw === null ? { kind: 'empty' } : parseRaw(raw);
    } catch (error) {
      return { kind: 'error', error: `Failed to read save: ${errorMessage(error)}` };
    }
  }

  static saveEnvelope(envelope: SaveEnvelopeV3, slot = 0): SaveResult {
    if (!validSlot(slot)) return { ok: false, error: `Invalid save slot: ${slot}` };
    const checked = validateSaveEnvelope(envelope);
    if (!checked.ok) return { ok: false, error: checked.error };
    try {
      const raw = JSON.stringify(checked.value);
      localStorage.setItem(SAVE_PREFIX + slot, raw);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: `Failed to save game: ${errorMessage(error)}` };
    }
  }

  static migrateLegacy(slot = 0): { ok: true; envelope: SaveEnvelopeV3 } | { ok: false; error: string } {
    if (!validSlot(slot)) return { ok: false, error: `Invalid save slot: ${slot}` };
    try {
      const { raw } = rawForSlot(slot);
      if (raw === null) return { ok: false, error: 'No legacy save found' };

      const parsed = parseRaw(raw);
      if (parsed.kind !== 'legacy') {
        const detail = parsed.kind === 'invalid' || parsed.kind === 'error' ? `: ${parsed.error}` : '';
        return { ok: false, error: `Save is not a migratable legacy save${detail}` };
      }
      const migrated = migrateSave(parsed.data);
      if (migrated === null) return { ok: false, error: 'Legacy save version is not supported' };

      const backupKey = MIGRATION_BACKUP_PREFIX + slot;
      if (localStorage.getItem(backupKey) === null) localStorage.setItem(backupKey, raw);

      const envelope = RunManager.createEnvelope(createProfileId());
      envelope.legacyArchive = {
        importedAt: Date.now(),
        sourceVersion: parsed.sourceVersion,
        snapshot: migrated,
      };
      const saved = SaveManager.saveEnvelope(envelope, slot);
      if (!saved.ok) return saved;
      return { ok: true, envelope };
    } catch (error) {
      return { ok: false, error: `Failed to migrate legacy save: ${errorMessage(error)}` };
    }
  }

  // Compatibility API for callers that still deal in the v1/v2 run snapshot.
  static save(data: SaveData, slot = 0): void {
    if (!validSlot(slot)) return;
    try {
      localStorage.setItem(SAVE_PREFIX + slot, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save game', error);
    }
  }

  // Compatibility API. A v3 slot exposes only its current run snapshot.
  static load(slot = 0): SaveData | null {
    const result = SaveManager.readSlot(slot);
    if (result.kind === 'ready') return result.envelope.activeRun?.snapshot ?? null;
    if (result.kind !== 'legacy') return null;
    return migrateSave(result.data);
  }

  static clear(slot = 0): void {
    if (!validSlot(slot)) return;
    localStorage.removeItem(SAVE_PREFIX + slot);
    localStorage.removeItem(MIGRATION_BACKUP_PREFIX + slot);
    if (slot === 0) localStorage.removeItem(LEGACY_SAVE_KEY);
  }

  static exportLegacy(slot = 0): void {
    if (!validSlot(slot)) return;
    try {
      let raw = localStorage.getItem(MIGRATION_BACKUP_PREFIX + slot);
      if (raw === null) {
        const result = SaveManager.readSlot(slot);
        if (result.kind === 'legacy') raw = JSON.stringify(result.data);
        else if (result.kind === 'ready' && result.envelope.legacyArchive) {
          raw = JSON.stringify(result.envelope.legacyArchive.snapshot);
        }
      }
      if (raw === null) return;
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `mineworld-legacy-slot-${slot}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.warn('Failed to export legacy save', error);
    }
  }

  static listSlots(): SaveSlotMeta[] {
    const slots: SaveSlotMeta[] = [];
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const result = SaveManager.readSlot(slot);
      if (result.kind === 'empty') {
        slots.push({ slot, exists: false, floor: 0, level: 0, updatedAt: 0, state: 'empty' });
      } else if (result.kind === 'legacy') {
        slots.push({
          slot,
          exists: true,
          floor: result.data.floor,
          level: result.data.player.level,
          updatedAt: 0,
          state: 'legacy',
        });
      } else if (result.kind === 'ready') {
        const { envelope } = result;
        const snapshot = envelope.activeRun?.snapshot;
        const updatedAt = Math.max(
          envelope.activeRun?.startedAt ?? 0,
          envelope.pendingSettlement?.finishedAt ?? 0,
          envelope.recentRuns[0]?.finishedAt ?? 0,
          envelope.legacyArchive?.importedAt ?? 0,
        );
        slots.push({
          slot,
          exists: true,
          floor: snapshot?.floor ?? envelope.pendingSettlement?.finalFloor ?? 0,
          level: snapshot?.player.level ?? envelope.pendingSettlement?.finalLevel ?? 0,
          updatedAt,
          state: envelope.pendingSettlement ? 'summary' : envelope.activeRun ? 'active' : 'camp',
          metaPoints: envelope.profile.availableMetaPoints,
        });
      } else {
        slots.push({ slot, exists: true, floor: 0, level: 0, updatedAt: 0, state: 'invalid' });
      }
    }
    return slots;
  }
}
