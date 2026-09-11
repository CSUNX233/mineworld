import type { SummonCooldowns, SummonDirection, SummonRole, SummonSnapshot } from './types';

const ROLES: readonly SummonRole[] = ['warrior', 'guardian', 'archer'];
const DIRECTIONS: readonly SummonDirection[] = ['legion', 'elite'];
const MODES = ['autonomous', 'focus', 'recall'] as const;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonNegative = (value: unknown): value is number => finite(value) && value >= 0;
const integer = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

function validCooldowns(value: unknown): value is SummonCooldowns {
  return isRecord(value)
    && nonNegative(value.attack)
    && nonNegative(value.incoming)
    && nonNegative(value.shield);
}

/** Strict enough for SaveValidation to reject NaN, duplicate ids and impossible resource counts. */
export function validateSnapshot(value: unknown): value is SummonSnapshot {
  if (!isRecord(value)
    || value.version !== 1
    || !integer(value.nextId) || value.nextId < 1
    || !integer(value.capacity) || value.capacity > 6
    || !integer(value.entityLimit) || value.entityLimit < 1 || value.entityLimit > 6
    || !DIRECTIONS.includes(value.direction as SummonDirection)
    || !nonNegative(value.raiseCooldown)
    || !nonNegative(value.coordinationCooldown)
    || !integer(value.guardianShieldBudget) || value.guardianShieldBudget > 3
    || !integer(value.coverSynergyBudget) || value.coverSynergyBudget > 8
    || !MODES.includes(value.mode as typeof MODES[number])
    || !(value.focusTargetId === null || integer(value.focusTargetId))
    || !Array.isArray(value.units) || value.units.length > 6) return false;

  if (value.mark !== null) {
    if (!isRecord(value.mark) || !integer(value.mark.targetId) || !nonNegative(value.mark.remaining)) return false;
  }

  const ids = new Set<string>();
  for (const unit of value.units) {
    if (!isRecord(unit)
      || typeof unit.id !== 'string' || !/^summon-[1-9]\d*$/.test(unit.id) || ids.has(unit.id)
      || !ROLES.includes(unit.role as SummonRole)
      || typeof unit.source !== 'string' || unit.source.length < 1 || unit.source.length > 80
      || typeof unit.temporary !== 'boolean'
      || typeof unit.elite !== 'boolean'
      || !integer(unit.createdOrder)
      || !isRecord(unit.position)
      || !finite(unit.position.x) || !finite(unit.position.y) || !finite(unit.position.z)
      || !nonNegative(unit.health) || !finite(unit.maxHealth) || unit.maxHealth <= 0
      || unit.health > unit.maxHealth + 0.001
      || !finite(unit.life) || unit.life <= 0
      || !validCooldowns(unit.cooldowns)
      || !integer(unit.shieldCharges) || unit.shieldCharges > 3
      || !integer(unit.coverCharges) || unit.coverCharges > 4) return false;
    ids.add(unit.id);
  }
  return true;
}
