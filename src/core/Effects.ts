import * as THREE from 'three';
import { combatTexture } from '../ui/CombatArt';

type EffectTexture = 'slash' | 'impact' | 'fire' | 'ice' | 'lightning' | 'smoke' | 'shockwave' | 'shadow';
type EffectMaterial = THREE.MeshBasicMaterial | THREE.SpriteMaterial;

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  spin: THREE.Vector3;
}

interface Visual {
  object: THREE.Mesh | THREE.Sprite;
  material: EffectMaterial;
  life: number;
  maxLife: number;
  startScale: THREE.Vector3;
  endScale: THREE.Vector3;
  velocity: THREE.Vector3;
  spin: number;
  baseOpacity: number;
  fadeIn: number;
}

const MAX_PARTICLES = 160;
const MAX_VISUALS = 48;

export class Effects {
  private particles: Particle[] = [];
  private visuals: Visual[] = [];
  private particleGeometry = new THREE.BoxGeometry(1, 1, 1);
  private planeGeometry = new THREE.PlaneGeometry(1, 1);
  particleScale = 1;

  constructor(private scene: THREE.Scene) {}

  burst(position: THREE.Vector3, color: number, count = 14, speed = 4): void {
    this.emitDebris(position, color, count, speed);
    const size = count >= 18 ? 1.65 : count >= 9 ? 1.25 : 0.92;
    this.addBillboard('impact', position, size, 0.24, {
      rotation: Math.random() * Math.PI * 2,
      startScale: 0.42,
      endScale: 1.18,
      opacity: 0.92,
    });
  }

  slash(position: THREE.Vector3, color = 0xdff4ff): void {
    this.addBillboard('slash', position.clone().add(new THREE.Vector3(0, 1.25, 0)), 1.55, 0.24, {
      color,
      rotation: -0.35,
      startScale: 0.78,
      endScale: 1.18,
      opacity: 0.96,
      spin: 1.2,
    });
  }

  meleeSlash(position: THREE.Vector3, direction: THREE.Vector3, color = 0xdff4ff, scale = 1): void {
    const yaw = Math.atan2(direction.x, direction.z);
    this.addPlane('slash', position, 1.7 * scale, 0.22, {
      color,
      rotationY: yaw,
      rotationZ: -0.2,
      startScale: 0.72,
      endScale: 1.14,
      opacity: 0.98,
    });

    const accent = this.elementAccent(color);
    if (accent) {
      this.addBillboard(accent, position.clone().addScaledVector(direction, 0.18), 0.72 * scale, 0.2, {
        startScale: 0.35,
        endScale: 1.08,
        opacity: 0.78,
      });
    }
  }

  whirlwind(position: THREE.Vector3, direction: THREE.Vector3): void {
    const yaw = -Math.atan2(direction.x, direction.z);
    this.addGroundPlane('shockwave', position.clone().add(new THREE.Vector3(0, -0.92, 0)), 2.4, 0.42, {
      rotationZ: yaw,
      startScale: 0.45,
      endScale: 1.55,
      opacity: 0.84,
      spin: 2.4,
    });
    this.addBillboard('slash', position, 2.35, 0.34, {
      color: 0x9ee7ff,
      rotation: yaw,
      startScale: 0.68,
      endScale: 1.2,
      opacity: 0.82,
      spin: -2.8,
    });
    this.emitDebris(position, 0x9ee7ff, 18, 3.6);
  }

  dashTrail(position: THREE.Vector3, direction: THREE.Vector3): void {
    const forward = direction.clone().normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const count = Math.min(9, Math.max(0, MAX_PARTICLES - this.particles.length));
    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x8ed4ff,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.particleGeometry, material);
      mesh.scale.set(0.1, 0.1, 0.38 + Math.random() * 0.2);
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

