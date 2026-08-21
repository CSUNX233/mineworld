import { elementalDamage, type ResistanceMap } from '../combat/ElementSystem';
import type { ActorStatus, ElementType } from '../types';

export interface DamageResult {
  damage: number;
  crit: boolean;
}

export class CombatSystem {
  static rollDamage(
    attack: number,
    critChance: number,
    critDamage: number,
    armor: number,
    floor: number,
    element: ElementType = 'physical',
    resistances?: ResistanceMap,
    targetStatuses?: ActorStatus[],
  ): DamageResult {
    const crit = Math.random() < Math.max(0.05, Math.min(0.85, critChance));
    const reduction = armor / (armor + 100 + Math.max(0, floor - 1) * 5);
    const base = attack * (1 + Math.random() * 0.12);
    const afterArmor = Math.max(1, base * (crit ? critDamage : 1) * (1 - reduction));
    return { damage: elementalDamage(afterArmor, element, resistances, targetStatuses), crit };
  }
}
