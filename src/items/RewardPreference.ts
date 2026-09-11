import type { ArchetypeId } from '../progression/types';
import type { Slot, StatMap } from '../types';

export interface PreferenceCandidate {
  id: string;
  slot: Slot;
  baseStats: StatMap;
  setId?: string;
}

export const REWARD_PREFERENCE_CHANCE = 0.4;

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
