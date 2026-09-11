import type {
  ArchetypeId,
  BuildBranchId,
  ProfileData,
  RewardPreference,
  SaveEnvelopeV3,
} from './types';

export const XP_PER_POINT = 100;

interface ArchetypeMetaNode {
  kind: 'archetype';
  id: ArchetypeId;
  name: string;
  description: string;
  cost: number;
}

export interface MasteryMetaNode {
  kind: 'mastery';
  id: `${ArchetypeId}_mastery`;
  archetype: ArchetypeId;
  name: string;
  description: string;
  cost: number;
  requiresNode: ArchetypeId;
  requiresAnyMastery: readonly BuildBranchId[];
}

export type MetaNode = ArchetypeMetaNode | MasteryMetaNode;

export const BUILD_BRANCH_IDS = [
  'melee_cleave',
  'melee_guard',
  'summon_legion',
  'summon_elite',
  'spreading_flame',
  'consuming_flame',
] as const satisfies readonly BuildBranchId[];

export const BUILD_BRANCH_NAMES: Readonly<Record<BuildBranchId, string>> = {
  melee_cleave: '裂阵近战',
  melee_guard: '坚守近战',
  summon_legion: '军团召唤',
  summon_elite: '精英召唤',
  spreading_flame: '蔓延烈焰',
  consuming_flame: '吞噬烈焰',
};

export const MASTERY_USE_REQUIREMENT = 20;
export const MASTERY_ENCOUNTER_REQUIREMENT = 3;

export const META_NODES: readonly MetaNode[] = [
  {
    kind: 'archetype',
    id: 'vanguard',
    name: '破阵剑术',
    description: '以近战突进与正面压制为核心的独立起步配置。',
    cost: 0,
  },
  {
    kind: 'archetype',
    id: 'arcanist',
    name: '余烬法术',
    description: '以火球、爆燃与范围法术为核心的独立起步配置。',
    cost: 1,
  },
  {
    kind: 'archetype',
    id: 'summoner',
    name: '亡者契约',
    description: '以召唤单位、容量调度与集火指令为核心的独立起步配置。',
    cost: 2,
  },
  {
    kind: 'mastery',
    id: 'vanguard_mastery',
    archetype: 'vanguard',
    name: '破阵掌握',
    description: '开放近战系奖励偏好及明确的近战核心奖励机会。',
    cost: 2,
    requiresNode: 'vanguard',
    requiresAnyMastery: ['melee_cleave', 'melee_guard'],
  },
  {
    kind: 'mastery',
    id: 'arcanist_mastery',
    archetype: 'arcanist',
    name: '余烬掌握',
    description: '开放法术系奖励偏好及明确的火焰核心奖励机会。',
    cost: 2,
    requiresNode: 'arcanist',
    requiresAnyMastery: ['spreading_flame', 'consuming_flame'],
  },
  {
    kind: 'mastery',
    id: 'summoner_mastery',
    archetype: 'summoner',
    name: '契约掌握',
    description: '开放召唤系奖励偏好及明确的召唤核心奖励机会。',
    cost: 2,
    requiresNode: 'summoner',
    requiresAnyMastery: ['summon_legion', 'summon_elite'],
  },
] as const;

export const ARCHETYPE_NODES = META_NODES.filter(
  (node): node is ArchetypeMetaNode => node.kind === 'archetype',
);

export const MASTERY_NODES = META_NODES.filter(
  (node): node is MasteryMetaNode => node.kind === 'mastery',
);

export function archetypeAllowed(profile: ProfileData, id: ArchetypeId): boolean {
  return profile.unlockedNodes.includes(id);
}

export function masteryNodeForPreference(id: RewardPreference): MasteryMetaNode {
  return MASTERY_NODES.find((node) => node.archetype === id)!;
}

export function rewardPreferenceAllowed(profile: ProfileData, id: RewardPreference): boolean {
  return profile.unlockedNodes.includes(masteryNodeForPreference(id).id);
}

function masteryRequirementMet(profile: ProfileData, node: MasteryMetaNode): boolean {
  return node.requiresAnyMastery.some((branchId) => (profile.mastery[branchId] ?? 0) > 0);
}

export function setRewardPreference(envelope: SaveEnvelopeV3, id: string): SaveEnvelopeV3 {
  if (envelope.activeRun || envelope.pendingSettlement) {
    throw new Error('Cannot change reward preference while a run or settlement is active.');
  }
  if (!(BUILD_PREFERENCES as readonly string[]).includes(id)) {
    throw new Error(`Unknown reward preference: ${id}`);
  }
  const preference = id as RewardPreference;
  if (!rewardPreferenceAllowed(envelope.profile, preference)) {
    throw new Error(`Reward preference is not unlocked: ${id}`);
  }
  if (envelope.profile.rewardPreference === preference) return envelope;

  const next = structuredClone(envelope);
  next.revision += 1;
  next.profile.rewardPreference = preference;
  return next;
}

const BUILD_PREFERENCES = ['vanguard', 'arcanist', 'summoner'] as const;

export function unlockNode(envelope: SaveEnvelopeV3, nodeId: string): SaveEnvelopeV3 {
  if (envelope.activeRun || envelope.pendingSettlement) {
    throw new Error('Cannot unlock meta nodes while a run or settlement is active.');
  }

  const node = META_NODES.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`Unknown meta node: ${nodeId}`);
  if (envelope.profile.unlockedNodes.includes(node.id)) {
    throw new Error(`Meta node is already unlocked: ${node.id}`);
  }
  if (envelope.profile.availableMetaPoints < node.cost) {
    throw new Error(`Not enough meta points to unlock: ${node.id}`);
  }
  if (node.kind === 'mastery') {
    if (!envelope.profile.unlockedNodes.includes(node.requiresNode)) {
      throw new Error(`Required archetype is not unlocked: ${node.requiresNode}`);
    }
    if (!masteryRequirementMet(envelope.profile, node)) {
      throw new Error(`Mastery challenge is incomplete: ${node.id}`);
    }
  }

  const next = structuredClone(envelope);
  next.revision += 1;
  next.profile.availableMetaPoints -= node.cost;
  next.profile.unlockedNodes.push(node.id);
  return next;
}
