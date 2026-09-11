/** Shared defensive rules for direct hits. Damage over time cannot be dodged. */
export function defenseMitigation(defense: number, floor = 1): number {
  const value = Number.isFinite(defense) ? Math.max(0, defense) : 0;
  return Math.min(0.65, value / (value + 100 + Math.max(0, floor - 1) * 5));
}

export function boundedCritChance(chance: number): number {
  return Number.isFinite(chance) ? Math.max(0, Math.min(0.65, chance)) : 0;
}

export function boundedDodgeChance(chance: number): number {
  return Number.isFinite(chance) ? Math.max(0, Math.min(0.45, chance)) : 0;
}
