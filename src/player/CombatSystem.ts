import { elementalDamage, type ResistanceMap } from '../combat/ElementSystem';
import type { ActorStatus, ElementType } from '../types';
import { defenseMitigation, boundedCritChance } from '../combat/DamageRules';

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
    const crit = Math.random() < boundedCritChance(critChance);
    const reduction = defenseMitigation(armor, floor);
    const base = attack * (1 + Math.random() * 0.12);
    const afterArmor = Math.max(1, base * (crit ? critDamage : 1) * (1 - reduction));
    return { damage: elementalDamage(afterArmor, element, resistances, targetStatuses), crit };
  }
}
