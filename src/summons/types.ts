import type * as THREE from 'three';
import type { Monster } from '../monsters/Monster';

export type SummonRole = 'warrior' | 'guardian' | 'archer';
export type SummonDirection = 'legion' | 'elite';
export type SummonCommandMode = 'autonomous' | 'focus' | 'recall';
export type SummonEndReason = 'death' | 'expired' | 'sacrifice' | 'clear' | 'owner-death' | 'floor-change' | 'restore';

export interface SummonOwner {
  readonly position: THREE.Vector3;
  readonly alive: boolean;
  readonly health?: number;
  readonly maxHealth?: number;
}

/** Values are the owner's current derived stats and are intentionally read every update. */
export interface SummonConfig {
  attack: number;
  maxHealth: number;
  capacity?: number;
  direction: SummonDirection;
  guardianShield?: number;
  entityLimit?: number;
}

export interface TemporarySummonOptions {
  role?: SummonRole;
  life?: number;
  source?: string;
  position?: THREE.Vector3;
  elite?: boolean;
}

export interface SummonEffect {
  kind: 'raise' | 'hit' | 'focus-mark' | 'coordinated-shot' | 'guardian-shield' | 'guardian-archer-link' | 'end';
  position: THREE.Vector3;
  targetPosition?: THREE.Vector3;
  role?: SummonRole;
  summonId?: string;
  amount?: number;
  reason?: SummonEndReason;
}

export interface SummonHost {
  damage(monster: Monster, amount: number, sourcePosition: THREE.Vector3): void;
  shield(amount: number): void;
  effect?(effect: SummonEffect): void;
  message?(text: string): void;
}

export interface RaiseResult {
  ok: boolean;
  message: string;
}

export interface SummonCooldowns {
  attack: number;
  incoming: number;
  shield: number;
}

export interface SerializedSummonUnit {
  id: string;
  role: SummonRole;
  source: string;
  temporary: boolean;
  elite: boolean;
  createdOrder: number;
  position: { x: number; y: number; z: number };
  health: number;
  maxHealth: number;
  life: number;
  cooldowns: SummonCooldowns;
  shieldCharges: number;
  coverCharges: number;
}

export interface SummonSnapshot {
  version: 1;
  nextId: number;
  capacity: number;
  entityLimit: number;
  direction: SummonDirection;
  raiseCooldown: number;
  coordinationCooldown: number;
  guardianShieldBudget: number;
  coverSynergyBudget: number;
  mode: SummonCommandMode;
  focusTargetId: number | null;
  mark: { targetId: number; remaining: number } | null;
  units: SerializedSummonUnit[];
}

export interface SummonStatus {
  count: number;
  capacityUsed: number;
  capacity: number;
  entityLimit: number;
  direction: SummonDirection;
  mode: SummonCommandMode;
  focusTargetId: number | null;
  raiseCooldown: number;
  guardianShieldBudget: number;
  coverSynergyBudget: number;
  overCapacity: boolean;
  roles: Record<SummonRole, number>;
}

export const SUMMON_CAPACITY: Readonly<Record<SummonRole, number>> = Object.freeze({
  warrior: 1,
  guardian: 2,
  archer: 1,
});
