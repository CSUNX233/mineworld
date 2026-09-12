import { BASIC_RUN_DEFINITION } from '../data/runProgression';
import { archetypeAllowed } from '../progression/MetaProgression';
import { BUILD_BRANCH_IDS } from '../progression/MetaProgression';
import { settleRun } from '../progression/Settlement';
import type {
  ArchetypeId,
  EncounterInvestment,
  InvestmentSample,
  RunOutcome,
  RunState,
  SaveEnvelopeV3,
} from '../progression/types';

function copySample(sample: InvestmentSample): InvestmentSample {
  return {
    level: sample.level,
    equipmentLevelTotal: sample.equipmentLevelTotal,
    upgradeCount: sample.upgradeCount,
  };
}

function sampleIsHigher(candidate: InvestmentSample, peak: InvestmentSample): boolean {
  if (candidate.equipmentLevelTotal !== peak.equipmentLevelTotal) {
    return candidate.equipmentLevelTotal > peak.equipmentLevelTotal;
  }
  return candidate.upgradeCount > peak.upgradeCount;
}

function investmentFor(run: RunState, id: string, sample: InvestmentSample): EncounterInvestment {
  let investment = run.investments.find((entry) => entry.id === id);
  if (!investment) {
    investment = { id, peak: copySample(sample), completed: false };
    run.investments.push(investment);
  }
  return investment;
}

export class RunManager {
  static createEnvelope(profileId: string): SaveEnvelopeV3 {
    return {
      version: 3,
      revision: 0,
      profile: {
        profileId,
        researchXp: 0,
        availableMetaPoints: 0,
        unlockedNodes: ['vanguard'],
        unlockedMapPools: ['basic'],
        mastery: {},
        codex: {},
        claimedChallengeIds: [],
      },
      activeRun: null,
      pendingSettlement: null,
      claimedRunIds: [],
      recentRuns: [],
    };
  }

  static startRun(
    envelope: SaveEnvelopeV3,
    runId: string,
    seed: number,
    archetype: ArchetypeId,
    now: number,
  ): SaveEnvelopeV3 {
    if (envelope.activeRun) throw new Error('A run is already active.');
    if (envelope.pendingSettlement) throw new Error('A settlement is awaiting acknowledgement.');
    if (envelope.claimedRunIds.includes(runId)) throw new Error(`Run id was already claimed: ${runId}`);
    if (!archetypeAllowed(envelope.profile, archetype)) {
      throw new Error(`Archetype is not unlocked: ${archetype}`);
    }

    const next = structuredClone(envelope);
    next.revision += 1;
    next.activeRun = {
      equipmentRulesVersion: 2,
      runId,
      runDefinitionId: BASIC_RUN_DEFINITION.id,
      mapPoolId: BASIC_RUN_DEFINITION.mapPoolId,
      rulesVersion: BASIC_RUN_DEFINITION.rulesVersion,
      seed,
      archetype,
      rewardPreference: next.profile.rewardPreference ?? archetype,
      unlockedNodesAtStart: [...next.profile.unlockedNodes],
      startedAt: now,
      snapshot: null,
      completedObjectives: [],
      investments: [],
      maxLevel: 1,
      upgradeCount: 0,
      buildUsage: {},
    };
    return next;
  }

  static recordBuildUse(run: RunState, branchId: string, encounterKey: string): void {
    if (!(BUILD_BRANCH_IDS as readonly string[]).includes(branchId)) {
      throw new Error(`Unknown build branch: ${branchId}`);
    }
    if (typeof encounterKey !== 'string') {
      throw new Error('Encounter key must be a string.');
    }
    const normalizedEncounterKey = encounterKey.trim();
    if (!normalizedEncounterKey || normalizedEncounterKey.length > 128) {
      throw new Error('Encounter key must be a non-empty string of at most 128 characters.');
    }

    const typedBranchId = branchId as typeof BUILD_BRANCH_IDS[number];
    run.buildUsage ??= {};
    const usage = run.buildUsage[typedBranchId] ?? { uses: 0, encounterKeys: [] };
    if (!Number.isSafeInteger(usage.uses) || usage.uses < 0 || !Array.isArray(usage.encounterKeys)) {
      throw new Error(`Invalid build usage state: ${branchId}`);
    }
    usage.uses += 1;
    if (!usage.encounterKeys.includes(normalizedEncounterKey)) {
      usage.encounterKeys.push(normalizedEncounterKey);
    }
    run.buildUsage[typedBranchId] = usage;
  }

  static observe(run: RunState, sample: InvestmentSample, encounterIds: string[]): void {
    run.maxLevel = Math.max(run.maxLevel, sample.level);
    run.upgradeCount = Math.max(run.upgradeCount, sample.upgradeCount);

    for (const encounterId of new Set(encounterIds)) {
      const investment = investmentFor(run, encounterId, sample);
      if (investment.completed) continue;
      if (sampleIsHigher(sample, investment.peak)) investment.peak = copySample(sample);
    }
  }

  static completeObjective(run: RunState, id: string, sample: InvestmentSample): boolean {
    if (run.completedObjectives.includes(id)) return false;

    RunManager.observe(run, sample, [id]);
    run.completedObjectives.push(id);
    const investment = investmentFor(run, id, sample);
    investment.completed = true;
    investment.checkpoint = copySample(sample);
    return true;
  }

  static finish(
    envelope: SaveEnvelopeV3,
    outcome: RunOutcome,
    now: number,
  ): SaveEnvelopeV3 {
    const run = envelope.activeRun;
    if (envelope.pendingSettlement) return envelope;
    if (!run) return envelope;
    if (envelope.claimedRunIds.includes(run.runId)) return envelope;

    const settlement = settleRun(run, outcome, now, envelope.profile.researchXp);
    const next = structuredClone(envelope);
    const record = structuredClone(settlement.record);
    next.revision += 1;
    next.profile.researchXp = settlement.researchXp;
    next.profile.availableMetaPoints += settlement.pointsEarned;
    for (const branchId of record.masteredBranches ?? []) {
      if (!(next.profile.mastery[branchId] > 0)) next.profile.mastery[branchId] = 1;
    }
    next.activeRun = null;
    next.pendingSettlement = record;
    next.claimedRunIds = [...new Set([...next.claimedRunIds, run.runId])];
    next.recentRuns = [structuredClone(record), ...next.recentRuns].slice(0, 20);
    return next;
  }

  static acknowledge(envelope: SaveEnvelopeV3): SaveEnvelopeV3 {
    if (!envelope.pendingSettlement) return envelope;
    const next = structuredClone(envelope);
    next.revision += 1;
    next.pendingSettlement = null;
    return next;
  }
}
