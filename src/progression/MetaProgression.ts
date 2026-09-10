import type { ArchetypeId, ProfileData, SaveEnvelopeV3 } from './types';

export const XP_PER_POINT = 100;

export const META_NODES: readonly {
  id: ArchetypeId;
  name: string;
  description: string;
  cost: number;
}[] = [
  {
    id: 'vanguard',
    name: '破阵剑术',
    description: '以近战连击与护盾为核心的起始配置。',
    cost: 0,
  },
  {
    id: 'arcanist',
    name: '余烬法术',
    description: '以火球、爆燃与范围法术为核心的起始配置。',
    cost: 1,
  },
  {
    id: 'summoner',
    name: '亡者契约',
    description: '以召唤单位协同作战为核心的起始配置。',
    cost: 2,
  },
] as const;

export function archetypeAllowed(profile: ProfileData, id: ArchetypeId): boolean {
  return profile.unlockedNodes.includes(id);
}

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

  const next = structuredClone(envelope);
  next.revision += 1;
  next.profile.availableMetaPoints -= node.cost;
  next.profile.unlockedNodes.push(node.id);
  return next;
}
