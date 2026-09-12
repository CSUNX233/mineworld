import { swingRoll } from '../combat/MeleeSwing';
import * as THREE from 'three';
import type { ActorStatus, ElementType, Item } from '../types';
import { applyStatus, updateStatuses } from '../combat/ElementSystem';
import { defenseMitigation, boundedDodgeChance } from '../combat/DamageRules';

export class Player {
  onLeechRecovered: ((amount: number) => void) | null = null;
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3(0, 0, 0);
  readonly velocity = new THREE.Vector3(0, 0, 0);
  yaw = 0;
  pitch = 0;
  onGround = true;
  moving = false;
  sprinting = false;
  health = 100;
  maxHealth = 100;
  mana = 50;
  maxMana = 50;
  xp = 0;
  level = 1;
  attributePoints = 0;
  alive = true;
  shield = 0;
  defense = 0;
  maxShield = 0;
  shieldRechargeDelay = 5;
  shieldRechargeElapsed = 0;
  movingShieldRecovery = 0;
  dodgeChance = 0.05;
  defenseFloor = 1;
  lastHitDodged = false;
  private leechReserve = 0;
  statuses: ActorStatus[] = [];
  invulnerable = 0;
  private stepTime = 0;
  private leftArm: THREE.Mesh;
  private rightArm: THREE.Mesh;
  private leftLeg: THREE.Mesh;
  private rightLeg: THREE.Mesh;
  private weaponMesh: THREE.Group | null = null;

