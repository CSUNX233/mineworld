import { cloneData } from '../utils/cloneData';
import type {
  ArchetypeId,
  BuildBranchId,
  ProfileData,
  RewardPreference,
  SaveEnvelopeV3,
} from './types';
import type { DerivedStats } from '../items/EquipmentManager';

export const XP_PER_POINT = 100;

interface ArchetypeMetaNode {
  kind: 'archetype';
  id: ArchetypeId;
  name: string;
  description: string;
  cost: number;
  requiresNode?: string;
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

export interface PermanentMetaNode {
  kind: 'permanent';
  id: string;
  name: string;
  description: string;
  cost: number;
  requiresNode: string;
  branch: 'trunk' | 'vitality' | 'mana' | 'attack' | 'defense';
  notable: boolean;
  bonuses: Partial<MetaBonuses>;
}
export interface MetaBonuses { healthFlat: number; healthPercent: number; manaFlat: number; manaPercent: number; attackPercent: number; defenseFlat: number }
export type MetaNode = ArchetypeMetaNode | MasteryMetaNode | PermanentMetaNode;

const TRUNK_NAMES = ['立足营地','石径修习','旧誓研读','阵列认识','深层准备','遗迹见闻','沉钟思辨','深渊远望'];
const permanentNodes: PermanentMetaNode[] = TRUNK_NAMES.map((name,i) => ({
  kind: 'permanent',id: `camp_trunk_${i+1}`,name,description: '最大生命 +1。沿主干逐点深入，可选择不同的长期修习分支。',
  cost: 1,requiresNode: i ? `camp_trunk_${i}` : 'vanguard',branch: 'trunk',notable: false,bonuses: { healthFlat: 1 },
}));
const permanentBranches = [
  { id: 'vitality',name: '体魄',root: 2,bonuses: { healthFlat: 1,healthPercent: .5 },notableBonuses: { healthFlat: 2,healthPercent: 1 } },
  { id: 'mana',name: '灵泉',root: 3,bonuses: { manaFlat: 1,manaPercent: .5 },notableBonuses: { manaFlat: 2,manaPercent: 1 } },
  { id: 'defense',name: '坚守',root: 4,bonuses: { defenseFlat: .5 },notableBonuses: { defenseFlat: 1 } },
  { id: 'attack',name: '锋芒',root: 5,bonuses: { attackPercent: .5 },notableBonuses: { attackPercent: 1 } },
] as const;
for (const branch of permanentBranches) for (let i = 1; i <= 8; i++) {
  const notable = i === 8,bonuses = notable ? branch.notableBonuses : branch.bonuses;
  permanentNodes.push({kind:'permanent',id:`camp_${branch.id}_${i}`,name: notable ? `${branch.name}积习` : `${branch.name}修习 ${i}`,
    description: metaBonusDescription(bonuses),cost:notable ? 2 : 1,requiresNode:i===1 ? `camp_trunk_${branch.root}` : `camp_${branch.id}_${i-1}`,
    branch:branch.id,notable,bonuses});
}
export const PERMANENT_META_NODES: readonly PermanentMetaNode[] = permanentNodes;

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
    requiresNode: 'vanguard',
    name: '余烬法术',
    description: '以火球、爆燃与范围法术为核心的独立起步配置。',
    cost: 1,
  },
  {
    kind: 'archetype',
    id: 'summoner',
    requiresNode: 'vanguard',
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
  ...PERMANENT_META_NODES,
] as const;

export function metaBonusDescription(bonuses: Partial<MetaBonuses>): string {
  const parts: string[] = [];
  if (bonuses.healthFlat) parts.push(`最大生命 +${bonuses.healthFlat}`);
  if (bonuses.healthPercent) parts.push(`最大生命 +${bonuses.healthPercent}%`);
  if (bonuses.manaFlat) parts.push(`最大法力 +${bonuses.manaFlat}`);
  if (bonuses.manaPercent) parts.push(`最大法力 +${bonuses.manaPercent}%`);
  if (bonuses.attackPercent) parts.push(`攻击 +${bonuses.attackPercent}%`);
  if (bonuses.defenseFlat) parts.push(`防御 +${bonuses.defenseFlat}`);
  return parts.join('，') + '。';
}

