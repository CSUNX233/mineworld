import { deathReaperDefinition } from '../data/DeathReaperItems';
import { validDeathReaperState } from '../items/DeathReaper';
import { validAggression } from './AdaptiveAggression';
import { validSanctumState } from '../monsters/SanctumController';
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
import { BUILD_BRANCH_IDS, validPermanentMetaPath } from '../progression/MetaProgression';
import { validateSnapshot as validSummonSnapshot } from '../summons/validation';
import { CRAFTING_TAGS } from '../items/CraftingTags';

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

const validPreference = (value: unknown): boolean => value === undefined
  || ['vanguard', 'arcanist', 'summoner'].includes(value as string);
const validEquipmentRulesVersion = (value: unknown): boolean => value === undefined || value === 1 || value === 2;
const validSetPreference = (value: unknown): boolean => value === undefined
  || CRAFTING_TAGS.some(tag => tag.id === value);

function validItemCraftingFields(value: unknown): boolean {
  // Existing legacy validation does not validate the full item shape. Keep that
  // boundary and validate only P5 fields when an item record supplies them.
  if (!isRecord(value)) return true;
  return (value.contentId === undefined || isNonEmptyString(value.contentId))
    && validEquipmentRulesVersion(value.equipmentRulesVersion)
    && (value.reforgeCount === undefined || (isNonNegativeInteger(value.reforgeCount) && value.reforgeCount <= 3));
}

function validSetState(value: unknown): boolean {
  if (!isRecord(value) || value.version !== 1 || !isNonNegativeNumber(value.time)) return false;
  return ['meters', 'cooldowns', 'budgets'].every(field => isRecord(value[field])
    && Object.keys(value[field]).length <= 100
    && Object.values(value[field]).every(entry => isNonNegativeNumber(entry) && entry <= 1e9));
}

function validP5SnapshotFields(value: Record<string, unknown>): boolean {
  if (value.shopMaterialPurchases !== undefined && (!isStringArray(value.shopMaterialPurchases)
    || value.shopMaterialPurchases.length > 256)) return false;
  if (!validEquipmentRulesVersion(value.equipmentRulesVersion)
    || !validSetPreference(value.setPreference)
    || (value.craftingSequence !== undefined && (!Number.isSafeInteger(value.craftingSequence) || (value.craftingSequence as number) < 0))) return false;
  if (isRecord(value.runtime) && value.runtime.setState !== undefined && !validSetState(value.runtime.setState)) return false;
  if (Array.isArray(value.inventory) && !value.inventory.every(validItemCraftingFields)) return false;
  if (isRecord(value.equipment) && !Object.values(value.equipment).every(validItemCraftingFields)) return false;
  if (Array.isArray(value.shopStock) && value.shopStock.some(entry => isRecord(entry) && !validItemCraftingFields(entry.item))) return false;
  return true;
}
const validBranches = (value: unknown): boolean => value === undefined
  || (isStringArray(value) && hasUniqueEntries(value)
    && value.every(id => (BUILD_BRANCH_IDS as readonly string[]).includes(id)));
const validBuildUsage = (value: unknown): boolean => value === undefined || (isRecord(value)
  && Object.entries(value).every(([id, entry]) => (BUILD_BRANCH_IDS as readonly string[]).includes(id)
    && isRecord(entry) && Number.isSafeInteger(entry.uses) && (entry.uses as number) >= 0
    && isStringArray(entry.encounterKeys) && entry.encounterKeys.length <= 500
    && hasUniqueEntries(entry.encounterKeys) && entry.encounterKeys.every(key => key.length > 0 && key.length <= 128)));

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
  if (!validP5SnapshotFields(value)) return { ok: false, error: 'Save has invalid equipment crafting or set runtime data' };
  return { ok: true, value: value as unknown as SaveData };
}

