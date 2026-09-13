import * as THREE from 'three';
import { effectTexture } from '../ui/CombatArt';
import { slashRoll } from '../combat/MeleeSwing';

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
  swing?: { orientation: THREE.Quaternion; angle: number };
}

const MAX_PARTICLES = 160;
const MAX_VISUALS = 48;

export class Effects {
  private particles: Particle[] = [];
  private visuals: Visual[] = [];
  private freeParticles: Particle[] = [];
  private freeSprites: Visual[] = [];
  private freePlanes: Visual[] = [];
  private particleGeometry = new THREE.BoxGeometry(1, 1, 1);
  private planeGeometry = new THREE.PlaneGeometry(1, 1);
  particleScale = 1;

  constructor(private scene: THREE.Scene) {}

  burst(position: THREE.Vector3, color: number, count = 14, speed = 4): void {
    this.emitDebris(position, color, count, speed);
    const size = count >= 18 ? 1.65 : count >= 9 ? 1.25 : 0.92;
    this.addBillboard('impact', position, size, 0.24, {
      color,
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

  meleeSlash(position: THREE.Vector3, direction: THREE.Vector3, color = 0xdff4ff, scale = 1, angle = 0.65, duration = 0.22): void {
    const before = this.visuals.length;
    this.addPlane('slash', position, 1.7 * scale, duration, {
      color,
      startScale: 0.72,
      endScale: 1.14,
      opacity: 0.98,
    });
    if (this.visuals.length > before) {
      const visual = this.visuals[this.visuals.length - 1];
      const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.clone().normalize());
      visual.object.quaternion.copy(orientation);
      visual.object.rotateZ(slashRoll(angle, 0));
      visual.swing = { orientation, angle };
    }

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
      const particle=this.takeParticle(0x8ed4ff,.8,false);
      const mesh=particle.mesh;
      mesh.scale.set(0.1, 0.1, 0.38 + Math.random() * 0.2);
      mesh.position.copy(position).addScaledVector(forward, -0.2 - Math.random() * 0.8);
      mesh.position.addScaledVector(right, (Math.random() - 0.5) * 0.7);
      mesh.position.y += (Math.random() - 0.5) * 0.4;
      mesh.rotation.y = Math.atan2(forward.x, forward.z);
      const velocity = particle.velocity.copy(forward).multiplyScalar(-3 - Math.random() * 2);
      velocity.y += (Math.random() - 0.5) * 1.5;
      const life = 0.28 + Math.random() * 0.12;
      particle.life=particle.maxLife=life;
      particle.spin.set(Math.random()*8,Math.random()*8,Math.random()*8);
      this.particles.push(particle);
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

  setFireTrail(position: THREE.Vector3, life: number): void {
    this.addGroundPlane('fire', position, 4.4, life, {
      startScale: .85, endScale: 1, opacity: .36,
      rotationZ: Math.random() * Math.PI * 2,
    });
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
        this.freeParticles.push(particle);
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
      if (visual.swing) {
        visual.object.quaternion.copy(visual.swing.orientation);
        visual.object.rotateZ(slashRoll(visual.swing.angle, progress));
      }
      if (visual.object instanceof THREE.Sprite) {
        (visual.material as THREE.SpriteMaterial).rotation += visual.spin * dt;
      } else {
        visual.object.rotation.z += visual.spin * dt;
      }
      const fadeIn = visual.fadeIn > 0 ? Math.min(1, progress / visual.fadeIn) : 1;
      visual.material.opacity = visual.baseOpacity * fadeIn * Math.pow(1 - progress, 0.72);
      if (visual.life <= 0) {
        this.scene.remove(visual.object);
        this.recycleVisual(visual);
        this.visuals.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const particle of this.particles) { particle.mesh.removeFromParent(); this.freeParticles.push(particle); }
    for (const visual of this.visuals) { visual.object.removeFromParent(); this.recycleVisual(visual); }
    this.particles.length = 0; this.visuals.length = 0;
  }

  /** Full teardown only; changing rooms keeps bounded pools warm. Shared textures are borrowed. */
  dispose(): void {
    this.clear();
    for (const p of this.freeParticles) (p.mesh.material as THREE.Material).dispose();
    for (const v of [...this.freeSprites, ...this.freePlanes]) v.material.dispose();
    this.freeParticles.length=0;this.freeSprites.length=0;this.freePlanes.length=0;
    this.particleGeometry.dispose();this.planeGeometry.dispose();
  }

  private takeParticle(color:number,opacity=1,depthWrite=true):Particle {
    const particle=this.freeParticles.pop() ?? {
      mesh:new THREE.Mesh(this.particleGeometry,new THREE.MeshBasicMaterial({transparent:true})),
      velocity:new THREE.Vector3(),spin:new THREE.Vector3(),life:0,maxLife:0,
    };
    const material=particle.mesh.material as THREE.MeshBasicMaterial;
    material.color.setHex(color);material.opacity=opacity;material.depthWrite=depthWrite;
    particle.mesh.quaternion.identity();particle.mesh.scale.setScalar(1);particle.mesh.visible=true;
    particle.velocity.set(0,0,0);particle.spin.set(0,0,0);
    return particle;
  }

  private recycleVisual(visual:Visual):void {
    visual.swing=undefined;
    (visual.object instanceof THREE.Sprite ? this.freeSprites : this.freePlanes).push(visual);
  }

  private takeVisual(sprite:boolean,name:EffectTexture,color=0xffffff,opacity=1):Visual {
    const pool=sprite?this.freeSprites:this.freePlanes;
    let visual=pool.pop();
    if(!visual){
      const material:EffectMaterial=sprite
        ? new THREE.SpriteMaterial({transparent:true,alphaTest:.04,depthWrite:false,toneMapped:false})
        : new THREE.MeshBasicMaterial({transparent:true,alphaTest:.04,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
      visual={object:sprite?new THREE.Sprite(material as THREE.SpriteMaterial):new THREE.Mesh(this.planeGeometry,material as THREE.MeshBasicMaterial),
        material,life:0,maxLife:0,startScale:new THREE.Vector3(),endScale:new THREE.Vector3(),velocity:new THREE.Vector3(),spin:0,baseOpacity:1,fadeIn:0};
    }
    const texture=effectTexture(name);
    if(!visual.material.map)visual.material.needsUpdate=true;
    visual.material.map=texture;visual.material.color.setHex(color);visual.material.opacity=opacity;
    if(sprite)(visual.material as THREE.SpriteMaterial).rotation=0;
    visual.object.quaternion.identity();visual.object.visible=true;visual.object.renderOrder=3;visual.swing=undefined;
    return visual;
  }

  private emitDebris(position: THREE.Vector3, color: number, count: number, speed: number): void {
    const requested = Math.max(1, Math.round(count * this.particleScale));
    const actualCount = Math.min(requested, Math.max(0, MAX_PARTICLES - this.particles.length));
    for (let i = 0; i < actualCount; i++) {
      const size = 0.08 + Math.random() * 0.12;
      const particle=this.takeParticle(color);
      const mesh=particle.mesh;
      mesh.scale.setScalar(size);
      mesh.position.copy(position);
      const velocity = particle.velocity.set(
        (Math.random() - 0.5) * speed,
        Math.random() * speed,
        (Math.random() - 0.5) * speed,
      );
      const life = 0.45 + Math.random() * 0.4;
      particle.life=particle.maxLife=life;
      particle.spin.set(Math.random()*10,Math.random()*10,Math.random()*10);
      this.particles.push(particle);
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
    const visual=this.takeVisual(true,name,options.color,options.opacity);
    const sprite=visual.object as THREE.Sprite;
    (visual.material as THREE.SpriteMaterial).rotation=options.rotation??0;
    sprite.position.copy(position);
    sprite.renderOrder = 3;
    this.addVisual(visual, size, life, options);
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
    const visual=this.takeVisual(false,name,options.color,options.opacity);
    const mesh=visual.object as THREE.Mesh;
    mesh.position.copy(position);
    mesh.rotation.y = options.rotationY ?? 0;
    mesh.rotation.z = options.rotationZ ?? 0;
    mesh.renderOrder = 3;
    this.addVisual(visual, size, life, options);
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
    const visual=this.takeVisual(false,name,options.color,options.opacity);
    const mesh=visual.object as THREE.Mesh;
    mesh.position.copy(position);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = options.rotationZ ?? 0;
    mesh.renderOrder = 2;
    this.addVisual(visual, size, life, options);
  }

  private addVisual(
    visual: Visual,
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
    visual.startScale.setScalar(size * (options.startScale ?? 1));
    visual.endScale.setScalar(size * (options.endScale ?? 1));
    visual.object.scale.copy(visual.startScale);
    visual.life=visual.maxLife=life;
    if(options.velocity)visual.velocity.copy(options.velocity);else visual.velocity.set(0,0,0);
    visual.spin=options.spin??0;visual.baseOpacity=options.opacity??1;visual.fadeIn=options.fadeIn??0;
    this.visuals.push(visual);this.scene.add(visual.object);
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