  constructor() {
    this.group.name = 'player';
    const skin = new THREE.MeshLambertMaterial({ color: 0xd99a6c });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x356c8c });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2d3642 });
    const eyes = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const pupil = new THREE.MeshLambertMaterial({ color: 0x10161d });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.72, 0.34), shirt);
    body.position.y = 1.08;
    this.group.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
    head.position.y = 1.72;
    this.group.add(head);

    const eyeGeo = new THREE.BoxGeometry(0.1, 0.1, 0.02);
    const eyeL = new THREE.Mesh(eyeGeo, eyes);
    eyeL.position.set(-0.1, 1.76, 0.24);
    this.group.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyes);
    eyeR.position.set(0.1, 1.76, 0.24);
    this.group.add(eyeR);
    const pupilL = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.02), pupil);
    pupilL.position.set(-0.1, 1.76, 0.26);
    this.group.add(pupilL);
    const pupilR = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.02), pupil);
    pupilR.position.set(0.1, 1.76, 0.26);
    this.group.add(pupilR);

    this.leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.2), skin);
    this.leftArm.position.set(-0.38, 1.18, 0);
    this.group.add(this.leftArm);
    this.rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.2), skin);
    this.rightArm.position.set(0.38, 1.18, 0);
    this.group.add(this.rightArm);

    this.leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 0.24), pants);
    this.leftLeg.position.set(-0.14, 0.34, 0);
    this.group.add(this.leftLeg);
    this.rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 0.24), pants);
    this.rightLeg.position.set(0.14, 0.34, 0);
    this.group.add(this.rightLeg);

    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
  }

  update(dt: number, elapsed: number): void {
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.shieldRechargeElapsed = Math.min(60, this.shieldRechargeElapsed + Math.max(0, dt));
    const statusResult = updateStatuses(this, dt);
    if (statusResult.damage > 0 && this.alive) {
      this.takeDamage(statusResult.damage, false);
    }
    if (this.alive && this.shield < this.maxShield) {
      const recoveryTime = Math.min(Math.max(0, dt), Math.max(0, this.shieldRechargeElapsed - this.shieldRechargeDelay));
      const recoveryRate = this.maxShield * 0.2 + (this.moving ? this.movingShieldRecovery : 0);
      this.shield = Math.min(this.maxShield, this.shield + recoveryTime * recoveryRate);
    }
    if (this.alive && this.leechReserve > 0) {
      const recovery = Math.min(this.leechReserve, this.maxHealth * 0.05 * dt);
      const beforeRecovery = this.health;
      this.heal(recovery);
      this.onLeechRecovered?.(this.health - beforeRecovery);
      this.leechReserve = Math.max(0, Math.min(this.maxHealth * 0.1, this.leechReserve - recovery));
    } else if (!this.alive) this.leechReserve = 0;
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    if (this.moving && this.onGround) {
      this.stepTime += dt * (this.sprinting ? 11 : 8);
      const swing = Math.sin(this.stepTime) * 0.55;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -swing * 0.7;
      this.rightArm.rotation.x = swing * 0.7;
    } else {
      const ease = 1 - Math.exp(-dt * 10);
      this.leftLeg.rotation.x *= 1 - ease;
      this.rightLeg.rotation.x *= 1 - ease;
      this.leftArm.rotation.x *= 1 - ease;
      this.rightArm.rotation.x *= 1 - ease;
    }
    const bob = this.onGround && this.moving ? Math.sin(this.stepTime * 2) * 0.02 : 0;
    this.group.position.y = this.position.y + bob;
    void elapsed;
  }

  applyStatus(status: ActorStatus): void {
    applyStatus(this, status);
  }

  takeDamage(amount: number, directHit = true): number {
    this.lastHitDodged = false;
    if (!this.alive || !Number.isFinite(amount) || amount <= 0) return 0;
    this.interruptShieldRecovery();
    if (this.invulnerable > 0) return 0;
    if (directHit && Math.random() < boundedDodgeChance(this.dodgeChance)) {
      this.lastHitDodged = true;
      return 0;
    }
    if (directHit) amount = Math.max(1, amount * (1 - defenseMitigation(this.defense, this.defenseFloor)));
    const absorbed = Math.min(this.shield, amount);
    this.shield -= absorbed;
    const actual = Math.max(0, amount - absorbed);
    this.health = Math.max(0, this.health - actual);
    if (this.health <= 0) this.alive = false;
    return actual;
  }

  heal(amount: number): void {
    if (!this.alive || !Number.isFinite(amount) || amount <= 0) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  clearRecovery(): void {
    this.leechReserve = 0;
    this.lastHitDodged = false;
    this.maxShield = 0;
    this.shield = 0;
    this.shieldRechargeElapsed = 0;
  }

  interruptShieldRecovery(): void {
    this.shieldRechargeElapsed = 0;
  }

  setShieldCapacity(capacity: number): void {
    const next = Math.max(0, capacity);
    // Losing capacity removes that portion of shield; gaining capacity cannot refill it by swapping gear.
    if (next < this.maxShield) this.shield = Math.max(0, this.shield - (this.maxShield - next));
    this.maxShield = next;
  }

  grantShield(amount: number, extraCapacity: number): void {
    if (!this.alive || amount <= 0) return;
    this.shield = Math.max(this.shield, Math.min(this.maxShield + Math.max(0, extraCapacity), this.shield + amount));
  }

  /** Leech uses actual health removed, with a bounded recovery rate against groups. */
  leech(amount: number): void {
    if (!this.alive || amount <= 0 || !Number.isFinite(amount)) return;
    this.leechReserve = Math.min(this.maxHealth * 0.1, this.leechReserve + amount);
  }

  addMana(amount: number): void {
    this.mana = Math.min(this.maxMana, this.mana + amount);
  }

  swingArm(progress: number, angle = 0): void {
    this.rightArm.rotation.order = 'ZXY';
    this.rightArm.rotation.z = swingRoll(angle, progress);
    this.rightArm.rotation.x = -Math.PI * 0.85 * Math.sin(progress * Math.PI);
  }

  setWeapon(item: Item | null): void {
    if (this.weaponMesh) {
      this.rightArm.remove(this.weaponMesh);
      this.disposeGroup(this.weaponMesh);
      this.weaponMesh = null;
    }
    if (!item || item.slot !== 'weapon') return;

    const isStaff =
      item.name.includes('法杖') || item.id.startsWith('staff_') || item.id.startsWith('weapon_staff');
    this.weaponMesh = isStaff ? this.buildStaff(item.element) : this.buildMeleeWeapon(item);
    this.weaponMesh.position.set(0, -0.44, 0.34);
    this.rightArm.add(this.weaponMesh);
  }

  private buildMeleeWeapon(item: Item): THREE.Group {
    const group = new THREE.Group();
    const steel = new THREE.MeshBasicMaterial({ color: 0xeaf5ff });
    const dark = new THREE.MeshLambertMaterial({ color: 0x5a3c24 });

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.1), dark);
    handle.position.set(0, -0.04, 0.06);
    group.add(handle);

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 0.1), dark);
    guard.position.set(0, 0.12, 0.06);
    group.add(guard);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.68, 0.08), steel);
    blade.position.set(0, 0.5, 0.06);
    group.add(blade);

    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.08), steel);
    tip.position.set(0, 0.88, 0.06);
    group.add(tip);

    return group;
  }

  private buildStaff(element: ElementType | undefined): THREE.Group {
    const group = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 1.05, 8),
      new THREE.MeshBasicMaterial({ color: 0x8a5bd6 }),
    );
    shaft.position.set(0, 0.52, 0.05);
    group.add(shaft);

    const gem = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 12, 12),
      new THREE.MeshBasicMaterial({ color: this.elementColor(element) }),
    );
    gem.position.set(0, 1.06, 0.05);
    group.add(gem);
    return group;
  }

  private elementColor(element: ElementType | undefined): number {
    const colors: Record<ElementType, number> = {
      physical: 0xd9e2ec,
      fire: 0xff7a2a,
      frost: 0x7ad7ff,
      lightning: 0xffe14d,
      poison: 0x69d44a,
      shadow: 0xb56bff,
    };
    return colors[element ?? 'physical'];
  }

  private disposeGroup(group: THREE.Group): void {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }
}
