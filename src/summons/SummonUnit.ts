import * as THREE from 'three';
import type { SummonOwner, SummonRole, SerializedSummonUnit } from './types';
import { SummonVisual } from './SummonVisual';

export interface SummonUnitInit {
  id: string;
  role: SummonRole;
  source: string;
  temporary: boolean;
  elite: boolean;
  createdOrder: number;
  position: THREE.Vector3;
  maxHealth: number;
  life: number;
  health?: number;
  cooldowns?: { attack: number; incoming: number; shield: number };
  shieldCharges?: number;
  coverCharges?: number;
}

export class SummonUnit {
  readonly position: THREE.Vector3;
  readonly visual: SummonVisual;
  health: number;
  maxHealth: number;
  life: number;
  yaw = 0;
  cooldowns: { attack: number; incoming: number; shield: number };
  shieldCharges: number;
  coverCharges: number;

  constructor(scene: THREE.Scene, public owner: SummonOwner, readonly init: SummonUnitInit) {
    this.position = init.position.clone();
    this.maxHealth = Math.max(1, init.maxHealth);
    this.health = THREE.MathUtils.clamp(init.health ?? this.maxHealth, 0, this.maxHealth);
    this.life = init.life;
    this.cooldowns = { ...(init.cooldowns ?? { attack: 0, incoming: 0, shield: 0 }) };
    this.shieldCharges = init.shieldCharges ?? 3;
    this.coverCharges = init.coverCharges ?? 4;
    this.visual = new SummonVisual(scene, init.role, init.elite);
  }

  get id(): string { return this.init.id; }
  get role(): SummonRole { return this.init.role; }
  get source(): string { return this.init.source; }
  get temporary(): boolean { return this.init.temporary; }
  get elite(): boolean { return this.init.elite; }
  get createdOrder(): number { return this.init.createdOrder; }

  tick(dt: number, elapsed: number, derivedMaxHealth: number): void {
    this.life = Math.max(0, this.life - dt);
    this.cooldowns.attack = Math.max(0, this.cooldowns.attack - dt);
    this.cooldowns.incoming = Math.max(0, this.cooldowns.incoming - dt);
    this.cooldowns.shield = Math.max(0, this.cooldowns.shield - dt);
    // Raising max health never heals; lowering it can only clamp current health.
    this.maxHealth = Math.max(1, derivedMaxHealth);
    this.health = Math.min(this.health, this.maxHealth);
    this.visual.update(this.position, this.yaw, this.health / this.maxHealth, elapsed);
  }

  snapshot(): SerializedSummonUnit {
    return {
      id: this.id,
      role: this.role,
      source: this.source,
      temporary: this.temporary,
      elite: this.elite,
      createdOrder: this.createdOrder,
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      health: this.health,
      maxHealth: this.maxHealth,
      life: this.life,
      cooldowns: { ...this.cooldowns },
      shieldCharges: this.shieldCharges,
      coverCharges: this.coverCharges,
    };
  }

  dispose(scene: THREE.Scene): void {
    this.visual.dispose(scene);
  }
}

