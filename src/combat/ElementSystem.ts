import { ELEMENTS, STATUSES, elementStatusChance } from '../data/elements';
import type { ActorStatus, ElementType, StatusType } from '../types';

export type ResistanceMap = Partial<Record<ElementType, number>>;

export interface StatusedActor {
  statuses: ActorStatus[];
  alive?: boolean;
  dead?: boolean;
}

export function resistanceMultiplier(element: ElementType, resistances?: ResistanceMap): number {
  const raw = resistances?.[element] ?? 0;
  const capped = Math.max(0, Math.min(90, raw));
  return 1 - capped / 100;
}

export function isImmune(immunities: StatusType[] | undefined, status: StatusType): boolean {
  return Boolean(immunities?.includes(status));
}

export function makeActorStatus(status: StatusType, sourceAttack: number, element: ElementType): ActorStatus {
  const def = STATUSES[status];
  const elementDef = ELEMENTS[element];
  const duration = def.duration;
  const damagePerTick = sourceAttack * elementDef.statusDamageScale * (def.damagePerSecondFactor > 0 ? def.damagePerSecondFactor : 0);
  return {
    type: status,
    duration,
    maxDuration: duration,
    damagePerTick,
    sourceElement: element,
    slowMultiplier: def.slowMultiplier,
    extraLightningMultiplier: def.extraLightningMultiplier,
  };
}

export function applyStatus(actor: StatusedActor, status: ActorStatus): void {
  const existing = actor.statuses.find((entry) => entry.type === status.type);
  if (existing) {
    existing.duration = Math.max(existing.duration, status.duration);
    existing.maxDuration = existing.duration;
    existing.damagePerTick = Math.max(existing.damagePerTick, status.damagePerTick);
  } else {
    actor.statuses.push(status);
  }
}

export function applyElementalHit(
  actor: StatusedActor,
  element: ElementType,
  sourceAttack: number,
  statusChance?: number,
  immunities?: StatusType[],
): void {
  const def = ELEMENTS[element];
  if (!def.status) return;
  if (isImmune(immunities, def.status)) return;
  if (Math.random() > elementStatusChance(element, statusChance)) return;
  applyStatus(actor, makeActorStatus(def.status, sourceAttack, element));
}

export function elementalDamage(
  baseDamage: number,
  element: ElementType,
  resistances?: ResistanceMap,
  targetStatuses?: ActorStatus[],
): number {
  let damage = baseDamage * resistanceMultiplier(element, resistances);
  const shocked = targetStatuses?.find((status) => status.type === 'shocked');
  if (element === 'lightning' && shocked?.extraLightningMultiplier) {
    damage *= shocked.extraLightningMultiplier;
  }
  return Math.max(1, Math.round(damage));
}

export function updateStatuses(actor: StatusedActor, dt: number, resistances?: ResistanceMap): {
  damage: number;
  burningDamage: number;
  slowMultiplier: number;
  extraLightningMultiplier: number;
} {
  let damage = 0;
  let burningDamage = 0;
  let slowMultiplier = 1;
  let extraLightningMultiplier = 1;
  for (let i = actor.statuses.length - 1; i >= 0; i--) {
    const status = actor.statuses[i];
    const activeTime = Math.min(Math.max(0, status.duration), Math.max(0, dt));
    const tickDamage = status.damagePerTick * activeTime * resistanceMultiplier(status.sourceElement ?? 'physical', resistances);
    damage += tickDamage;
    if (status.type === 'burning') burningDamage += tickDamage;
    status.duration -= dt;
    if (status.duration <= 0) {
      actor.statuses.splice(i, 1);
      continue;
    }
    if (status.slowMultiplier && status.slowMultiplier < slowMultiplier) slowMultiplier = status.slowMultiplier;
    if (status.extraLightningMultiplier && status.extraLightningMultiplier > extraLightningMultiplier) {
      extraLightningMultiplier = status.extraLightningMultiplier;
    }
  }
  return { damage, burningDamage, slowMultiplier, extraLightningMultiplier };
}

export function getStatuses(actor: StatusedActor): ActorStatus[] {
  return actor.statuses;
}
