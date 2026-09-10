import type { SaveData } from '../types';

export type ArchetypeId = 'vanguard' | 'arcanist' | 'summoner';
export type RunOutcome = 'victory' | 'extracted' | 'death' | 'abandoned';
export interface InvestmentSample {
  level: number;
  equipmentLevelTotal: number;
  upgradeCount: number;
}
export interface EncounterInvestment {
  id: string;
  peak: InvestmentSample;
  completed: boolean;
  checkpoint?: InvestmentSample;
}
export interface ProfileData {
  profileId: string;
  researchXp: number;
  availableMetaPoints: number;
  unlockedNodes: string[];
  unlockedMapPools: string[];
  mastery: Record<string, number>;
  codex: Record<string, unknown>;
  claimedChallengeIds: string[];
}
export interface RunState {
  runId: string;
  runDefinitionId: 'basic-25-floors';
  mapPoolId: 'basic';
  rulesVersion: 2;
  seed: number;
  archetype: ArchetypeId;
  unlockedNodesAtStart: string[];
  startedAt: number;
  snapshot: SaveData | null;
  completedObjectives: string[];
  investments: EncounterInvestment[];
  maxLevel: number;
  upgradeCount: number;
}
export interface SettlementRecord {
  runId: string;
  outcome: RunOutcome;
  rulesVersion: 1 | 2;
  archetype: ArchetypeId;
  finishedAt: number;
  finalFloor: number;
  finalLevel: number;
  completedObjectives: number;
  baseXp: number;
  challengeXp: number;
  growthXp: number;
  masteryXp: number;
  totalXp: number;
  pointsEarned: number;
  investments: EncounterInvestment[];
  maxLevel: number;
  upgradeCount: number;
}
export interface SaveEnvelopeV3 {
  version: 3;
  revision: number;
  profile: ProfileData;
  activeRun: RunState | null;
  pendingSettlement: SettlementRecord | null;
  claimedRunIds: string[];
  recentRuns: SettlementRecord[];
  legacyArchive?: { importedAt: number; sourceVersion: number; snapshot: SaveData };
}
export type SaveResult = { ok: true } | { ok: false; error: string };
export type SlotReadResult =
  | { kind: 'empty' }
  | { kind: 'ready'; envelope: SaveEnvelopeV3 }
  | { kind: 'legacy'; data: SaveData; sourceVersion: number }
  | { kind: 'invalid'; error: string }
  | { kind: 'error'; error: string };
