import type { ElementType, StatusType } from '../types';

export interface ElementDefinition {
  id: ElementType;
  label: string;
  color: number;
  status?: StatusType;
  statusChance: number;
  statusDamageScale: number;
}

export const ELEMENTS: Record<ElementType, ElementDefinition> = {
  physical: { id: 'physical', label: '物理', color: 0xc9ced6, status: 'bleeding', statusChance: 0.16, statusDamageScale: 0.25 },
  fire: { id: 'fire', label: '火焰', color: 0xff7a2a, status: 'burning', statusChance: 0.24, statusDamageScale: 0.5 },
  frost: { id: 'frost', label: '冰霜', color: 0x8ed4ff, status: 'frozen', statusChance: 0.18, statusDamageScale: 0.15 },
  lightning: { id: 'lightning', label: '闪电', color: 0xffe14d, status: 'shocked', statusChance: 0.2, statusDamageScale: 0.2 },
  poison: { id: 'poison', label: '毒素', color: 0x66d17a, status: 'poisoned', statusChance: 0.28, statusDamageScale: 0.42 },
  shadow: { id: 'shadow', label: '暗影', color: 0x9b5bff, statusChance: 0.12, statusDamageScale: 0.8 },
};

export interface StatusDefinition {
  id: StatusType;
  label: string;
  color: number;
  duration: number;
  damagePerSecondFactor: number;
  slowMultiplier?: number;
  extraLightningMultiplier?: number;
}

export const STATUSES: Record<StatusType, StatusDefinition> = {
  burning: {
    id: 'burning',
    label: '燃烧',
    color: 0xff6a2a,
    duration: 3,
    damagePerSecondFactor: 0.28,
  },
  frozen: {
    id: 'frozen',
    label: '冰冻',
    color: 0x8ed4ff,
    duration: 2.5,
    damagePerSecondFactor: 0,
    slowMultiplier: 0.45,
  },
  shocked: {
    id: 'shocked',
    label: '感电',
    color: 0xffe14d,
    duration: 2.8,
    damagePerSecondFactor: 0,
    extraLightningMultiplier: 1.35,
  },
  poisoned: {
    id: 'poisoned',
    label: '中毒',
    color: 0x66d17a,
    duration: 4,
    damagePerSecondFactor: 0.18,
  },
  bleeding: {
    id: 'bleeding',
    label: '流血',
    color: 0xd94b4b,
    duration: 3.5,
    damagePerSecondFactor: 0.22,
  },
};

export function elementStatusChance(element: ElementType, sourceChance?: number): number {
  const def = ELEMENTS[element];
  const base = def.status ? def.statusChance : 0;
  if (sourceChance !== undefined) return Math.min(1, base + sourceChance);
  return base;
}
