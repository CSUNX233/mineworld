/** Attack cadence only: never accelerates telegraphs, movement or status damage. */
export function monsterAggression(monster: { group: { userData: Record<string, any> } }): number {
  const value = monster.group.userData.aggression;
  return value === 0.8 || value === 1.2 ? value : 1;
}
