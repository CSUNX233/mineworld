/** Attack cadence only: never accelerates telegraphs, movement or status damage. */
export function monsterAggression(monster: { group: { userData: Record<string, any> }; def?: { behavior: string } }): number {
  const value = monster.group.userData.aggression;
  return (value === 0.8 || value === 1.2 ? value : 1) * (monster.def?.behavior === 'boss' ? 1.1 : 1);
}

/** Pursuit only; charge travel and locked attack telegraphs keep their timing. */
export function monsterPursuitRate(monster: { def: { behavior: string } }): number {
  return monster.def.behavior === 'boss' ? 1.1 : 1;
}
