import { isValidRunTalentState, spentTalentPoints, talentBudget } from '../progression/RunTalents';
import type {
  EncounterInvestment,
  ProfileData,
  RunState,
  SaveEnvelopeV3,
  SettlementRecord,
} from '../progression/types';
import type { SaveData } from '../types';
import { BASIC_RUN_DEFINITION } from '../data/runProgression';

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isNonNegativeNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0;

const isNonNegativeInteger = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const hasUniqueEntries = (values: string[]): boolean => new Set(values).size === values.length;

const isNumericRecord = (value: unknown): value is Record<string, number> =>
  isRecord(value) && Object.values(value).every(isNonNegativeNumber);

export function validateLegacySaveData(value: unknown): ValidationResult<SaveData> {
  if (!isRecord(value)) return { ok: false, error: 'Save payload must be an object' };
  if (value.version !== 1 && value.version !== 2) {
    return { ok: false, error: 'Unsupported save version' };
  }
  if (!isFiniteNumber(value.floor) || !isFiniteNumber(value.seed)) {
    return { ok: false, error: 'Legacy save is missing its floor or seed' };
  }
  if (!isRecord(value.player) || !isFiniteNumber(value.player.level)) {
    return { ok: false, error: 'Legacy save is missing player data' };
  }
  if (!Array.isArray(value.inventory) || !isRecord(value.equipment)) {
    return { ok: false, error: 'Legacy save is missing inventory data' };
  }
  return { ok: true, value: value as unknown as SaveData };
}

function validateProfile(value: unknown): value is ProfileData {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.profileId)
    && isNonNegativeInteger(value.researchXp)
    && value.researchXp < 100
    && isNonNegativeInteger(value.availableMetaPoints)
    && isStringArray(value.unlockedNodes)
    && hasUniqueEntries(value.unlockedNodes)
    && isStringArray(value.unlockedMapPools)
    && hasUniqueEntries(value.unlockedMapPools)
    && isNumericRecord(value.mastery)
    && isRecord(value.codex)
    && isStringArray(value.claimedChallengeIds)
    && hasUniqueEntries(value.claimedChallengeIds);
}

function validateInvestment(value: unknown): value is EncounterInvestment {
  if (!isRecord(value) || !isNonEmptyString(value.id) || typeof value.completed !== 'boolean') return false;
  const validSample = (sample: unknown): boolean => isRecord(sample)
    && isNonNegativeNumber(sample.level)
    && isNonNegativeNumber(sample.equipmentLevelTotal)
    && isNonNegativeNumber(sample.upgradeCount);
  return validSample(value.peak)
    && (value.checkpoint === undefined || validSample(value.checkpoint))
    && (!value.completed || validSample(value.checkpoint));
}

function validateSettlement(value: unknown): value is SettlementRecord {
  if (!isRecord(value)) return false;
  const numericFields = [
    'finishedAt', 'finalFloor', 'finalLevel', 'completedObjectives', 'baseXp',
    'challengeXp', 'growthXp', 'masteryXp', 'totalXp', 'pointsEarned',
    'maxLevel', 'upgradeCount',
  ];
  return isNonEmptyString(value.runId)
    && (value.outcome === 'victory' || value.outcome === 'extracted'
      || value.outcome === 'death' || value.outcome === 'abandoned')
    && (value.rulesVersion === 1 || value.rulesVersion === 2)
    && (value.archetype === 'vanguard' || value.archetype === 'arcanist' || value.archetype === 'summoner')
    && numericFields.every((field) => isNonNegativeNumber(value[field]))
    && Array.isArray(value.investments)
    && value.investments.every(validateInvestment);
}

