import { HealthBarBreak } from './HealthBarBreak';
import { BurnVisual } from './BurnVisual';
import { combatTexture, decorateTelegraph } from '../ui/CombatArt';
import * as THREE from 'three';
import type { ActorStatus, MonsterDefinition } from '../types';
import { applyStatus, updateStatuses } from '../combat/ElementSystem';

export type MonsterState = 'idle' | 'patrol' | 'chase' | 'attack' | 'death';

let nextMonsterId = 1;

// Shared UI textures stay alive across rooms; individual monsters only own materials.
function overlayTexture(name: string): THREE.Texture {
  const texture = new THREE.TextureLoader().load(import.meta.env.BASE_URL + 'assets/ui/sunlit/' + name + '.webp');
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  return texture;
}
const BAR_FRAME = overlayTexture('bar-track-frame');
const BAR_FILL = overlayTexture('health');

interface PartRef {
  mesh: THREE.Object3D;
  basePosition: THREE.Vector3;
  baseRotation: THREE.Euler;
  phase: number;
  amplitude: number;
  speed: number;
}

export class Monster {
  roomId = '';
  private attackWarning: THREE.Mesh;
  private statusIcons = new Map<string, THREE.Sprite>();
  readonly id: number;
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  health: number;
  maxHealth: number;
  state: MonsterState = 'idle';
  attackCooldown = 0;
  attackWindup = 0;
  hitFlash = 0;
  dead = false;
  removalTimer = 0;
  homePosition: THREE.Vector3;
  lastKnownPlayer: THREE.Vector3 | null = null;
  lostTargetTimer = 0;
  elite = false;
  eliteModifiers: string[] = [];
  speedMultiplier = 1;
  slowMultiplier = 1;
  extraLightningMultiplier = 1;
  statuses: ActorStatus[] = [];
  private bobPhase = Math.random() * Math.PI * 2;
  private bodyGroup = new THREE.Group();
  private material: THREE.MeshLambertMaterial;
  private burnVisual: BurnVisual | null = null;
  private healthFill!: THREE.Sprite;
  private healthBarBreak!: HealthBarBreak;
  private healthBarBg!: THREE.Sprite;
  private nameSprite!: THREE.Sprite;
  private parts: PartRef[] = [];
  private auraRing!: THREE.Mesh;
  private facingX = 0;
  private facingZ = 0;
  private facingEnabled = false;

