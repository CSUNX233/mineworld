import type { MonsterDefinition } from '../types';

export const RUINS_MONSTERS: MonsterDefinition[] = [{
  id: 'oath_gatekeeper', name: '断誓门卫', health: 690, attack: 34, armor: 5,
  speed: 2.3, detectRadius: 28, attackRange: 3, attackCooldown: 2,
  xp: 320, color: 0x898d72, minFloor: 5, behavior: 'boss', element: 'physical',
  statusChance: 0, resistances: { physical: 12, fire: 12, frost: 12, lightning: 12, poison: 12 }, immunities: [],
}];