function validateActiveSnapshot(value: unknown, runSeed: unknown): value is SaveData {
  const legacy = validateLegacySaveData(value);
  if (!legacy.ok) return false;
  const snapshot = legacy.value;
  const player = snapshot.player;
  const runtime: unknown = snapshot.runtime;
  if (runtime !== undefined && (!isRecord(runtime)
    || !['elapsed', 'shield', 'invulnerable', 'attackTimer', 'comboCount', 'comboTimer', 'lowHealthShieldCooldown']
      .every(field => isNonNegativeNumber(runtime[field]))
    || !isNumericRecord(runtime.skillCooldowns))) return false;
  if (snapshot.mapGenerationVersion !== undefined && snapshot.mapGenerationVersion !== 1 && snapshot.mapGenerationVersion !== 2) return false;
  if (snapshot.mapLayoutKind !== undefined && typeof snapshot.mapLayoutKind !== 'string') return false;
  if (snapshot.runtime?.finalBoss !== undefined && !validFinalBoss(snapshot.runtime.finalBoss)) return false;
  if (snapshot.runtime?.shieldRechargeElapsed !== undefined && !isNonNegativeNumber(snapshot.runtime.shieldRechargeElapsed)) return false;
  if (snapshot.runTalents !== undefined && !isValidRunTalentState(snapshot.runTalents)) return false;
  if (snapshot.monsters !== undefined && (!Array.isArray(snapshot.monsters) || snapshot.monsters.some(monster => !isRecord(monster) || (monster.mechanicState !== undefined && !validMechanicState(monster.mechanicState))))) return false;
  if (snapshot.monsters?.some(monster => monster.statuses !== undefined && (!Array.isArray(monster.statuses) || monster.statuses.some(status =>
    !isRecord(status) || !['burning', 'frozen', 'shocked', 'poisoned', 'bleeding'].includes(status.type)
    || (status.sourceElement !== undefined && !['physical', 'fire', 'frost', 'lightning', 'poison', 'shadow'].includes(status.sourceElement))
    || !isNonNegativeNumber(status.duration) || !isNonNegativeNumber(status.maxDuration) || !isNonNegativeNumber(status.damagePerTick))))) return false;
  return snapshot.seed === runSeed
    && Number.isInteger(snapshot.floor)
    && snapshot.floor >= 1
    && snapshot.floor <= BASIC_RUN_DEFINITION.floorCount
    && isRecord(player.stats)
    && Object.values(player.stats).every(isFiniteNumber)
    && isRecord(player.position)
    && isFiniteNumber(player.position.x)
    && isFiniteNumber(player.position.y)
    && isFiniteNumber(player.position.z)
    && isNonNegativeNumber(player.level)
    && isNonNegativeNumber(player.xp)
    && isNonNegativeNumber(player.xpToNext)
    && isNonNegativeNumber(player.attributePoints)
    && isNonNegativeNumber(player.health)
    && isNonNegativeNumber(player.mana)
    && isNonNegativeNumber(snapshot.gold)
    && isNonNegativeNumber(snapshot.materials)
    && isNonNegativeNumber(snapshot.kills);
}

function validMechanicState(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.role === 'guardian') return isNonNegativeNumber(value.recovery);
  if (value.role !== 'support' && value.role !== 'controller') return false;
  return isNonNegativeNumber(value.cooldown)
    && (value.interruptedCast === undefined || typeof value.interruptedCast === 'boolean')
    && (value.role !== 'support' || (isNonNegativeNumber(value.healsRemaining) && Number.isInteger(value.healsRemaining) && value.healsRemaining <= 3));
}

function validateRun(value: unknown): value is RunState {
  if (!isRecord(value)) return false;
  const snapshotIsValid = value.snapshot === null || validateActiveSnapshot(value.snapshot, value.seed);
  return isNonEmptyString(value.runId)
    && value.runDefinitionId === BASIC_RUN_DEFINITION.id
    && value.mapPoolId === 'basic'
    && value.rulesVersion === BASIC_RUN_DEFINITION.rulesVersion
    && isFiniteNumber(value.seed)
    && (value.archetype === 'vanguard' || value.archetype === 'arcanist' || value.archetype === 'summoner')
    && isStringArray(value.unlockedNodesAtStart)
    && hasUniqueEntries(value.unlockedNodesAtStart)
    && isNonNegativeNumber(value.startedAt)
    && snapshotIsValid
    && isStringArray(value.completedObjectives)
    && hasUniqueEntries(value.completedObjectives)
    && (value.snapshot === null || !(value.snapshot as SaveData).runTalents
      || spentTalentPoints((value.snapshot as SaveData).runTalents!) <= talentBudget((value.snapshot as SaveData).player.level, value.completedObjectives))
    && Array.isArray(value.investments)
    && value.investments.every(validateInvestment)
    && isNonNegativeNumber(value.maxLevel)
    && isNonNegativeNumber(value.upgradeCount);
}

