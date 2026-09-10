import * as THREE from 'three';
import type { ElementType, Item } from '../types';

export class FirstPersonViewModel {
  readonly group = new THREE.Group();
  private arm: THREE.Mesh;
  private weaponGroup: THREE.Group | null = null;
  private walkPhase = 0;

  constructor(private camera: THREE.PerspectiveCamera) {
    camera.add(this.group);
    this.group.position.set(0.36, -0.42, -0.85);
    this.group.rotation.y = -0.08;

    this.arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.56, 0.18),
      new THREE.MeshLambertMaterial({ color: 0xd99a6c }),
    );
    this.arm.position.set(0, -0.18, 0);
    this.group.add(this.arm);
    this.configureForeground();
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
    this.weaponGroup = isStaff ? this.buildStaff(item.element) : this.buildMeleeWeapon(item);
    this.weaponGroup.position.set(0, -0.18, 0.1);
    this.group.add(this.weaponGroup);
    this.arm.visible = false;
    this.configureForeground();
  }

  update(dt: number, moving: boolean, sprinting: boolean): void {
    const scale = Math.min(0.7, Math.max(0.42, this.camera.aspect * 0.7));
    this.group.scale.setScalar(scale);
    const horizontalSpace = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect * 0.85;
    const restX = Math.min(0.36, horizontalSpace * 0.55);
    if (moving) {
      this.walkPhase += dt * (sprinting ? 11 : 8);
      const swing = Math.sin(this.walkPhase) * 0.08;
      this.group.position.x = restX + swing * 0.25;
      this.group.position.y = -0.42 + Math.abs(Math.sin(this.walkPhase)) * 0.015;
      this.arm.rotation.z = swing;
      if (this.weaponGroup) this.weaponGroup.rotation.z = swing;
    } else {
      const ease = 1 - Math.exp(-dt * 10);
      this.arm.rotation.z *= 1 - ease;
      if (this.weaponGroup) this.weaponGroup.rotation.z *= 1 - ease;
      this.group.position.x = THREE.MathUtils.damp(this.group.position.x, restX, 12, dt);
      this.group.position.y = THREE.MathUtils.damp(this.group.position.y, -0.42, 12, dt);
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

  private buildMeleeWeapon(item: Item): THREE.Group {
    const group = new THREE.Group();
    const steel = new THREE.MeshLambertMaterial({ color: 0xc2d6e5 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x5a3c24 });

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.09), dark);
    handle.position.set(0, -0.04, 0);
    group.add(handle);

    if (item.icon === 'axe' || item.icon === 'hammer') {
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.65, 0.08), dark);
      shaft.position.y = 0.3;
      group.add(shaft);
      const head = new THREE.Mesh(new THREE.BoxGeometry(item.icon === 'hammer' ? 0.4 : 0.32,
        item.icon === 'hammer' ? 0.25 : 0.35, item.icon === 'hammer' ? 0.24 : 0.08), steel);
      head.position.set(item.icon === 'axe' ? -0.12 : 0, 0.62, 0);
      group.add(head);
      return group;
    }

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.09, 0.09), dark);
    guard.position.set(0, 0.1, 0);
    group.add(guard);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.07), steel);
    blade.position.set(0, 0.46, 0);
    group.add(blade);

    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.07), steel);
    tip.position.set(0, 0.82, 0);
    group.add(tip);
    if (item.name.includes('匕首') || item.id.includes('dagger')) group.scale.y = 0.65;
    return group;
  }

  private configureForeground(): void {
    this.group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.renderOrder = 1000;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => { material.depthTest = false; material.depthWrite = false; });
      child.frustumCulled = false;
    });
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
