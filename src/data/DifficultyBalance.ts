export type MonsterDifficultyStat = 'health' | 'attack';
export type MonsterDifficultyTier = 'normal' | 'boss';

/** Combined health × attack pressure relative to the previous depth curve. */
export const CHAPTER_PRESSURE = [1.05, 1.10, 1.15, 1.20, 1.25] as const;

export function chapterPressure(floor: number): number {
  const chapter = Math.floor((balancedFloor(floor) - 1) / 5);
  return CHAPTER_PRESSURE[chapter];
}

/**
 * Monster templates and elite modifiers remain responsible for differences
 * between enemy types. This table is the single depth-based multiplier layer.
 */
export const MONSTER_DIFFICULTY = {
  maxFloor: 25,
  lateRampStartFloor: 5,
  baseGrowthPerFloor: {
    health: 0.18,
    attack: 0.12,
  },
  lateGameBonusAtMaxFloor: {
    normal: { health: 0.20, attack: 0.06 },
    boss: { health: 0.25, attack: 0.08 },
  },
} as const;

function balancedFloor(floor: number): number {
  if (!Number.isFinite(floor)) return 1;
  return Math.min(MONSTER_DIFFICULTY.maxFloor, Math.max(1, floor));
}

function smoothstep(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

export function monsterDifficultyMultiplier(
  floor: number,
  stat: MonsterDifficultyStat,
  tier: MonsterDifficultyTier = 'normal',
): number {
  const depth = balancedFloor(floor);
  const baseMultiplier = 1 + MONSTER_DIFFICULTY.baseGrowthPerFloor[stat] * (depth - 1);
  const rampSpan = MONSTER_DIFFICULTY.maxFloor - MONSTER_DIFFICULTY.lateRampStartFloor;
  const rampProgress = smoothstep((depth - MONSTER_DIFFICULTY.lateRampStartFloor) / rampSpan);
  const lateGameBonus = MONSTER_DIFFICULTY.lateGameBonusAtMaxFloor[tier][stat] * rampProgress;
  return baseMultiplier * (1 + lateGameBonus) * Math.sqrt(chapterPressure(depth));
}
