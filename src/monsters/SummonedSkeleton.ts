import * as THREE from 'three';
import type { Monster } from './Monster';
import type { Player } from '../player/Player';

export class SummonedSkeleton {
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3();
  life = 8;
  attackCooldown = 0;
  private material: THREE.MeshLambertMaterial;

  constructor(scene: THREE.Scene, x: number, z: number) {
    this.position.set(x, 0, z);
    this.material = new THREE.MeshLambertMaterial({ color: 0xe8e4d6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.32), this.material);
    body.position.y = 1.0;
    this.group.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.42), this.material);
    head.position.y = 1.68;
    this.group.add(head);
    const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.68), new THREE.MeshLambertMaterial({ color: 0xb8c3cc }));
    weapon.position.set(0.28, 1.18, 0.3);
    this.group.add(weapon);
    this.group.position.copy(this.position);
    scene.add(this.group);
  }

  update(dt: number, monsters: Monster[], player: Player, elapsed: number): Monster | null {
    this.life -= dt;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.group.position.copy(this.position);
    this.group.position.y = Math.sin(elapsed * 5) * 0.06;

    let target: Monster | null = null;
    let bestDistance = 10;
    for (const monster of monsters) {
      if (monster.dead) continue;
      const distance = monster.position.distanceTo(this.position);
      if (distance < bestDistance) {
        bestDistance = distance;
        target = monster;
      }
    }

    if (target) {
      const dx = target.position.x - this.position.x;
      const dz = target.position.z - this.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 1.4) {
        const speed = 3.2 * dt;
        this.position.x += (dx / distance) * speed;
        this.position.z += (dz / distance) * speed;
        this.group.rotation.y = Math.atan2(dx, dz);
      } else if (this.attackCooldown <= 0) {
        this.attackCooldown = 1.1;
        return target;
      }
    } else {
      const dx = player.position.x - this.position.x;
      const dz = player.position.z - this.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 1.2) {
        this.position.x += (dx / Math.max(0.01, distance)) * 2.8 * dt;
        this.position.z += (dz / Math.max(0.01, distance)) * 2.8 * dt;
      }
    }
    return null;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }
}