  constructor(public def: MonsterDefinition, x: number, z: number) {
    this.id = nextMonsterId++;
    this.position.set(x, 0, z);
    this.homePosition = new THREE.Vector3(x, 0, z);
    this.maxHealth = Math.max(1, def.health);
    this.health = this.maxHealth;
    this.material = new THREE.MeshLambertMaterial({ color: def.color });
    this.group.add(this.bodyGroup);
    this.buildModel();
    this.buildHealthBar();
    this.attackWarning = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 32),
      new THREE.MeshBasicMaterial({ color: 0xff7c59, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
    this.attackWarning.rotation.x = -Math.PI / 2;
    decorateTelegraph(this.attackWarning, 'circle', 1.9);
    this.attackWarning.position.y = 0.04;
    this.attackWarning.visible = false;
    this.group.add(this.attackWarning);
    this.group.position.copy(this.position);
  }

  private buildHealthBar(): void {
    const bgMaterial = new THREE.SpriteMaterial({ map: BAR_FRAME, depthTest: false, depthWrite: false, transparent: true, toneMapped: false });
    const bg = new THREE.Sprite(bgMaterial);
    bg.scale.set(0.95, 0.12, 1);
    bg.renderOrder = 10;
    this.healthBarBg = bg;

    const fillMaterial = new THREE.SpriteMaterial({ map: BAR_FILL, depthTest: false, depthWrite: false, transparent: true, toneMapped: false });
    const fill = new THREE.Sprite(fillMaterial);
    fill.scale.set(0.93, 0.65, 1);
    fill.center.set(0.5, 0.5);
    fill.position.x = 0;
    fill.renderOrder = 11;
    fill.position.y = 0;
    fill.position.z = 0.001;
    bg.add(fill);
    this.group.add(bg);
    this.healthFill = fill;
    this.healthBarBreak = new HealthBarBreak(bg);
    this.buildNameSprite();
    this.updateOverlayHeights();
  }

  private buildNameSprite(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(8, 8, canvas.width - 16, canvas.height - 16);
    ctx.fillStyle = this.def.behavior === 'boss' ? '#ffd76a' : '#f0f4f8';
    ctx.fillText(this.def.name, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
    this.nameSprite = new THREE.Sprite(material);
    this.nameSprite.userData.ownsTexture = true;
    this.nameSprite.scale.set(1.1, 0.22, 1);
    this.group.add(this.nameSprite);
  }

  private updateOverlayHeights(): void {
    const box = new THREE.Box3().setFromObject(this.bodyGroup);
    const bodyHeight = Math.max(0.7, box.max.y - box.min.y);
    this.healthBarBg.position.y = bodyHeight + 0.28;
    this.nameSprite.position.y = bodyHeight + 0.48;
  }

  private addBox(
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    color?: number,
    opts: { phase?: number; amplitude?: number; speed?: number; part?: boolean } = {},
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      color === undefined ? this.material : new THREE.MeshLambertMaterial({ color }),
    );
    mesh.position.set(x, y, z);
    this.bodyGroup.add(mesh);
    if (opts.part) {
      this.parts.push({
        mesh,
        basePosition: mesh.position.clone(),
        baseRotation: mesh.rotation.clone(),
        phase: opts.phase ?? Math.random() * Math.PI * 2,
        amplitude: opts.amplitude ?? 0,
        speed: opts.speed ?? 1,
      });
    }
    return mesh;
  }

  private buildModel(): void {
    const id = this.def.id;
    const behavior = this.def.behavior;

    if (id === 'slime') {
      this.bodyGroup.scale.setScalar(0.95);
      this.addBox(0.92, 0.72, 0.92, 0, 0.42, 0, undefined, { amplitude: 0.1, speed: 3, part: true });
      this.addBox(0.26, 0.14, 0.14, -0.18, 0.58, 0.36, 0x0f2f18);
      this.addBox(0.26, 0.14, 0.14, 0.18, 0.58, 0.36, 0x0f2f18);
      return;
    }

    if (id === 'zombie') {
      this.addBox(0.62, 0.78, 0.38, 0, 1.02, 0, 0x4c7a3f);
      this.addBox(0.5, 0.46, 0.46, 0, 1.7, 0, 0x4c7a3f);
      this.addBox(0.2, 0.62, 0.2, -0.4, 1.02, 0, 0x4c7a3f, { part: true, amplitude: 0.18, speed: 3 });
      this.addBox(0.2, 0.45, 0.2, 0.4, 1.1, 0, 0x4c7a3f, { part: true, amplitude: 0.22, speed: 3.4 });
      this.addBox(0.22, 0.64, 0.22, -0.14, 0.32, 0, 0x34432e);
      this.addBox(0.22, 0.64, 0.22, 0.14, 0.32, 0, 0x34432e);
      return;
    }

    if (id === 'skeleton') {
      this.addBox(0.42, 0.62, 0.32, 0, 1.0, 0, 0xdbd5c7);
      this.addBox(0.42, 0.4, 0.42, 0, 1.68, 0, 0xf2eee3);
      this.addBox(0.12, 0.1, 0.08, -0.13, 1.74, 0.21, 0x0b0b0b);
      this.addBox(0.12, 0.1, 0.08, 0.13, 1.74, 0.21, 0x0b0b0b);
      this.addBox(0.17, 0.5, 0.17, -0.28, 0.96, 0, 0xdbd5c7, { part: true, amplitude: 0.16, speed: 4 });
      this.addBox(0.17, 0.5, 0.17, 0.28, 0.96, 0, 0xdbd5c7, { part: true, amplitude: 0.16, speed: 4 });
      this.addBox(0.18, 0.62, 0.18, -0.12, 0.3, 0, 0xdbd5c7);
      this.addBox(0.18, 0.62, 0.18, 0.12, 0.3, 0, 0xdbd5c7);
      const bow = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.98, 0.07), new THREE.MeshLambertMaterial({ color: 0x7a4b22 }));
      bow.position.set(0.4, 1.1, 0.28);
      this.bodyGroup.add(bow);
      return;
    }

