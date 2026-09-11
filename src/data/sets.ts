import type { StatMap, StatValueModes } from '../types';

export interface SetBonusDef {
  stats: StatMap;
  valueModes?: StatValueModes;
  special?: string;
  description?: string;
}

export interface SetDefinition {
  id: string;
  name: string;
  bonuses: Record<number, SetBonusDef>;
}

export const SETS: Record<string, SetDefinition> = {
  warlord: {
    id: 'warlord',
    name: '战争领主',
    bonuses: {
      2: { stats: { attack: 8, maxHealth: 24 } },
      4: { stats: { armor: 10, critDamage: 0.2 }, valueModes: { critDamage: 'increased' } },
    },
  },
  frost: {
    id: 'frost',
    name: '霜语者',
    bonuses: {
      2: { stats: { maxHealth: 20, armor: 5 } },
      3: { stats: { attackSpeed: 0.08 }, valueModes: { attackSpeed: 'increased' } },
    },
  },
  shadow: {
    id: 'shadow',
    name: '暗影行者',
    bonuses: {
      2: {
        stats: { critChance: 0.35, moveSpeed: 0.05 },
        valueModes: { critChance: 'increased', moveSpeed: 'increased' },
      },
    },
  },
  warbringer: {
    id: 'warbringer',
    name: '破军',
    bonuses: {
      2: { stats: { critChance: 0.25, attack: 6 }, valueModes: { critChance: 'increased' } },
      4: {
        stats: { critDamage: 0.35, attackSpeed: 0.05 },
        valueModes: { critDamage: 'increased', attackSpeed: 'increased' },
      },
      6: {
        stats: { attack: 14, critChance: 0.3 },
        valueModes: { critChance: 'increased' },
        special: 'executeFullHealth',
      },
    },
  },
  inferno: {
    id: 'inferno',
    name: '炼狱',
    bonuses: {
      2: { stats: { attack: 5 }, special: 'burnMastery' },
      4: { stats: { maxMana: 18, manaRegen: 1.2 } },
      6: { stats: { attack: 12 }, special: 'fireTrail' },
    },
  },
  glacier: {
    id: 'glacier',
    name: '永冻',
    bonuses: {
      2: { stats: { maxHealth: 18, armor: 4 } },
      4: { stats: { moveSpeed: 0.04 }, valueModes: { moveSpeed: 'increased' }, special: 'freezeMastery' },
      6: { stats: { maxMana: 20, manaRegen: 1.5 }, special: 'glacialNova' },
    },
  },
  venom: {
    id: 'venom',
    name: '疫毒',
    bonuses: {
      2: { stats: { attack: 4 }, special: 'poisonMastery' },
      4: { stats: { killHeal: 2, maxHealth: 16 } },
      6: { stats: { attack: 10 }, special: 'summonSkeletonOnKill' },
    },
  },
  sanguine: {
    id: 'sanguine',
    name: '血裔',
    bonuses: {
      2: { stats: { lifeSteal: 0.03, maxHealth: 14 }, valueModes: { lifeSteal: 'flat' } },
      4: { stats: { armor: 8, killHeal: 3 } },
      6: { stats: { lifeSteal: 0.05 }, valueModes: { lifeSteal: 'flat' }, special: 'lowHealthShield' },
    },
  },
  storm: {
    id: 'storm',
    name: '风暴',
    bonuses: {
      2: {
        stats: { attackSpeed: 0.05, moveSpeed: 0.03 },
        valueModes: { attackSpeed: 'increased', moveSpeed: 'increased' },
      },
      4: { stats: { critChance: 0.3 }, valueModes: { critChance: 'increased' }, special: 'shockMastery' },
      6: {
        stats: { attack: 8, attackSpeed: 0.07 },
        valueModes: { attackSpeed: 'increased' },
        special: 'chainLightning',
      },
    },
  },
};

export function setDisplayName(id: string): string {
  return SETS[id]?.name ?? id;
}