function validateProfile(value: unknown): value is ProfileData {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.profileId)
    && isNonNegativeInteger(value.researchXp)
    && value.researchXp < 100
    && isNonNegativeInteger(value.availableMetaPoints)
    && (value.completedBasicVictories === undefined || (Number.isSafeInteger(value.completedBasicVictories) && (value.completedBasicVictories as number) >= 0))
    && (value.discoveredRelics === undefined || (isStringArray(value.discoveredRelics) && hasUniqueEntries(value.discoveredRelics)
      && value.discoveredRelics.length <= 256 && value.discoveredRelics.every(id=>id.length>0&&id.length<=128)))
    && isStringArray(value.unlockedNodes)
    && hasUniqueEntries(value.unlockedNodes)
    && validPermanentMetaPath(value.unlockedNodes)
    && isStringArray(value.unlockedMapPools)
    && hasUniqueEntries(value.unlockedMapPools)
    && isNumericRecord(value.mastery)
    && validPreference(value.rewardPreference)
    && (value.rewardPreference === undefined || value.unlockedNodes.includes(`${value.rewardPreference}_mastery`))
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
    && validBranches(value.masteredBranches)
    && Array.isArray(value.investments)
    && value.investments.every(validateInvestment);
}

function validateActiveSnapshot(value: unknown, runSeed: unknown): value is SaveData {
  const legacy = validateLegacySaveData(value);
  if (!legacy.ok) return false;
  const snapshot = legacy.value;
  const player = snapshot.player;
  const runtime: unknown = snapshot.runtime;
  if (snapshot.runtime?.relicDrops !== undefined && (!Array.isArray(snapshot.runtime.relicDrops)
    || snapshot.runtime.relicDrops.length > 40 || snapshot.runtime.relicDrops.some(drop => !isRecord(drop)
      || !isNonNegativeNumber(drop.x) || !isNonNegativeNumber(drop.z) || drop.x > 1024 || drop.z > 1024
      || !isRecord(drop.item) || drop.item.rarity!=='mythic' || !isNonEmptyString(drop.item.id)
      || !isNonEmptyString(drop.item.name) || !isNonEmptyString(drop.item.contentId)
      || deathReaperDefinition(drop.item.contentId)?.slot!==drop.item.slot
      || !isNumericRecord(drop.item.baseStats) || !Array.isArray(drop.item.affixes)
      || !drop.item.affixes.every(a=>isRecord(a)&&isNonEmptyString(a.id)&&isNonEmptyString(a.name)&&isNumericRecord(a.values))))) return false;
  if (snapshot.runtime?.deathReaper !== undefined && !validDeathReaperState(snapshot.runtime.deathReaper)) return false;
  if (snapshot.runtime?.aggression !== undefined && !validAggression(snapshot.runtime.aggression)) return false;
  if (snapshot.runtime?.summonSquad !== undefined && !validSummonSnapshot(snapshot.runtime.summonSquad)) return false;
  if (runtime !== undefined && (!isRecord(runtime)
    || !['elapsed', 'shield', 'invulnerable', 'attackTimer', 'comboCount', 'comboTimer', 'lowHealthShieldCooldown']
      .every(field => isNonNegativeNumber(runtime[field]))
    || !isNumericRecord(runtime.skillCooldowns))) return false;
  if (snapshot.mapGenerationVersion !== undefined && ![1,2,3,4,5,6].includes(snapshot.mapGenerationVersion)) return false;
  if (snapshot.runtime?.usedRituals !== undefined && (!Array.isArray(snapshot.runtime.usedRituals) || snapshot.runtime.usedRituals.length > 8 || snapshot.runtime.usedRituals.some(id => typeof id !== 'string'))) return false;
  if (snapshot.runtime?.oathGatekeeper !== undefined) {
    const boss = snapshot.runtime.oathGatekeeper;
    if (!isRecord(boss) || ![1, 2].includes(boss.phase) || !isFiniteNumber(boss.angle)
      || !isNonNegativeNumber(boss.cycle) || !isFiniteNumber(boss.cooldown) || typeof boss.reinforcementUsed !== 'boolean') return false;
  }
  if (snapshot.runtime?.brokenFoundryPanels !== undefined && (!Array.isArray(snapshot.runtime.brokenFoundryPanels) || snapshot.runtime.brokenFoundryPanels.length > 8 || snapshot.runtime.brokenFoundryPanels.some(id => typeof id !== 'string'))) return false;
  if (snapshot.runtime?.foundryTrialClaimed !== undefined && typeof snapshot.runtime.foundryTrialClaimed !== 'boolean') return false;
  if (snapshot.mapLayoutKind !== undefined && typeof snapshot.mapLayoutKind !== 'string') return false;
  if (snapshot.runtime?.foundryBoss !== undefined && !validFoundryBoss(snapshot.runtime.foundryBoss)) return false;
  if (snapshot.runtime?.finalBoss !== undefined && !validFinalBoss(snapshot.runtime.finalBoss)) return false;
  if (snapshot.runtime?.shieldRechargeElapsed !== undefined && !isNonNegativeNumber(snapshot.runtime.shieldRechargeElapsed)) return false;
  if (snapshot.runTalents !== undefined && !isValidRunTalentState(snapshot.runTalents)) return false;
  if (snapshot.monsters !== undefined && (!Array.isArray(snapshot.monsters) || snapshot.monsters.some(monster => !isRecord(monster) || (monster.mechanicState !== undefined && !validMechanicState(monster.mechanicState))))) return false;
  if (snapshot.monsters?.some(monster => (monster.pressureXp !== undefined && !isNonNegativeInteger(monster.pressureXp))
    || (monster.pressureLoot !== undefined && typeof monster.pressureLoot !== 'boolean'))) return false;
  if (snapshot.monsters?.some(monster => monster.difficultyStatMultiplier !== undefined && (!isFiniteNumber(monster.difficultyStatMultiplier) || monster.difficultyStatMultiplier <= 0 || monster.difficultyStatMultiplier > 10))) return false;
  if (snapshot.monsters?.some(monster => (monster.sanctumState !== undefined && !validSanctumState(monster.sanctumState))
    || (monster.chapterReinforcement !== undefined && typeof monster.chapterReinforcement !== 'boolean'))) return false;
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
    && validEquipmentRulesVersion(value.equipmentRulesVersion)
    && validSetPreference(value.setPreference)
    && (value.p5StarterGranted === undefined || typeof value.p5StarterGranted === 'boolean')
    && validPreference(value.rewardPreference)
    && validBuildUsage(value.buildUsage)
    && isFiniteNumber(value.seed)
    && (value.archetype === 'vanguard' || value.archetype === 'arcanist' || value.archetype === 'summoner')
    && isStringArray(value.unlockedNodesAtStart)
    && hasUniqueEntries(value.unlockedNodesAtStart)
    && validPermanentMetaPath(value.unlockedNodesAtStart)
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
  if (value.adventureName !== undefined && (typeof value.adventureName !== 'string' || !value.adventureName.trim() || value.adventureName.length > 24)) return {ok:false,error:'Save has an invalid adventure name'};
  if (value.preferredArchetype !== undefined && !['vanguard','arcanist','summoner'].includes(value.preferredArchetype as string)) return {ok:false,error:'Save has an invalid preferred archetype'};
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

function validFoundryBoss(value: unknown): boolean {
  if (!isRecord(value) || !Object.values(value).every(isFiniteNumber)) return false;
  return [1,2,3].includes(value.phase as number)
    && ['cooldown','stagger','exposed','attackTimer','attackDuration','attackDamage','pillar1Cooldown','pillar2Cooldown','pillar3Cooldown'].every(key=>isNonNegativeNumber(value[key]))
    && isNonNegativeInteger(value.cycle)
    && Number.isInteger(value.attackKind) && (value.attackKind as number)>=0 && (value.attackKind as number)<=8
    && [0,1].includes(value.reinforcementUsed as number);
}