    if (id === 'demon') {
      this.bodyGroup.scale.setScalar(1.05);
      this.addBox(0.62, 0.8, 0.42, 0, 1.05, 0, 0x5a1d2a);
      this.addBox(0.48, 0.48, 0.46, 0, 1.72, 0, 0x6b2430);
      this.addBox(0.22, 0.68, 0.2, -0.4, 1.02, 0, 0x5a1d2a, { part: true, amplitude: 0.22, speed: 4 });
      this.addBox(0.22, 0.68, 0.2, 0.4, 1.02, 0, 0x5a1d2a, { part: true, amplitude: 0.22, speed: 4 });
      this.addBox(0.24, 0.7, 0.22, -0.15, 0.34, 0, 0x42141d);
      this.addBox(0.24, 0.7, 0.22, 0.15, 0.34, 0, 0x42141d);
      this.addBox(0.34, 0.18, 0.16, 0.2, 1.98, 0, 0x3b1420);
      this.addBox(0.34, 0.18, 0.16, -0.2, 1.98, 0, 0x3b1420);
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.65, 4), new THREE.MeshLambertMaterial({ color: 0x3b1420 }));
      wing.position.set(-0.42, 1.55, -0.18);
      wing.rotation.z = 0.8;
      this.bodyGroup.add(wing);
      const wing2 = wing.clone();
      wing2.position.x = 0.42;
      wing2.rotation.z = -0.8;
      this.bodyGroup.add(wing2);
      return;
    }

    if (id === 'golem') {
      this.bodyGroup.scale.setScalar(1.05);
      this.addBox(1.02, 1.02, 0.72, 0, 0.95, 0, 0x6d6f76);
      this.addBox(0.46, 0.44, 0.46, 0, 1.72, 0, 0x5c5e65);
      this.addBox(0.25, 0.72, 0.25, -0.58, 0.9, 0, 0x6d6f76, { part: true, amplitude: 0.12, speed: 2.5 });
      this.addBox(0.25, 0.72, 0.25, 0.58, 0.9, 0, 0x6d6f76, { part: true, amplitude: 0.12, speed: 2.5 });
      this.addBox(0.3, 0.55, 0.28, -0.22, 0.28, 0, 0x53555a);
      this.addBox(0.3, 0.55, 0.28, 0.22, 0.28, 0, 0x53555a);
      return;
    }

    if (id === 'orc_warrior') {
      this.bodyGroup.scale.setScalar(1.08);
      this.addBox(0.68, 0.84, 0.46, 0, 1.08, 0, 0x4f6a3a);
      this.addBox(0.52, 0.5, 0.5, 0, 1.76, 0, 0x5c7b45);
      this.addBox(0.24, 0.72, 0.24, -0.46, 1.02, 0, 0x4f6a3a, { part: true, amplitude: 0.18, speed: 3.2 });
      this.addBox(0.24, 0.72, 0.24, 0.46, 1.02, 0, 0x4f6a3a, { part: true, amplitude: 0.18, speed: 3.2 });
      this.addBox(0.26, 0.72, 0.26, -0.17, 0.36, 0, 0x394b2b);
      this.addBox(0.26, 0.72, 0.26, 0.17, 0.36, 0, 0x394b2b);
      const axe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.8), new THREE.MeshLambertMaterial({ color: 0x8a949f }));
      axe.position.set(0.52, 1.28, 0.42);
      this.bodyGroup.add(axe);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), new THREE.MeshLambertMaterial({ color: 0x5a3c24 }));
      handle.position.set(0.52, 1.0, 0.42);
      this.bodyGroup.add(handle);
      return;
    }

    if (id === 'poison_spitter') {
      this.bodyGroup.scale.setScalar(1.02);
      this.addBox(0.58, 0.62, 0.4, 0, 0.9, 0, 0x4f7336);
      this.addBox(0.46, 0.44, 0.46, 0, 1.52, 0, 0x6c9b48);
      this.addBox(0.2, 0.5, 0.2, -0.34, 0.82, 0, 0x4f7336, { part: true, amplitude: 0.15, speed: 4 });
      this.addBox(0.2, 0.5, 0.2, 0.34, 0.82, 0, 0x4f7336, { part: true, amplitude: 0.15, speed: 4 });
      this.addBox(0.28, 0.28, 0.3, 0, 0.3, 0.35, 0x6aa332);
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.42, 8), new THREE.MeshLambertMaterial({ color: 0x8b6a2a }));
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(0, 1.24, 0.55);
      this.bodyGroup.add(nozzle);
      return;
    }

    if (id === 'fire_elemental') {
      this.bodyGroup.scale.setScalar(1.05);
      this.addBox(0.82, 0.78, 0.72, 0, 0.9, 0, 0x8a2e18);
      this.addBox(0.5, 0.42, 0.42, 0, 1.6, 0, 0xa43a1e);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 6), new THREE.MeshLambertMaterial({ color: 0xff9c1e }));
      flame.position.set(0, 1.95, 0);
      this.bodyGroup.add(flame);
      this.parts.push({ mesh: flame, basePosition: flame.position.clone(), baseRotation: flame.rotation.clone(), phase: 0, amplitude: 0.12, speed: 5 });
      return;
    }

    if (id === 'shadow_wraith') {
      this.bodyGroup.scale.setScalar(1.05);
      this.addBox(0.42, 1.02, 0.32, 0, 1.15, 0, 0x2d3148);
      this.addBox(0.38, 0.42, 0.36, 0, 1.92, 0, 0x3a405f);
      this.addBox(0.14, 0.9, 0.14, -0.34, 1.15, 0, 0x2d3148, { part: true, amplitude: 0.18, speed: 5 });
      this.addBox(0.14, 0.9, 0.14, 0.34, 1.15, 0, 0x2d3148, { part: true, amplitude: 0.18, speed: 5 });
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 5), new THREE.MeshLambertMaterial({ color: 0x4a3d72 }));
      tail.position.set(0, 0.55, -0.32);
      tail.rotation.x = -0.6;
      this.bodyGroup.add(tail);
      return;
    }

    if (id === 'lich') {
      this.bodyGroup.scale.setScalar(1.05);
      this.addBox(0.5, 0.8, 0.36, 0, 1.05, 0, 0x2d3148);
      this.addBox(0.44, 0.44, 0.44, 0, 1.72, 0, 0x4a3d72);
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.5, 6), new THREE.MeshLambertMaterial({ color: 0x352b58 }));
      hood.position.set(0, 1.98, 0);
      this.bodyGroup.add(hood);
      this.addBox(0.18, 0.56, 0.18, -0.38, 1.04, 0, 0x2d3148, { part: true, amplitude: 0.16, speed: 3.6 });
      this.addBox(0.18, 0.56, 0.18, 0.38, 1.04, 0, 0x2d3148, { part: true, amplitude: 0.16, speed: 3.6 });
      this.addBox(0.2, 0.62, 0.2, -0.12, 0.31, 0, 0x24283a);
      this.addBox(0.2, 0.62, 0.2, 0.12, 0.31, 0, 0x24283a);
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), new THREE.MeshLambertMaterial({ color: 0x6b3fa0 }));
      staff.position.set(0.42, 1.2, 0.16);
      staff.rotation.z = -0.18;
      this.bodyGroup.add(staff);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), new THREE.MeshBasicMaterial({ color: 0xb56bff }));
      orb.position.set(0.52, 1.78, 0.16);
      this.bodyGroup.add(orb);
      return;
    }

    if (behavior === 'boss') {
      this.bodyGroup.scale.setScalar(1.45);
      this.addBox(0.82, 0.98, 0.52, 0, 1.05, 0, 0x373a4d);
      this.addBox(0.62, 0.62, 0.6, 0, 1.92, 0, 0x4d4e63);
      this.addBox(0.28, 0.8, 0.24, -0.62, 1.08, 0, 0x373a4d, { part: true, amplitude: 0.18, speed: 3 });
      this.addBox(0.28, 0.8, 0.24, 0.62, 1.08, 0, 0x373a4d, { part: true, amplitude: 0.18, speed: 3 });
      this.addBox(0.32, 0.82, 0.28, -0.24, 0.4, 0, 0x2d3042);
      this.addBox(0.32, 0.82, 0.28, 0.24, 0.4, 0, 0x2d3042);
      this.addBox(0.46, 0.2, 0.18, 0.28, 2.18, 0, 0x181b2a);
      this.addBox(0.46, 0.2, 0.18, -0.28, 2.18, 0, 0x181b2a);
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshBasicMaterial({ color: 0xb56bff }));
      core.position.set(0, 1.55, 0.34);
      this.bodyGroup.add(core);
      this.parts.push({ mesh: core, basePosition: core.position.clone(), baseRotation: core.rotation.clone(), phase: 0, amplitude: 0.08, speed: 4 });
      return;
    }

    const scale = behavior === 'charger' ? 1.1 : 1;
    this.bodyGroup.scale.setScalar(scale);
    this.addBox(0.55, 0.72, 0.42, 0, 1.02, 0);
    this.addBox(0.48, 0.46, 0.46, 0, 1.68, 0);
    this.addBox(0.2, 0.62, 0.2, -0.38, 1.05, 0, undefined, { part: true, amplitude: 0.17, speed: 3.2 });
    this.addBox(0.2, 0.62, 0.2, 0.38, 1.05, 0, undefined, { part: true, amplitude: 0.17, speed: 3.2 });
    this.addBox(0.22, 0.65, 0.22, -0.14, 0.3, 0);
    this.addBox(0.22, 0.65, 0.22, 0.14, 0.3, 0);
  }

  setElite(modifiers: string[]): void {
    this.elite = true;
    this.eliteModifiers = modifiers;
    this.material.color.setHex(0xff8a1e);
    this.bodyGroup.scale.multiplyScalar(1.15);
    this.updateOverlayHeights();
    const crest = new THREE.Sprite(new THREE.SpriteMaterial({ map: combatTexture('telegraphs', 'elite'), transparent: true, depthWrite: false, toneMapped: false }));
    crest.scale.set(.38, .38, 1);
    crest.position.set(-.67, this.healthBarBg.position.y + .04, 0);
    this.group.add(crest);
    if (modifiers.includes('fast')) this.speedMultiplier = 1.4;
    const auraGeometry = new THREE.RingGeometry(0.62, 0.78, 24);
    const auraMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb84d,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.auraRing = new THREE.Mesh(auraGeometry, auraMaterial);
    this.auraRing.rotation.x = -Math.PI / 2;
    this.auraRing.position.y = 0.12;
    this.group.add(this.auraRing);
  }

  faceToward(x: number, z: number): void {
    this.facingX = x;
    this.facingZ = z;
    this.facingEnabled = true;
  }

  clearFacing(): void {
    this.facingEnabled = false;
  }

  applyStatus(status: ActorStatus): void {
    applyStatus(this, status);
  }

  update(dt: number, elapsed: number): void {
    this.healthBarBreak.update(dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.attackWindup = Math.max(0, this.attackWindup - dt);
    this.attackWarning.visible = !this.dead && this.state === 'attack' && this.attackWindup > 0 && this.def.behavior !== 'boss';
    this.attackWarning.scale.setScalar(this.def.behavior === 'ranged' ? 0.8 : this.def.attackRange + 0.5);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.lostTargetTimer = Math.max(0, this.lostTargetTimer - dt);

    const healthBeforeStatuses = this.dead ? 0 : this.health;
    const statusResult = updateStatuses(this, dt, this.def.resistances);
    this.slowMultiplier = statusResult.slowMultiplier;
    this.extraLightningMultiplier = statusResult.extraLightningMultiplier;
    for (const icon of this.statusIcons.values()) icon.visible = false;
    let statusIndex = 0;
    for (const status of this.statuses) {
      if (this.dead || status.duration <= 0 || status.type === 'bleeding') continue;
      let icon = this.statusIcons.get(status.type);
      if (!icon) {
        icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: combatTexture('statuses', status.type), transparent: true, depthWrite: false, toneMapped: false }));
        icon.scale.set(.28, .28, 1);
        this.statusIcons.set(status.type, icon);
        this.group.add(icon);
      }
      icon.visible = true;
      icon.position.set(-.4 + statusIndex++ * .28, this.healthBarBg.position.y + .23, 0);
    }
    if (statusResult.damage > 0 && !this.dead) {
      this.takeDamage(statusResult.damage, false);
    }

    const burning = !this.dead && this.statuses.some(status => status.type === 'burning' && status.duration > 0);
    const burningDamage = statusResult.burningDamage * Math.min(1, healthBeforeStatuses / Math.max(.000001, statusResult.damage));
    if (burning || burningDamage > 0) this.burnVisual ??= new BurnVisual(this.group);
    this.burnVisual?.update(dt, burning, burningDamage, this.dead, this.healthBarBg.position.y);
    this.healthFill.material.color.setHex(burning ? 0xffc090 : 0xffffff);

    this.bobPhase += dt * (this.state === 'chase' ? 7 : 3);
    const bob = this.dead ? 0 : Math.sin(this.bobPhase) * 0.08;
    this.group.position.set(this.position.x, this.position.y + bob, this.position.z);
    if (this.facingEnabled) {
      this.group.rotation.y = Math.atan2(this.facingX - this.position.x, this.facingZ - this.position.z);
    } else if (this.velocity.lengthSq() > 0.01) {
      this.group.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
    }

    const moving = this.velocity.lengthSq() > 0.01;
    this.parts.forEach((part) => {
      if (part.amplitude <= 0) return;
      const speed = (this.state === 'chase' || moving ? part.speed * 1.4 : part.speed) * (this.dead ? 0 : 1);
      const offset = Math.sin(elapsed * speed + part.phase) * part.amplitude;
      part.mesh.position.y = part.basePosition.y + offset;
      if (part.speed > 4.2) {
        part.mesh.rotation.y = elapsed * speed * 0.6;
      }
    });

    if (this.state === 'attack' && this.attackWindup > 0) {
      const progress = 1 - this.attackWindup / 0.5;
      this.bodyGroup.rotation.x = Math.sin(progress * Math.PI) * 0.12;
      this.bodyGroup.position.z = Math.sin(progress * Math.PI) * 0.08;
    } else {
      this.bodyGroup.rotation.x *= 1 - Math.min(1, dt * 10);
      this.bodyGroup.position.z *= 1 - Math.min(1, dt * 10);
    }

    if (this.hitFlash > 0) {
      this.material.emissive.setHex(0xff2222);
      this.material.emissiveIntensity = 0.85;
    } else if (burning) {
      this.material.emissive.setHex(0xff5a0a);
      this.material.emissiveIntensity = .25 + Math.sin(elapsed * 9) * .08;
    } else {
      this.material.emissive.setHex(0x000000);
      this.material.emissiveIntensity = 0;
    }

    if (this.auraRing) {
      this.auraRing.rotation.z += dt * 1.4;
      const auraMaterial = this.auraRing.material as THREE.MeshBasicMaterial;
      auraMaterial.opacity = 0.35 + Math.sin(elapsed * 5) * 0.15;
    }

    if (this.dead) {
      this.removalTimer += dt;
      const scale = Math.max(0.001, 1 - this.removalTimer / 0.45);
      this.bodyGroup.scale.y = scale;
      this.bodyGroup.rotation.x = Math.min(1.2, this.removalTimer * 3);
    }

    const healthRatio = this.maxHealth > 0 ? Math.max(0, Math.min(1, this.health / this.maxHealth)) : 0;
    this.healthFill.scale.x = Math.max(0.001, healthRatio * 0.93);
    this.healthFill.center.x = 0.465 / this.healthFill.scale.x;
    this.healthFill.visible = !this.dead;
  }

  takeDamage(amount: number, flash = true): boolean {
    if (this.dead) return false;
    this.health = Math.max(0, this.health - amount);
    if (flash) this.hitFlash = 0.12;
    if (this.health <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  die(): void {
    if (this.dead) return;
    this.dead = true;
    this.state = 'death';
    this.velocity.set(0, 0, 0);
    this.removalTimer = 0;
  }
}
