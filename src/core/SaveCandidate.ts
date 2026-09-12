import { cloneData } from '../utils/cloneData';
import type { SaveData } from '../types';
import type { SaveEnvelopeV3 } from '../progression/types';

/** Clone persistent history once, excluding the old snapshot that will be replaced. */
export function createSaveCandidate(envelope: SaveEnvelopeV3, snapshot: SaveData, level: number, upgrades: number): SaveEnvelopeV3 {
  const candidate: SaveEnvelopeV3 = cloneData({ ...envelope, activeRun: envelope.activeRun
    ? { ...envelope.activeRun, snapshot: null } : envelope.activeRun });
  if (candidate.activeRun) {
    candidate.activeRun.maxLevel = Math.max(candidate.activeRun.maxLevel, level);
    candidate.activeRun.upgradeCount = Math.max(candidate.activeRun.upgradeCount, upgrades);
    candidate.activeRun.snapshot = snapshot;
    candidate.revision += 1;
  }
  return candidate;
}
