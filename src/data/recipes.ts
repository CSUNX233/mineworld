import type { Rarity } from '../types';
import { monsterDifficultyMultiplier } from './DifficultyBalance';

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#c9ced6',
  magic: '#4da3ff',
  rare: '#ffe14d',
  epic: '#c05bff',
  legendary: '#ff8a1e',
  mythic: '#ff2857',
};

export const RARITY_ORDER: Rarity[] = ['common', 'magic', 'rare', 'epic', 'legendary', 'mythic'];

export const RARITY_AFFIX_COUNT: Record<Rarity, [number, number]> = {
  common: [0, 0],
  magic: [1, 2],
  rare: [2, 4],
  epic: [4, 5],
  legendary: [5, 6],
  mythic: [6, 6],
};

export function monsterHealth(base: number, floor: number, isBoss = false): number {
  return Math.round(base * monsterDifficultyMultiplier(floor, 'health', isBoss ? 'boss' : 'normal'));
}

export function monsterAttack(base: number, floor: number, isBoss = false): number {
  return Math.round(base * monsterDifficultyMultiplier(floor, 'attack', isBoss ? 'boss' : 'normal'));
}

export function monsterXp(base: number, floor: number): number {
  return Math.round(base * (1 + 0.1 * Math.max(0, floor - 1)));
}

export function itemLevelForFloor(floor: number, variance: number): number {
  return Math.max(1, floor + Math.round((Math.random() * 2 - 1) * variance));
}

export function xpToNext(level: number): number {
  return Math.round(60 + level * 28 + level * level * 5);
}

export function armorReduction(armor: number, floor: number): number {
  return armor / (armor + 100 + Math.max(0, floor - 1) * 5);
}

export function luckRarityBonus(luck: number): number {
  const value = Number.isFinite(luck) ? Math.max(0, luck) : 0;
  return 0.2 * (value / (value + 100));
}

export function rarityWeightsForFloor(floor: number, luck = 0): { rarity: Rarity; weight: number }[] {
  const depth = Math.max(0, floor - 1);
  const epicWeight = 3.5 + depth * 0.55;
  const legendaryWeight = 0.5 + depth * 0.16;
  const rareMultiplier = 1 + luckRarityBonus(luck);
  return [
    { rarity: 'common', weight: 60 - depth * 0.4 },
    { rarity: 'magic', weight: 25 },
    { rarity: 'rare', weight: (11 + depth * 0.18) * rareMultiplier },
    { rarity: 'epic', weight: epicWeight * rareMultiplier },
    { rarity: 'legendary', weight: legendaryWeight * rareMultiplier },
  ];
}
