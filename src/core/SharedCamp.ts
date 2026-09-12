import { cloneData } from '../utils/cloneData';
import type { ProfileData, SaveEnvelopeV3 } from '../progression/types';
import { validateSaveEnvelope } from './SaveValidation';
import { RunManager } from './RunManager';
import { completedBasicVictoryCount } from '../progression/MetaProgression';

export const SHARED_CAMP_KEY = 'mineworld_shared_camp_v1';
export interface SharedCamp {
  version: 1;
  revision: number;
  profile: ProfileData;
  claimedRunIds: string[];
  slots: Record<string, string | null>;
}

export function readSharedCamp(): SharedCamp | null {
  const raw = localStorage.getItem(SHARED_CAMP_KEY);
  if (raw === null) return null;
  const value = JSON.parse(raw) as SharedCamp;
  const envelope = RunManager.createEnvelope('validation');
  envelope.profile = value.profile;
  envelope.claimedRunIds = value.claimedRunIds;
  if (value.version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 || !value.slots || typeof value.slots !== 'object'
    || !Object.values(value.slots).every(slot => slot === null || typeof slot === 'string')
    || !validateSaveEnvelope(envelope).ok) throw new Error('共享营地数据损坏，请保留存档并恢复备份。');
  if (value.profile.completedBasicVictories === undefined) {
    const recoveredIds = new Set<string>();
    for (const rawSlot of Object.values(value.slots)) {
      if (rawSlot === null) continue;
      try {
        const checked = validateSaveEnvelope(JSON.parse(rawSlot));
        if (!checked.ok) continue;
        const slot = checked.value;
        for (const record of [...slot.recentRuns,...slot.pendingSettlement ? [slot.pendingSettlement] : []]) {
          if (record.outcome === 'victory' && record.rulesVersion === 2 && record.finalFloor === 25 && record.completedObjectives === 50 && value.claimedRunIds.includes(record.runId)) recoveredIds.add(record.runId);
        }
      } catch { /* Invalid adventure records never grant qualification; shared profile remains usable. */ }
    }
    value.profile.completedBasicVictories = recoveredIds.size;
  }
  return value;
}

/** One-time migration: merge independent profiles, deduplicate copies of the same profile. */
export function migrateSharedCamp(envelopes: SaveEnvelopeV3[]): SharedCamp {
  const profile = RunManager.createEnvelope('shared-camp').profile;
  const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];
  const claims: string[] = [];
  const balances = new Map<string, number>();
  const victories = new Map<string, number>();
  for (const envelope of envelopes) {
    const old = envelope.profile;
    victories.set(old.profileId, Math.max(victories.get(old.profileId) ?? 0,completedBasicVictoryCount(envelope)));
    balances.set(old.profileId, Math.max(balances.get(old.profileId) ?? 0,
      old.availableMetaPoints * 100 + old.researchXp));
    profile.unlockedNodes = union(profile.unlockedNodes, old.unlockedNodes);
    profile.unlockedMapPools = union(profile.unlockedMapPools, old.unlockedMapPools);
    profile.claimedChallengeIds = union(profile.claimedChallengeIds, old.claimedChallengeIds);
    profile.discoveredRelics = union(profile.discoveredRelics ?? [],old.discoveredRelics ?? []);
    for (const [key, value] of Object.entries(old.mastery)) profile.mastery[key] = Math.max(profile.mastery[key] ?? 0, value);
    Object.assign(profile.codex, old.codex);
    if (old.rewardPreference) profile.rewardPreference = old.rewardPreference;
    claims.push(...envelope.claimedRunIds);
  }
  const balance = [...balances.values()].reduce((total, value) => total + value, 0);
  profile.availableMetaPoints = Math.floor(balance / 100);
  profile.researchXp = balance % 100;
  profile.completedBasicVictories = [...victories.values()].reduce((total,value)=>total+value,0);
  return { version: 1, revision: 0, profile, claimedRunIds: [...new Set(claims)], slots: {} };
}

export function useSharedCamp(envelope: SaveEnvelopeV3, camp: SharedCamp): void {
  envelope.sharedCampRevision = camp.revision;
  envelope.profile = cloneData(camp.profile);
  envelope.claimedRunIds = [...camp.claimedRunIds];
}
