import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  spin: THREE.Vector3;
}

interface Ring {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

export class Effects {
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private geometryCache = new Map<number, THREE.BoxGeometry>();
  particleScale = 1;

  constructor(private scene: THREE.Scene) {}

  burst(position: THREE.Vector3, color: number, count = 14, speed = 4): void {
    const actualCount = Math.max(1, Math.round(count * this.particleScale));
    for (let i = 0; i < actualCount; i++) {
      const size = 0.08 + Math.random() * 0.12;
      let geometry = this.geometryCache.get(actualCount);
      if (!geometry) {
        geometry = new THREE.BoxGeometry(size, size, size);
        this.geometryCache.set(actualCount, geometry);
      }
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color }));
      mesh.position.copy(position);
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * speed,
        Math.random() * speed,
        (Math.random() - 0.5) * speed,
      );
      const life = 0.45 + Math.random() * 0.4;
      this.particles.push({
        mesh,
        velocity,
        life,
        maxLife: life,
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
      });
      this.scene.add(mesh);
    }
  }

  slash(position: THREE.Vector3, color = 0xdff4ff): void {
    const geometry = new THREE.TorusGeometry(0.65, 0.08, 6, 18, Math.PI);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.position.y += 1.25;
    const life = 0.22;
    this.rings.push({ mesh, life, maxLife: life });
    this.scene.add(mesh);
  }

  meleeSlash(position: THREE.Vector3, direction: THREE.Vector3, color = 0xdff4ff, scale = 1): void {
    const geometry = new THREE.TorusGeometry(0.72, 0.07, 6, 18, Math.PI);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.rotation.y = Math.atan2(direction.x, direction.z);
    mesh.scale.setScalar(scale);
    const life = 0.2;
    this.rings.push({ mesh, life, maxLife: life });
    this.scene.add(mesh);
  }

  whirlwind(position: THREE.Vector3, direction: THREE.Vector3): void {
    const geometry = new THREE.RingGeometry(0.6, 1.55, 28);
    const material = new THREE.MeshBasicMaterial({
      color: 0x9ee7ff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -Math.atan2(direction.x, direction.z);
    const life = 0.38;
    this.rings.push({ mesh, life, maxLife: life });
    this.scene.add(mesh);
    this.burst(position, 0x9ee7ff, 18, 3.6);
  }

  dashTrail(position: THREE.Vector3, direction: THREE.Vector3): void {
    const forward = direction.clone().normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    for (let i = 0; i < 12; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x8ed4ff,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });
      const geometry = new THREE.BoxGeometry(0.12, 0.12, 0.6);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(position).addScaledVector(forward, -0.2 - Math.random() * 0.8);
      mesh.position.addScaledVector(right, (Math.random() - 0.5) * 0.7);
      mesh.position.y += (Math.random() - 0.5) * 0.4;
      mesh.rotation.y = Math.atan2(forward.x, forward.z);
      const velocity = forward.clone().multiplyScalar(-3 - Math.random() * 2);
      velocity.y += (Math.random() - 0.5) * 1.5;
      const life = 0.28 + Math.random() * 0.12;
      this.particles.push({
        mesh,
        velocity,
        life,
        maxLife: life,
        spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
      });
      this.scene.add(mesh);
    }
  }

  explosion(position: THREE.Vector3, color: number): void {
    this.burst(position, color, 26, 6);
    const geometry = new THREE.SphereGeometry(0.35, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    const life = 0.35;
    this.rings.push({ mesh, life, maxLife: life });
    this.scene.add(mesh);
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.life -= dt;
      particle.velocity.y -= 10 * dt;
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      particle.mesh.rotation.x += particle.spin.x * dt;
      particle.mesh.rotation.y += particle.spin.y * dt;
      const material = particle.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, particle.life / particle.maxLife);
      if (particle.life <= 0) {
        this.scene.remove(particle.mesh);
        material.dispose();
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.life -= dt;
      const scale = 1 + (1 - ring.life / ring.maxLife) * 1.7;
      ring.mesh.scale.setScalar(scale);
      const material = ring.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, ring.life / ring.maxLife);
      if (ring.life <= 0) {
        this.scene.remove(ring.mesh);
        ring.mesh.geometry.dispose();
        material.dispose();
        this.rings.splice(i, 1);
      }
    }
  }

  clear(): void {
    this.particles.forEach((particle) => {
      this.scene.remove(particle.mesh);
      const material = particle.mesh.material as THREE.MeshBasicMaterial;
      material.dispose();
    });
    this.rings.forEach((ring) => {
      this.scene.remove(ring.mesh);
      ring.mesh.geometry.dispose();
      const material = ring.mesh.material as THREE.MeshBasicMaterial;
      material.dispose();
    });
    this.particles = [];
    this.rings = [];
  }
}
