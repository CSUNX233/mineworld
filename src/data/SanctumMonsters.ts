import type { MonsterDefinition } from '../types';

/** Base budgets use the shared floor scaling; mourners cost and reward less per body. */
export const SANCTUM_MONSTERS: MonsterDefinition[] = [
  { id: 'sanctum_mourner', name: '送葬者', health: 62, attack: 13, armor: 1, speed: 1.65, detectRadius: 22, attackRange: 1.5, attackCooldown: 1.6, xp: 25, color: 0xaaa38e, minFloor: 11, behavior: 'melee', element: 'physical' },
  { id: 'bell_acolyte', name: '叩钟执事', health: 145, attack: 24, armor: 3, speed: 1.9, detectRadius: 24, attackRange: 3.2, attackCooldown: 4.2, xp: 45, color: 0xa08048, minFloor: 11, behavior: 'melee', element: 'physical' },
  { id: 'epitaph_attendant', name: '缚铭女侍', health: 110, attack: 23, armor: 1, speed: 1.7, detectRadius: 24, attackRange: 10, attackCooldown: 7, xp: 45, color: 0x506966, minFloor: 12, behavior: 'ranged', element: 'frost' },
  { id: 'returning_blade', name: '返刃守墓人', health: 150, attack: 25, armor: 3, speed: 2.05, detectRadius: 24, attackRange: 8, attackCooldown: 4, xp: 50, color: 0xaaa38e, minFloor: 13, behavior: 'ranged', element: 'physical' },
  { id: 'coffin_bearer', name: '负棺者', health: 205, attack: 25, armor: 4, speed: 1.35, detectRadius: 24, attackRange: 1.8, attackCooldown: 2.2, xp: 50, color: 0x20262b, minFloor: 13, behavior: 'melee', element: 'physical' },
  { id: 'name_digger', name: '掘名者', health: 135, attack: 24, armor: 2, speed: 1.65, detectRadius: 24, attackRange: 5, attackCooldown: 6, xp: 50, color: 0x506966, minFloor: 14, behavior: 'melee', element: 'physical' },
  { id: 'bellkeeper', name: '末代司钟人', health: 760, attack: 34, armor: 6, speed: 1.8, detectRadius: 40, attackRange: 4.2, attackCooldown: 2.5, xp: 320, color: 0x506966, minFloor: 15, behavior: 'boss', element: 'physical' },
];
