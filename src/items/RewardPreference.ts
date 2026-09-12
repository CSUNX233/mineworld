import type { ArchetypeId } from '../progression/types';
import type { Slot, StatMap } from '../types';
import { P5_SETS } from '../data/sets';

export interface PreferenceCandidate {
  id: string;
  slot: Slot;
  baseStats: StatMap;
  setId?: string;
  tags?: string[];
}

export const REWARD_PREFERENCE_CHANCE = 0.4;

/** Fixed primary pools: unlocking other sets does not dilute a chosen direction. */
export const P5_SET_PREFERENCE_POOLS: Record<ArchetypeId, readonly string[]> = {
  vanguard: ['warlord', 'warbringer', 'shadow', 'sanguine', 'embersteel'],
  arcanist: ['frost', 'glacier', 'inferno', 'storm'],
  summoner: ['venom', 'soul_banner', 'soul_pyre'],
};

export type EquipmentMechanismTag = 'melee' | 'fire' | 'frost' | 'lightning' | 'poison' | 'summon' | 'resource' | 'defense';

export function matchesMechanismPreference(item: PreferenceCandidate, tag: EquipmentMechanismTag): boolean {
  return (item.tags ?? (item.setId ? P5_SETS[item.setId]?.tags : undefined) ?? []).includes(tag);
}

export function p5PreferredCandidates<T extends PreferenceCandidate>(
  candidates: readonly T[], preference: ArchetypeId, mechanism?: EquipmentMechanismTag,
): T[] {
  const primary = candidates.filter(item => Boolean(item.setId && P5_SET_PREFERENCE_POOLS[preference].includes(item.setId)));
  if (mechanism) {
    const focused = primary.filter(item => matchesMechanismPreference(item, mechanism));
    if (focused.length > 0) return focused;
  }
  return primary;
}

const MELEE_WEAPONS = new Set([
  'weapon_sword',
  'weapon_axe',
  'weapon_hammer',
  'weapon_dagger',
  'weapon_greatsword',
  'weapon_warblade',
  'weapon_sanguine',
]);

function isStaffOrIntelligenceItem(item: PreferenceCandidate): boolean {
  return item.id.includes('staff') || (item.baseStats.intelligence ?? 0) > 0;
}

export function matchesRewardPreference(
  item: PreferenceCandidate,
  preference: ArchetypeId,
): boolean {
  if (preference === 'vanguard') {
    return MELEE_WEAPONS.has(item.id)
      || item.setId === 'warlord'
      || item.setId === 'warbringer'
      || item.setId === 'sanguine';
  }
  if (preference === 'arcanist') {
    return item.setId === 'inferno'
      || item.setId === 'glacier'
      || item.setId === 'frost'
      || isStaffOrIntelligenceItem(item);
  }
  if (preference === 'summoner') {
    return item.setId === 'venom'
      || item.setId === 'shadow'
      || isStaffOrIntelligenceItem(item);
  }
  return false;
}
