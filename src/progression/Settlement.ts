import { cloneData } from '../utils/cloneData';
import {
  BASIC_RUN_DEFINITION,
  REQUIRED_OBJECTIVE_IDS,
  RUN_REWARDS,
  researchXpForFloor,
} from '../data/runProgression';
import { XP_PER_POINT } from './MetaProgression';
import {
  BUILD_BRANCH_IDS,
  MASTERY_ENCOUNTER_REQUIREMENT,
  MASTERY_USE_REQUIREMENT,
} from './MetaProgression';
import type { BuildBranchId, EncounterInvestment, RunOutcome, RunState, SettlementRecord } from './types';

function requiredObjectiveCount(run: RunState): number {
  const completed = new Set(run.completedObjectives);
  return REQUIRED_OBJECTIVE_IDS.reduce(
    (count, objectiveId) => count + Number(completed.has(objectiveId)),
    0,
  );
}

const EXTRACTION_FLOORS = [5, 10, 15, 20] as const;
type ExtractionFloor = typeof EXTRACTION_FLOORS[number];

function isExtractionFloor(floor: number): floor is ExtractionFloor {
  return EXTRACTION_FLOORS.some((checkpoint) => checkpoint === floor);
}

export function canExtract(run: RunState): boolean {
  const floor = run.snapshot?.floor;
  if (typeof floor !== 'number' || !Number.isInteger(floor) || !isExtractionFloor(floor)) return false;

  const completed = new Set(run.completedObjectives);
  return REQUIRED_OBJECTIVE_IDS.every((objectiveId) => {
    const objectiveFloor = Number(objectiveId.slice(0, objectiveId.indexOf('-')));
    return objectiveFloor > floor || completed.has(objectiveId);
  });
}

export function extractionResearchXp(run: RunState): number {
  if (!canExtract(run)) return 0;
  return RUN_REWARDS.extractionResearchXpByFloor[run.snapshot!.floor as ExtractionFloor];
}

function finalFloor(run: RunState, outcome: RunOutcome): number {
  if (outcome === 'victory') return BASIC_RUN_DEFINITION.floorCount;
  if (Number.isFinite(run.snapshot?.floor)) {
    return Math.max(1, Math.min(BASIC_RUN_DEFINITION.floorCount, Math.floor(run.snapshot!.floor)));
  }
  let deepestFloor = 1;
  for (const id of run.completedObjectives) {
    const match = /^(\d+)-room-(?:1|4)$/.exec(id);
    if (match) deepestFloor = Math.max(deepestFloor, Number(match[1]));
  }
  return Math.min(BASIC_RUN_DEFINITION.floorCount, deepestFloor);
}

export function hasVictoryObjectives(run: RunState): boolean {
  return requiredObjectiveCount(run) === REQUIRED_OBJECTIVE_IDS.length;
}

export interface SettlementCalculation {
  record: SettlementRecord;
  researchXp: number;
  pointsEarned: number;
}

export function masteredBranchesForRun(run: RunState, outcome: RunOutcome): BuildBranchId[] {
  if (outcome !== 'victory') return [];
  return BUILD_BRANCH_IDS.filter((branchId) => {
    const usage = run.buildUsage?.[branchId];
    return !!usage
      && usage.uses >= MASTERY_USE_REQUIREMENT
      && new Set(usage.encounterKeys).size >= MASTERY_ENCOUNTER_REQUIREMENT;
  });
}

export function settleRun(
  run: RunState,
  outcome: RunOutcome,
  finishedAt: number,
  currentResearchXp: number,
): SettlementCalculation {
  if (outcome === 'victory' && !hasVictoryObjectives(run)) {
    throw new Error('Victory requires all required objectives.');
  }
  if (outcome === 'extracted' && !canExtract(run)) {
    throw new Error('Extraction requires a completed boss-floor checkpoint.');
  }

  const completedObjectives = requiredObjectiveCount(run);
  const baseXp = outcome === 'victory'
    ? RUN_REWARDS.victoryResearchXp
    : outcome === 'extracted'
      ? extractionResearchXp(run)
    : outcome === 'death'
      ? researchXpForFloor(finalFloor(run, outcome))
      : 0;
  const totalXp = baseXp;
  const xpPool = Math.max(0, Math.floor(currentResearchXp)) + totalXp;
  const pointsEarned = Math.floor(xpPool / XP_PER_POINT);
  const investments: EncounterInvestment[] = cloneData(run.investments);

  return {
    researchXp: xpPool % XP_PER_POINT,
    pointsEarned,
    record: {
      runId: run.runId,
      outcome,
      rulesVersion: BASIC_RUN_DEFINITION.rulesVersion,
      archetype: run.archetype,
      finishedAt,
      finalFloor: finalFloor(run, outcome),
      finalLevel: run.maxLevel,
      completedObjectives,
      baseXp,
      challengeXp: 0,
      growthXp: 0,
      masteryXp: 0,
      totalXp,
      pointsEarned,
      investments,
      maxLevel: run.maxLevel,
      upgradeCount: run.upgradeCount,
      masteredBranches: masteredBranchesForRun(run, outcome),
    },
  };
}
