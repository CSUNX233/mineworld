import { createEnemyAppearance } from './EnemyAppearance';
import { monsterAggression } from './EnemyIntent';
import { trackedTexture } from '../core/AssetLoading';
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
  const texture = trackedTexture(import.meta.env.BASE_URL + 'assets/ui/sunlit/' + name + '.webp');
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  return texture;
}
const BAR_FRAME = overlayTexture('bar-track-frame');
const BAR_FILL = overlayTexture('health');

export class Monster {
  readonly visual: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhongMaterial>;
  roomId = '';
  movementAttempted = false;
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
  private material: THREE.MeshPhongMaterial;
  private burnVisual: BurnVisual | null = null;
  private healthFill!: THREE.Sprite;
  private healthBarBreak!: HealthBarBreak;
  private healthBarBg!: THREE.Sprite;
  private nameSprite!: THREE.Sprite;
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
    this.visual = createEnemyAppearance(def.id);
    this.material = this.visual.material;
    this.bodyGroup.add(this.visual);
    this.group.add(this.bodyGroup);
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

  setElite(modifiers: string[]): void {
    this.elite = true;
    this.eliteModifiers = modifiers;
    // Keep the role palette readable; elite crest and aura identify the modifier.
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
    this.attackCooldown = Math.max(0, this.attackCooldown - dt * monsterAggression(this));
    this.attackWindup = Math.max(0, this.attackWindup - dt);
    this.attackWarning.visible = !this.dead && this.state === 'attack' && this.attackWindup > 0 && this.def.behavior !== 'boss';
    this.attackWarning.scale.setScalar(this.def.behavior === 'ranged' ? 0.8 : this.def.attackRange + 0.5);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.lostTargetTimer = Math.max(0, this.lostTargetTimer - dt);

    const healthBeforeStatuses = this.dead ? 0 : this.health;
    const statusResult = updateStatuses(this, dt, this.def.resistances);
    this.slowMultiplier = statusResult.slowMultiplier;
    this.group.userData.reaperSlow = Math.max(0,(this.group.userData.reaperSlow ?? 0)-dt);
    if (this.group.userData.reaperSlow > 0) this.slowMultiplier = Math.min(this.slowMultiplier,this.def.behavior === 'boss' ? .9 : .75);
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
    this.visual.position.y = moving ? Math.sin(elapsed * 10) * .025 : 0;
    // A uniform shared by this actor's body and held props; no recoil pose.
    this.material.userData.enemyFlash.value = this.hitFlash > 0 ? 1 : 0;
    if (this.state === 'attack' && this.attackWindup > 0) {
      const progress = 1 - this.attackWindup / 0.5;
      this.bodyGroup.rotation.x = Math.sin(progress * Math.PI) * 0.12;
      this.bodyGroup.position.z = Math.sin(progress * Math.PI) * 0.08;
    } else {
      this.bodyGroup.rotation.x *= 1 - Math.min(1, dt * 10);
      this.bodyGroup.position.z *= 1 - Math.min(1, dt * 10);
    }

    this.material.emissive.setHex(burning ? 0xff5a0a : 0x000000);
    this.material.emissiveIntensity = burning ? .25 + Math.sin(elapsed * 9) * .08 : 0;

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
    if (flash) this.hitFlash = 0.09;
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