export function permanentMetaBonuses(unlockedNodes: readonly string[]): MetaBonuses {
  const total: MetaBonuses = {healthFlat:0,healthPercent:0,manaFlat:0,manaPercent:0,attackPercent:0,defenseFlat:0};
  const unlocked = new Set(unlockedNodes);
  for (const node of PERMANENT_META_NODES) if (unlocked.has(node.id)) for (const key of Object.keys(node.bonuses) as (keyof MetaBonuses)[]) total[key] += node.bonuses[key] ?? 0;
  return total;
}

/** Frozen start-of-run unlocks feed the same DerivedStats used by combat, skills and the character panel. */
export function applyPermanentMetaBonuses(stats: DerivedStats, unlockedNodes: readonly string[]): DerivedStats {
  const bonuses = permanentMetaBonuses(unlockedNodes);
  if (!Object.values(bonuses).some(value=>value>0)) return stats;
  return {...stats,maxHealth:Math.round((stats.maxHealth+bonuses.healthFlat)*(1+bonuses.healthPercent/100)),
    maxMana:Math.round((stats.maxMana+bonuses.manaFlat)*(1+bonuses.manaPercent/100)),
    attack:stats.attack*(1+bonuses.attackPercent/100),defense:stats.defense+bonuses.defenseFlat};
}

export function completedBasicVictoryCount(envelope: SaveEnvelopeV3): number {
  if (envelope.profile.completedBasicVictories !== undefined) return envelope.profile.completedBasicVictories;
  const records = [...envelope.recentRuns,...envelope.pendingSettlement ? [envelope.pendingSettlement] : []];
  return new Set(records.filter(record => record.outcome==='victory' && record.rulesVersion===2 && record.finalFloor===25 && record.completedObjectives===50 && envelope.claimedRunIds.includes(record.runId)).map(record=>record.runId)).size;
}

export function metaUnlockReason(envelope: SaveEnvelopeV3, node: MetaNode): string | null {
  if (envelope.profile.unlockedNodes.includes(node.id)) return '已解锁';
  if (envelope.activeRun || envelope.pendingSettlement) return '结束当前对局并确认结算后可解锁';
  if (node.requiresNode && !envelope.profile.unlockedNodes.includes(node.requiresNode)) return `前置：${META_NODES.find(n=>n.id===node.requiresNode)?.name ?? node.requiresNode}`;
  if (node.kind==='mastery' && !masteryRequirementMet(envelope.profile,node)) return '需完整通关，并完成任一对应分支掌握';
  if (envelope.profile.availableMetaPoints < node.cost) return `还需 ${node.cost-envelope.profile.availableMetaPoints} 个天赋点`;
  return null;
}

/** Validate only the new permanent subtree; retain unknown historical content IDs and legacy unlocks. */
export function validPermanentMetaPath(ids: readonly string[]): boolean {
  const unlocked = new Set(ids);
  return PERMANENT_META_NODES.every(node => !unlocked.has(node.id) || unlocked.has(node.requiresNode));
}

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

  const next = cloneData(envelope);
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
  if (node.requiresNode && !envelope.profile.unlockedNodes.includes(node.requiresNode)) throw new Error(`Required meta node is not unlocked: ${node.requiresNode}`);
  if (node.kind === 'mastery') {
    if (!envelope.profile.unlockedNodes.includes(node.requiresNode)) {
      throw new Error(`Required archetype is not unlocked: ${node.requiresNode}`);
    }
    if (!masteryRequirementMet(envelope.profile, node)) {
      throw new Error(`Mastery challenge is incomplete: ${node.id}`);
    }
  }

  const next = cloneData(envelope);
  next.revision += 1;
  next.profile.availableMetaPoints -= node.cost;
  next.profile.unlockedNodes.push(node.id);
  return next;
}