export function validateSaveEnvelope(value: unknown): ValidationResult<SaveEnvelopeV3> {
  if (!isRecord(value)) return { ok: false, error: 'Save envelope must be an object' };
  if (value.version !== 3) return { ok: false, error: 'Unsupported save envelope version' };
  if (!Number.isInteger(value.revision) || (value.revision as number) < 0) {
    return { ok: false, error: 'Save envelope has an invalid revision' };
  }
  if (!validateProfile(value.profile)) return { ok: false, error: 'Save envelope has an invalid profile' };
  if (!isStringArray(value.claimedRunIds) || !hasUniqueEntries(value.claimedRunIds)) {
    return { ok: false, error: 'Save envelope has invalid claimed run ids' };
  }
  if (!Array.isArray(value.recentRuns) || !value.recentRuns.every(validateSettlement)) {
    return { ok: false, error: 'Save envelope has invalid recent runs' };
  }
  const recentIds = value.recentRuns.map((run) => run.runId);
  if (!hasUniqueEntries(recentIds)) return { ok: false, error: 'Recent run ids must be unique' };

  if (value.activeRun !== null && !validateRun(value.activeRun)) {
    return { ok: false, error: 'Save envelope has an invalid active run' };
  }
  if (value.pendingSettlement !== null && !validateSettlement(value.pendingSettlement)) {
    return { ok: false, error: 'Save envelope has an invalid pending settlement' };
  }
  if (value.activeRun !== null && value.pendingSettlement !== null) {
    return { ok: false, error: 'An active run and pending settlement cannot coexist' };
  }
  if (value.activeRun !== null
    && (value.claimedRunIds.includes(value.activeRun.runId) || recentIds.includes(value.activeRun.runId))) {
    return { ok: false, error: 'Active run id must be unique' };
  }
  if (value.pendingSettlement !== null && !value.claimedRunIds.includes(value.pendingSettlement.runId)) {
    return { ok: false, error: 'Pending settlement must already be claimed' };
  }

  if (value.legacyArchive !== undefined) {
    if (!isRecord(value.legacyArchive)
      || !isNonNegativeNumber(value.legacyArchive.importedAt)
      || (value.legacyArchive.sourceVersion !== 1 && value.legacyArchive.sourceVersion !== 2)
      || !validateLegacySaveData(value.legacyArchive.snapshot).ok) {
      return { ok: false, error: 'Save envelope has an invalid legacy archive' };
    }
  }

  return { ok: true, value: value as unknown as SaveEnvelopeV3 };
}

function validFinalBoss(value: unknown): boolean {
  if (!isRecord(value) || ![1, 2, 3].includes(value.phase as number)
    || !isNonNegativeNumber(value.cooldown) || !isNonNegativeNumber(value.recovery)
    || !isNonNegativeInteger(value.cycle) || !Array.isArray(value.warnings) || value.warnings.length > 4) return false;
  return value.warnings.every(warning => isRecord(warning) && ['blast', 'sweep', 'reinforcement'].includes(warning.kind as string)
    && ['x', 'z', 'dx', 'dz'].every(field => isFiniteNumber(warning[field]))
    && ['remaining', 'duration', 'radius', 'damage'].every(field => isNonNegativeNumber(warning[field]))
    && (warning.duration as number) > 0);
}
