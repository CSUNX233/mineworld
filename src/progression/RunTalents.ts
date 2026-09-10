import { RUN_TALENT_BY_ID, RUN_TALENT_DEFS } from '../data/runTalents';
import { BASIC_REQUIRED_ROOM_IDS, requiredObjectiveId } from '../data/runProgression';
import type { Stat, StatMap } from '../types';

export interface RunTalentState {
  version: 1;
  unlocked: string[];
  resetsUsed: number;
}

const LEVEL_POINT_THRESHOLDS = [2, 4, 6, 8, 10] as const;
const BOSS_POINT_FLOORS = [5, 10, 15, 20] as const;

export function createRunTalents(): RunTalentState {
  return { version: 1, unlocked: [], resetsUsed: 0 };
}

export function talentBudget(level: number, completedObjectives: readonly string[]): number {
  const safeLevel = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0;
  let budget = 1;

  for (const threshold of LEVEL_POINT_THRESHOLDS) {
    if (safeLevel >= threshold) budget += 1;
  }

  const completed = new Set(completedObjectives);
  for (const floor of BOSS_POINT_FLOORS) {
    const completedBothMainObjectives = BASIC_REQUIRED_ROOM_IDS.every((roomId) =>
      completed.has(requiredObjectiveId(floor, roomId)),
    );
    if (completedBothMainObjectives) budget += 1;
  }

  return budget;
}

export function spentTalentPoints(state: RunTalentState): number {
  return state.unlocked.reduce((total, id) => total + (RUN_TALENT_BY_ID.get(id)?.cost ?? 0), 0);
}

export function canUnlockTalent(state: RunTalentState, id: string, budget: number): boolean {
  if (!isValidRunTalentState(state) || !Number.isFinite(budget) || budget < 0) return false;
  const talent = RUN_TALENT_BY_ID.get(id);
  if (!talent || state.unlocked.includes(id)) return false;

  const unlocked = new Set(state.unlocked);
  if (talent.requires?.some((requiredId) => !unlocked.has(requiredId))) return false;
  if (talent.excludes?.some((excludedId) => unlocked.has(excludedId))) return false;

  return spentTalentPoints(state) + talent.cost <= Math.floor(budget);
}

export function unlockRunTalent(state: RunTalentState, id: string, budget: number): RunTalentState {
  if (!canUnlockTalent(state, id, budget)) return state;
  return {
    version: 1,
    unlocked: [...state.unlocked, id],
    resetsUsed: state.resetsUsed,
  };
}

export function resetRunTalents(state: RunTalentState): RunTalentState {
  return {
    version: 1,
    unlocked: [],
    resetsUsed: state.resetsUsed + 1,
  };
}

/** First and second resets are free. The third costs 100, then rises by 100. */
export function resetTalentCost(state: RunTalentState): number {
  return state.resetsUsed < 2 ? 0 : 100 * (state.resetsUsed - 1);
}

export function talentStats(state: RunTalentState): StatMap {
  const stats: StatMap = {};
  const seen = new Set<string>();

  for (const id of state.unlocked) {
    if (seen.has(id)) continue;
    seen.add(id);
    const passive = RUN_TALENT_BY_ID.get(id)?.passive;
    if (!passive) continue;
    for (const [stat, value] of Object.entries(passive) as [Stat, number][]) {
      stats[stat] = (stats[stat] ?? 0) + value;
    }
  }

  return stats;
}

export function isValidRunTalentState(value: unknown): value is RunTalentState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || !Array.isArray(candidate.unlocked)) return false;
  if (!Number.isSafeInteger(candidate.resetsUsed) || (candidate.resetsUsed as number) < 0) return false;

  const keys = Object.keys(candidate);
  if (keys.some((key) => key !== 'version' && key !== 'unlocked' && key !== 'resetsUsed')) return false;

  const unlockedIds = candidate.unlocked;
  if (unlockedIds.some((id) => typeof id !== 'string')) return false;
  const unlocked = new Set(unlockedIds as string[]);
  if (unlocked.size !== unlockedIds.length) return false;

  let totalCost = 0;
  for (const id of unlocked) {
    const talent = RUN_TALENT_BY_ID.get(id);
    if (!talent || !Number.isSafeInteger(talent.cost) || talent.cost <= 0) return false;
    totalCost += talent.cost;
    if (!Number.isSafeInteger(totalCost)) return false;
    if (talent.requires?.some((requiredId) => !unlocked.has(requiredId))) return false;
    if (talent.excludes?.some((excludedId) => unlocked.has(excludedId))) return false;
  }

  return true;
}

// Validate the static graph once in development and fail loudly if a future edit
// introduces a missing prerequisite, asymmetric exclusion, or impossible cycle.
function validateTalentDefinitions(): void {
  if (RUN_TALENT_BY_ID.size !== RUN_TALENT_DEFS.length) {
    throw new Error('Run talent ids must be unique.');
  }

  for (const talent of RUN_TALENT_DEFS) {
    if (!Number.isSafeInteger(talent.cost) || talent.cost <= 0) {
      throw new Error(`Run talent ${talent.id} has an invalid cost.`);
    }
    for (const relatedId of [...(talent.requires ?? []), ...(talent.excludes ?? [])]) {
      if (!RUN_TALENT_BY_ID.has(relatedId) || relatedId === talent.id) {
        throw new Error(`Run talent ${talent.id} has an invalid relation: ${relatedId}.`);
      }
    }
    for (const excludedId of talent.excludes ?? []) {
      if (!RUN_TALENT_BY_ID.get(excludedId)?.excludes?.includes(talent.id)) {
        throw new Error(`Run talent exclusions must be symmetric: ${talent.id}/${excludedId}.`);
      }
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Run talent prerequisites contain a cycle at ${id}.`);
    visiting.add(id);
    for (const requiredId of RUN_TALENT_BY_ID.get(id)?.requires ?? []) visit(requiredId);
    visiting.delete(id);
    visited.add(id);
  };
  for (const talent of RUN_TALENT_DEFS) visit(talent.id);
}

validateTalentDefinitions();