    for (let i = 0; i < 3; i++) {
      const smokePosition = position.clone()
        .addScaledVector(forward, -0.35 - i * 0.32)
        .addScaledVector(right, (Math.random() - 0.5) * 0.5);
      this.addBillboard('smoke', smokePosition, 0.55 + i * 0.1, 0.38 + i * 0.04, {
        color: 0xa9dfff,
        rotation: Math.random() * Math.PI * 2,
        startScale: 0.45,
        endScale: 1.22,
        opacity: 0.55,
        velocity: forward.clone().multiplyScalar(-0.8).add(new THREE.Vector3(0, 0.45, 0)),
        spin: (Math.random() - 0.5) * 1.5,
      });
    }
  }

  explosion(position: THREE.Vector3, color: number): void {
    this.emitDebris(position, color, 26, 6);
    const element = this.closestElementTexture(color);
    this.addBillboard(element, position, element === 'shadow' ? 2.4 : 2.05, 0.42, {
      rotation: Math.random() * Math.PI * 2,
      startScale: 0.28,
      endScale: 1.25,
      opacity: 0.96,
      spin: element === 'shadow' ? 1.8 : 0.45,
    });
    this.addGroundPlane('shockwave', position.clone().add(new THREE.Vector3(0, -0.78, 0)), 2.25, 0.4, {
      startScale: 0.35,
      endScale: 1.5,
      opacity: 0.75,
      rotationZ: Math.random() * Math.PI * 2,
    });
    if (element === 'fire') {
      this.addBillboard('smoke', position.clone().add(new THREE.Vector3(0, 0.35, 0)), 1.25, 0.58, {
        startScale: 0.35,
        endScale: 1.2,
        opacity: 0.48,
        velocity: new THREE.Vector3(0, 0.75, 0),
        rotation: Math.random() * Math.PI * 2,
        spin: 0.7,
      });
    }
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

    for (let i = this.visuals.length - 1; i >= 0; i--) {
      const visual = this.visuals[i];
      visual.life -= dt;
      const progress = THREE.MathUtils.clamp(1 - visual.life / visual.maxLife, 0, 1);
      const eased = 1 - (1 - progress) * (1 - progress);
      visual.object.scale.lerpVectors(visual.startScale, visual.endScale, eased);
      visual.object.position.addScaledVector(visual.velocity, dt);
      if (visual.object instanceof THREE.Sprite) {
        (visual.material as THREE.SpriteMaterial).rotation += visual.spin * dt;
      } else {
        visual.object.rotation.z += visual.spin * dt;
      }
      const fadeIn = visual.fadeIn > 0 ? Math.min(1, progress / visual.fadeIn) : 1;
      visual.material.opacity = visual.baseOpacity * fadeIn * Math.pow(1 - progress, 0.72);
      if (visual.life <= 0) {
        this.scene.remove(visual.object);
        visual.material.dispose();
        this.visuals.splice(i, 1);
      }
    }
  }

  clear(): void {
    this.particles.forEach((particle) => {
      this.scene.remove(particle.mesh);
      (particle.mesh.material as THREE.Material).dispose();
    });
    this.visuals.forEach((visual) => {
      this.scene.remove(visual.object);
      visual.material.dispose();
    });
    this.particles = [];
    this.visuals = [];
  }

  private emitDebris(position: THREE.Vector3, color: number, count: number, speed: number): void {
    const requested = Math.max(1, Math.round(count * this.particleScale));
    const actualCount = Math.min(requested, Math.max(0, MAX_PARTICLES - this.particles.length));
    for (let i = 0; i < actualCount; i++) {
      const size = 0.08 + Math.random() * 0.12;
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(this.particleGeometry, material);
      mesh.scale.setScalar(size);
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

  private addBillboard(
    name: EffectTexture,
    position: THREE.Vector3,
    size: number,
    life: number,
    options: {
      color?: number;
      rotation?: number;
      startScale?: number;
      endScale?: number;
      opacity?: number;
      fadeIn?: number;
      velocity?: THREE.Vector3;
      spin?: number;
    } = {},
  ): void {
    if (this.visuals.length >= MAX_VISUALS) return;
    const material = new THREE.SpriteMaterial({
      map: combatTexture('effects', name),
      color: options.color ?? 0xffffff,
      transparent: true,
      opacity: options.opacity ?? 1,
      alphaTest: 0.04,
      depthWrite: false,
      rotation: options.rotation ?? 0,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.renderOrder = 3;
    this.addVisual(sprite, material, size, life, options);
  }

  private addPlane(
    name: EffectTexture,
    position: THREE.Vector3,
    size: number,
    life: number,
    options: {
      color?: number;
      rotationY?: number;
      rotationZ?: number;
      startScale?: number;
      endScale?: number;
      opacity?: number;
      fadeIn?: number;
      velocity?: THREE.Vector3;
      spin?: number;
    } = {},
  ): void {
    if (this.visuals.length >= MAX_VISUALS) return;
    const material = this.makePlaneMaterial(name, options.color, options.opacity);
    const mesh = new THREE.Mesh(this.planeGeometry, material);
    mesh.position.copy(position);
    mesh.rotation.y = options.rotationY ?? 0;
    mesh.rotation.z = options.rotationZ ?? 0;
    mesh.renderOrder = 3;
    this.addVisual(mesh, material, size, life, options);
  }

  private addGroundPlane(
    name: EffectTexture,
    position: THREE.Vector3,
    size: number,
    life: number,
    options: {
      color?: number;
      rotationZ?: number;
      startScale?: number;
      endScale?: number;
      opacity?: number;
      fadeIn?: number;
      velocity?: THREE.Vector3;
      spin?: number;
    } = {},
  ): void {
    if (this.visuals.length >= MAX_VISUALS) return;
    const material = this.makePlaneMaterial(name, options.color, options.opacity);
    const mesh = new THREE.Mesh(this.planeGeometry, material);
    mesh.position.copy(position);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = options.rotationZ ?? 0;
    mesh.renderOrder = 2;
    this.addVisual(mesh, material, size, life, options);
  }

  private makePlaneMaterial(name: EffectTexture, color?: number, opacity = 1): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      map: combatTexture('effects', name),
      color: color ?? 0xffffff,
      transparent: true,
      opacity,
      alphaTest: 0.04,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
  }

  private addVisual(
    object: THREE.Mesh | THREE.Sprite,
    material: EffectMaterial,
    size: number,
    life: number,
    options: {
      startScale?: number;
      endScale?: number;
      opacity?: number;
      fadeIn?: number;
      velocity?: THREE.Vector3;
      spin?: number;
    },
  ): void {
    const startScale = new THREE.Vector3().setScalar(size * (options.startScale ?? 1));
    const endScale = new THREE.Vector3().setScalar(size * (options.endScale ?? 1));
    object.scale.copy(startScale);
    this.visuals.push({
      object,
      material,
      life,
      maxLife: life,
      startScale,
      endScale,
      velocity: options.velocity?.clone() ?? new THREE.Vector3(),
      spin: options.spin ?? 0,
      baseOpacity: options.opacity ?? 1,
      fadeIn: options.fadeIn ?? 0,
    });
    this.scene.add(object);
  }

  private closestElementTexture(color: number): EffectTexture {
    const candidates: Array<[EffectTexture, number]> = [
      ['fire', 0xff7a2a],
      ['ice', 0x8ed4ff],
      ['lightning', 0xffe14d],
      ['smoke', 0x66d17a],
      ['shadow', 0x9b5bff],
    ];
    let closest = candidates[0];
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const distance = this.colorDistanceSquared(color, candidate[1]);
      if (distance < closestDistance) {
        closest = candidate;
        closestDistance = distance;
      }
    }
    return closest[0];
  }

  private elementAccent(color: number): EffectTexture | null {
    const element = this.closestElementTexture(color);
    const canonical: Partial<Record<EffectTexture, number>> = {
      fire: 0xff7a2a,
      ice: 0x8ed4ff,
      lightning: 0xffe14d,
      smoke: 0x66d17a,
      shadow: 0x9b5bff,
    };
    const canonicalColor = canonical[element];
    return canonicalColor !== undefined && this.colorDistanceSquared(color, canonicalColor) < 70 * 70 ? element : null;
  }

  private colorDistanceSquared(a: number, b: number): number {
    const red = ((a >> 16) & 0xff) - ((b >> 16) & 0xff);
    const green = ((a >> 8) & 0xff) - ((b >> 8) & 0xff);
    const blue = (a & 0xff) - (b & 0xff);
    return red * red + green * green + blue * blue;
  }
}
