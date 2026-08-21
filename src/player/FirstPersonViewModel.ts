import * as THREE from 'three';
import type { ElementType, Item } from '../types';

export class FirstPersonViewModel {
  readonly group = new THREE.Group();
  private arm: THREE.Mesh;
  private weaponGroup: THREE.Group | null = null;
  private walkPhase = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    camera.add(this.group);
    this.group.position.set(0.36, -0.34, -0.58);
    this.group.rotation.y = -0.08;

    this.arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.56, 0.18),
      new THREE.MeshLambertMaterial({ color: 0xd99a6c }),
    );
    this.arm.position.set(0, -0.18, 0);
    this.group.add(this.arm);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  setWeapon(item: Item | null): void {
    if (this.weaponGroup) {
      this.group.remove(this.weaponGroup);
      this.disposeGroup(this.weaponGroup);
      this.weaponGroup = null;
    }
    if (!item || item.slot !== 'weapon') {
      this.arm.visible = true;
      return;
    }

    const isStaff = item.name.includes('法杖') || item.id.startsWith('staff_') || item.id.startsWith('weapon_staff');
    this.weaponGroup = isStaff ? this.buildStaff(item.element) : this.buildMeleeWeapon();
    this.weaponGroup.position.set(0, -0.18, 0.1);
    this.group.add(this.weaponGroup);
    this.arm.visible = false;
  }

  update(dt: number, moving: boolean, sprinting: boolean): void {
    if (moving) {
      this.walkPhase += dt * (sprinting ? 11 : 8);
      const swing = Math.sin(this.walkPhase) * 0.08;
      this.group.position.x = 0.36 + swing * 0.5;
      this.group.position.y = -0.34 + Math.abs(Math.sin(this.walkPhase)) * 0.02;
      this.arm.rotation.z = swing;
      if (this.weaponGroup) this.weaponGroup.rotation.z = swing;
    } else {
      const ease = 1 - Math.exp(-dt * 10);
      this.arm.rotation.z *= 1 - ease;
      if (this.weaponGroup) this.weaponGroup.rotation.z *= 1 - ease;
      this.group.position.x = 0.36;
      this.group.position.y = -0.34;
    }
  }

  swing(progress: number): void {
    this.arm.rotation.x = -Math.PI * 0.65 * Math.sin(progress * Math.PI);
    this.arm.position.z = Math.sin(progress * Math.PI) * 0.12;
    if (this.weaponGroup) {
      this.weaponGroup.rotation.x = -Math.PI * 0.65 * Math.sin(progress * Math.PI);
      this.weaponGroup.position.z = 0.1 + Math.sin(progress * Math.PI) * 0.12;
    }
  }

  private buildMeleeWeapon(): THREE.Group {
    const group = new THREE.Group();
    const steel = new THREE.MeshBasicMaterial({ color: 0xeaf5ff });
    const dark = new THREE.MeshLambertMaterial({ color: 0x5a3c24 });

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.09), dark);
    handle.position.set(0, -0.04, 0);
    group.add(handle);

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.09, 0.09), dark);
    guard.position.set(0, 0.1, 0);
    group.add(guard);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.07), steel);
    blade.position.set(0, 0.46, 0);
    group.add(blade);

    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.07), steel);
    tip.position.set(0, 0.82, 0);
    group.add(tip);
    return group;
  }

  private buildStaff(element: ElementType | undefined): THREE.Group {
    const group = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.96, 8),
      new THREE.MeshBasicMaterial({ color: 0x8a5bd6 }),
    );
    shaft.position.set(0, 0.46, 0);
    group.add(shaft);

    const gem = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 12, 12),
      new THREE.MeshBasicMaterial({ color: this.elementColor(element) }),
    );
    gem.position.set(0, 0.98, 0);
    group.add(gem);
    group.scale.setScalar(0.8);
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
