import * as THREE from 'three';
import type { SummonRole } from './types';

export class SummonVisual {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly healthFill: THREE.Mesh;
  private readonly link: THREE.Line;
  private readonly focusRing: THREE.Mesh;

  constructor(scene: THREE.Scene, readonly role: SummonRole, elite: boolean) {
    this.group.name = `summon-${role}`;
    this.group.add(this.body);
    this.buildSilhouette(role, elite);

    const healthBack = new THREE.Mesh(
      new THREE.PlaneGeometry(0.82, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x16202a, depthTest: false, depthWrite: false }),
    );
    healthBack.position.set(0, role === 'guardian' ? 2.25 : 2.05, 0);
    healthBack.renderOrder = 8;
    this.group.add(healthBack);
    this.healthFill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.78, 0.045),
      new THREE.MeshBasicMaterial({ color: 0x8fd6c0, depthTest: false, depthWrite: false }),
    );
    this.healthFill.position.set(0, 0, 0.005);
    this.healthFill.renderOrder = 9;
    healthBack.add(this.healthFill);

    this.focusRing = new THREE.Mesh(
      new THREE.RingGeometry(0.48, 0.58, 24),
      new THREE.MeshBasicMaterial({ color: 0xffca64, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.focusRing.rotation.x = -Math.PI / 2;
    this.focusRing.position.y = 0.035;
    this.focusRing.visible = false;
    this.group.add(this.focusRing);

    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.link = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x8bdcff, transparent: true, opacity: 0.72, depthWrite: false }));
    this.link.visible = false;
    this.link.frustumCulled = false;
    scene.add(this.group, this.link);
  }

  private mesh(geometry: THREE.BufferGeometry, color: number, x: number, y: number, z: number): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color }));
    mesh.position.set(x, y, z);
    this.body.add(mesh);
    return mesh;
  }

  private buildSilhouette(role: SummonRole, elite: boolean): void {
    const bone = elite ? 0xe9efff : 0xb8c2ca;
    const accent = role === 'warrior' ? 0xd78b68 : role === 'guardian' ? 0x78a9bd : 0xa7c979;
    if (role === 'guardian') {
      this.mesh(new THREE.BoxGeometry(0.88, 1.0, 0.6), bone, 0, 1.0, 0);
      this.mesh(new THREE.BoxGeometry(0.68, 0.54, 0.58), accent, 0, 1.72, 0);
      this.mesh(new THREE.BoxGeometry(0.22, 1.25, 0.82), 0x627483, -0.62, 1.0, 0.08);
      this.mesh(new THREE.BoxGeometry(0.18, 0.72, 0.18), bone, 0.35, 0.42, 0);
      this.mesh(new THREE.BoxGeometry(0.18, 0.72, 0.18), bone, -0.35, 0.42, 0);
      return;
    }
    const width = role === 'archer' ? 0.4 : 0.58;
    this.mesh(new THREE.BoxGeometry(width, 0.78, 0.34), bone, 0, 1.05, 0);
    this.mesh(new THREE.BoxGeometry(role === 'archer' ? 0.34 : 0.48, 0.42, 0.42), accent, 0, 1.68, 0);
    this.mesh(new THREE.BoxGeometry(0.15, 0.66, 0.16), bone, -0.16, 0.4, 0);
    this.mesh(new THREE.BoxGeometry(0.15, 0.66, 0.16), bone, 0.16, 0.4, 0);
    if (role === 'warrior') {
      const sword = this.mesh(new THREE.BoxGeometry(0.1, 0.15, 0.9), 0xe4eef4, 0.42, 1.1, 0.25);
      sword.rotation.x = -0.34;
    } else {
      const bow = this.mesh(new THREE.TorusGeometry(0.43, 0.045, 6, 18), 0x9b744b, 0.4, 1.15, 0.08);
      bow.rotation.y = Math.PI / 2;
    }
  }

  update(position: THREE.Vector3, yaw: number, healthRatio: number, elapsed: number): void {
    this.group.position.copy(position);
    this.group.position.y += Math.sin(elapsed * 4.5 + position.x) * 0.025;
    this.body.rotation.y = yaw;
    const ratio = THREE.MathUtils.clamp(healthRatio, 0, 1);
    this.healthFill.scale.x = ratio;
    this.healthFill.position.x = (ratio - 1) * 0.39;
  }

  setFocused(focused: boolean): void {
    this.focusRing.visible = focused;
  }

  setGuardianLink(from: THREE.Vector3 | null, to: THREE.Vector3 | null): void {
    this.link.visible = Boolean(from && to);
    if (!from || !to) return;
    const attribute = this.link.geometry.getAttribute('position') as THREE.BufferAttribute;
    attribute.setXYZ(0, from.x, from.y + 1.15, from.z);
    attribute.setXYZ(1, to.x, to.y + 1.15, to.z);
    attribute.needsUpdate = true;
    this.link.geometry.computeBoundingSphere();
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group, this.link);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.group.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      geometries.add(child.geometry);
      const owned = Array.isArray(child.material) ? child.material : [child.material];
      owned.forEach(material => materials.add(material));
    });
    geometries.add(this.link.geometry);
    const linkMaterials = Array.isArray(this.link.material) ? this.link.material : [this.link.material];
    linkMaterials.forEach(material => materials.add(material));
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
  }
}

