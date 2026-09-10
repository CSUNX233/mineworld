import { isMobileDevice } from '../utils/mobile';
import * as THREE from 'three';
import type { FloorData } from '../types';
import { BlockKind } from '../world/Block';
import type { InputManager } from '../core/InputManager';
import type { Player } from './Player';
import type { DerivedStats } from '../items/EquipmentManager';
import { clamp, damp } from '../utils/math';
import { SettingsManager } from '../core/SettingsManager';
import { worldRayDistance } from '../world/SpatialQueries';
import { encounterBarrierBlocksCylinder } from '../world/EncounterBarriers';

const GRAVITY = -24;
const JUMP_SPEED = 8;
const PLAYER_RADIUS = 0.35;
const PLAYER_HEIGHT = 1.8;
const THIRD_PERSON_MIN_PITCH = -0.15;
const THIRD_PERSON_MAX_PITCH = 1.15;

function lerpAngle(current: number, target: number, t: number): number {
  let delta = ((target - current + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return current + delta * t;
}

export class PlayerController {
  private readonly touchDevice = isMobileDevice();
  private cameraDistance = 6;
  private cameraAnchorY: number | null = null;
  private clearanceTime = 0;
  private forwardTravelTime = 0;
  private manualLookTime = 0;
  private touchAim: THREE.Vector3 | null = null;
  private touchAimLife = 0;
  private currentFloor: FloorData | null = null;
  private boomDistance = 6;
  private cameraYaw = 0;
  private cameraPitch = 0.52;
  private thirdPersonPitch = 0.52;
  private combatFacingTime = 0;
  private recenterYaw: number | null = null;
  private jumpBuffer = 0;
  private firstPerson = false;
  private shake = 0;
  private hitShake = 0;
  private hitShakeTime = 0;
  private dashVelocity = new THREE.Vector3();
  private dashTime = 0;

  constructor(
    private player: Player,
    private input: InputManager,
    private camera: THREE.PerspectiveCamera,
  ) {}

  get isFirstPerson(): boolean {
    return this.firstPerson;
  }

  toggleView(): void {
    this.setFirstPerson(!this.firstPerson);
  }

  setFirstPerson(value: boolean): void {
    if (value === this.firstPerson) return;
    if (value) {
      this.thirdPersonPitch = this.cameraPitch;
      this.cameraPitch = 0;
    } else {
      this.cameraPitch = this.thirdPersonPitch;
      this.boomDistance = 0;
    }
    this.firstPerson = value;
    this.recenterYaw = null;
  }

  get isTouchAiming(): boolean { return this.touchAim !== null; }
  get bodyOpacity(): number {
    if (this.firstPerson) return 0;
    const distance = this.camera.position.distanceTo(this.player.position.clone().add(new THREE.Vector3(0, 1.35, 0)));
    return clamp((distance - 0.65) / 1.05, 0, 1);
  }
  get bodyVisible(): boolean { return this.bodyOpacity > 0.02; }

  faceAim(): void {
    this.combatFacingTime = 0.32;

  }

  addShake(amount: number): void {
    this.shake = Math.min(0.5, this.shake + amount);
  }

  addHitShake(impact: number, crit: boolean): void {
    // Area hits refresh one short pulse, rather than adding one shake per enemy.
    this.hitShake = Math.max(this.hitShake, Math.min(0.055, 0.012 + impact * 0.023 + (crit ? 0.009 : 0)));
    this.hitShakeTime = 0.14;
  }

  resetView(floorData: FloorData | null = null): void {
    this.touchAim = null;
    this.touchAimLife = 0;
    this.cameraAnchorY = null;
    this.clearanceTime = 0;
    this.forwardTravelTime = 0;
    this.manualLookTime = 0;
    this.hitShake = 0;
    this.hitShakeTime = 0;
    this.cameraYaw = this.player.yaw;
    this.cameraPitch = this.firstPerson ? 0 : this.thirdPersonPitch;
    this.boomDistance = this.cameraDistance;
    this.dashVelocity.set(0, 0, 0);
    this.dashTime = 0;
    this.combatFacingTime = 0;
    this.recenterYaw = null;
    this.jumpBuffer = 0;
    this.updateCamera(0, floorData);
  }

  setTouchAim(x: number, y: number): void {
    if (Math.hypot(x, y) < 5) return;
    const yaw = this.cameraYaw - Math.atan2(x, -y);
    this.touchAim = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    this.touchAimLife = Infinity;
  }
  endTouchAim(cancel = false): void {
    this.touchAimLife = cancel ? 0 : 0.18;
    if (cancel) this.touchAim = null;
  }
  getAimDirection(): THREE.Vector3 {
    if (this.touchAim) return this.touchAim.clone();
    return new THREE.Vector3(Math.sin(this.cameraYaw), 0, Math.cos(this.cameraYaw));
  }

  getProjectileDirection(targets: ReadonlyArray<{position: THREE.Vector3; dead: boolean}> = []): THREE.Vector3 {
    if (this.touchAim) return this.touchAim.clone();
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    const ray = new THREE.Ray(this.camera.position, direction);
    let distance = this.currentFloor ? worldRayDistance(this.currentFloor, ray.origin, direction, 32) : 32;
    for (const target of targets) {
      if (target.dead) continue;
      const center = target.position.clone().add(new THREE.Vector3(0, 0.85, 0));
      const hit = ray.intersectSphere(new THREE.Sphere(center, 0.6), new THREE.Vector3());
      if (hit) distance = Math.min(distance, hit.distanceTo(ray.origin));
    }
    const point = ray.at(Math.max(0.1, distance), new THREE.Vector3());
    return point.sub(this.getProjectileOrigin()).normalize();
  }

  getProjectileOrigin(): THREE.Vector3 {
    return this.player.position.clone().add(new THREE.Vector3(0, this.firstPerson ? 1.62 : 1.25, 0));
  }

  dash(direction: THREE.Vector3): void {
    this.dashVelocity.copy(direction).multiplyScalar(17);
    this.dashTime = 0.18;
  }

  update(dt: number, floorData: FloorData | null, stats: DerivedStats, realDt = dt): void {
    this.currentFloor = floorData;
    this.touchAimLife = Math.max(0, this.touchAimLife - realDt);
    if (this.touchAimLife === 0) this.touchAim = null;
    const p = this.player;
    if (!p.alive) {
      p.moving = false;
      p.sprinting = false;
      return;
    }

    const lookScale = 0.0022 * SettingsManager.getLookSensitivity();
    const looking = Math.abs(this.input.mouseDeltaX) + Math.abs(this.input.mouseDeltaY) > 0;
    this.manualLookTime = looking ? 0.65 : Math.max(0, this.manualLookTime - realDt);
    if (looking) this.recenterYaw = null;
    this.cameraYaw -= this.input.mouseDeltaX * lookScale;
    // Positive pitch raises the orbit camera, but lowers the first-person gaze.
    const pitchDelta = this.input.mouseDeltaY * lookScale;
    this.cameraPitch = this.firstPerson
      ? clamp(this.cameraPitch - pitchDelta, -1.35, 1.35)
      : clamp(this.cameraPitch + pitchDelta, THIRD_PERSON_MIN_PITCH, THIRD_PERSON_MAX_PITCH);
    if (!this.firstPerson) this.thirdPersonPitch = this.cameraPitch;
    if (!this.firstPerson && this.input.wasPressed('KeyR') && !looking) this.recenterYaw = p.yaw;
    if (this.recenterYaw !== null) {
      this.cameraYaw = lerpAngle(this.cameraYaw, this.recenterYaw, 1 - Math.exp(-12 * realDt));
      if (Math.abs(Math.sin(this.cameraYaw - this.recenterYaw)) < 0.001) this.recenterYaw = null;
    }

    const { x: strafeInput, y: forwardInput } = this.input.movement;
    const forward = new THREE.Vector3(Math.sin(this.cameraYaw), 0, Math.cos(this.cameraYaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const moveDir = new THREE.Vector3().addScaledVector(forward, forwardInput).addScaledVector(right, strafeInput);
    p.moving = moveDir.lengthSq() > 0.001;
    p.sprinting = p.moving && (this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight'));
    this.combatFacingTime = Math.max(0, this.combatFacingTime - dt);
    const combatFacing = this.combatFacingTime > 0 || this.input.isMouseDown(0) || this.input.isMouseDown(2);
    if (combatFacing || this.firstPerson) {
      p.yaw = lerpAngle(p.yaw, this.touchAim ? Math.atan2(this.touchAim.x, this.touchAim.z) : this.cameraYaw, 1 - Math.exp(-20 * realDt));
    } else if (p.moving) {
      p.yaw = lerpAngle(p.yaw, Math.atan2(moveDir.x, moveDir.z), 1 - Math.exp(-20 * dt));
    }
    // Analog forward movement and keyboard movement use the same follow rule.
    const forwardTravel = forwardInput > 0.6 && Math.abs(strafeInput) < 0.2;
    this.forwardTravelTime = forwardTravel ? this.forwardTravelTime + realDt : 0;
    if (!this.firstPerson && SettingsManager.getCameraFollow() && this.manualLookTime === 0
      && !combatFacing && this.forwardTravelTime > 0.45) {
      this.cameraYaw = lerpAngle(this.cameraYaw, p.yaw, 1 - Math.exp(-2 * realDt));
    }

    const speed = stats.moveSpeed * (p.sprinting ? 1.65 : 1) * 5.5;
    const targetVelocity = moveDir.multiplyScalar(speed);
    if (this.dashTime > 0) {
      targetVelocity.add(this.dashVelocity);
      this.dashTime -= dt;
      if (this.dashTime <= 0) this.dashVelocity.set(0, 0, 0);
    }

    const groundLambda = this.touchDevice ? (p.moving ? 40 : 60) : p.moving ? 24 : 38;
    p.velocity.x = damp(p.velocity.x, targetVelocity.x, groundLambda, dt);
    p.velocity.z = damp(p.velocity.z, targetVelocity.z, groundLambda, dt);

    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (this.input.wasPressed('Space')) this.jumpBuffer = 0.12;
    if (this.jumpBuffer > 0 && p.onGround) {
      this.jumpBuffer = 0;
      p.velocity.y = JUMP_SPEED;
      p.onGround = false;
    }
    if (!p.onGround) {
      p.velocity.y += GRAVITY * dt;
      p.velocity.y = Math.max(p.velocity.y, -30);
    }

    if (floorData) {
      this.moveWithCollisions(p, floorData, dt);
    } else {
      p.position.x += p.velocity.x * dt;
      p.position.z += p.velocity.z * dt;
      p.position.y += p.velocity.y * dt;
    }

    this.updateCamera(realDt, floorData);
  }

  private updateCamera(dt: number, floorData: FloorData | null): void {
    const p = this.player;
    const wheel = this.input.consumeWheel();
    if (!this.firstPerson) this.cameraDistance = clamp(this.cameraDistance + wheel * 0.6, 3, 9);
    const targetY = p.position.y + 1.35;
    this.cameraAnchorY = this.cameraAnchorY === null ? targetY : damp(this.cameraAnchorY, targetY, p.onGround ? 14 : 7, dt);
    const origin = new THREE.Vector3(p.position.x, this.cameraAnchorY, p.position.z);
    const forward = new THREE.Vector3(Math.sin(this.cameraYaw), 0, Math.cos(this.cameraYaw));
    if (this.firstPerson) {
      this.camera.position.copy(p.position).add(new THREE.Vector3(0, 1.62, 0));
      const direction = forward.multiplyScalar(Math.cos(this.cameraPitch));
      direction.y = Math.sin(this.cameraPitch);
      this.camera.lookAt(this.camera.position.clone().add(direction));
    } else {
      const boom = forward.clone().multiplyScalar(-Math.cos(this.cameraPitch));
      boom.y = Math.sin(this.cameraPitch);
      const safeDistance = floorData
        ? Math.max(0, worldRayDistance(floorData, origin, boom, this.cameraDistance, 0.22) - 0.04)
        : this.cameraDistance;
      // Obstructions retract immediately. Only outward recovery is damped;
      // orbit yaw and pitch always follow input without positional lag.
      if (safeDistance < this.boomDistance) {
        this.boomDistance = safeDistance;
        this.clearanceTime = 0;
      } else {
        this.clearanceTime += dt;
        if (this.clearanceTime > 0.12) this.boomDistance = damp(this.boomDistance, safeDistance, 6, dt);
      }
      this.camera.position.copy(origin).addScaledVector(boom, this.boomDistance);
      this.camera.lookAt(origin.clone().addScaledVector(forward, 1.5));
    }
    if (this.shake > 0 || this.hitShakeTime > 0) {
      this.hitShakeTime = Math.max(0, this.hitShakeTime - dt);
      const pulse = SettingsManager.getShakeStrength() * this.hitShake * (this.hitShakeTime / 0.14) ** 2 * (this.firstPerson ? 0.6 : 1);
      const phase = (0.14 - this.hitShakeTime) * 85;
      this.camera.position.x += Math.sin(phase) * pulse;
      this.camera.position.y += Math.cos(phase * 1.3) * pulse * 0.65;
      if (this.hitShakeTime === 0) this.hitShake = 0;
      const amount = this.shake * 0.35 * SettingsManager.getShakeStrength();
      this.camera.position.x += (Math.random() - 0.5) * amount;
      this.camera.position.y += (Math.random() - 0.5) * amount;
      if (floorData && !this.firstPerson) {
        const offset = this.camera.position.clone().sub(origin);
        const distance = offset.length();
        if (distance > 0) {
          offset.normalize();
          const safe = worldRayDistance(floorData, origin, offset, distance, 0.22);
          this.camera.position.copy(origin).addScaledVector(offset, Math.max(0, safe - 0.01));
        }
      }
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    this.camera.fov = damp(this.camera.fov, this.firstPerson ? 75 : p.sprinting ? 66 : 62, 8, dt);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  private moveWithCollisions(p: Player, floor: FloorData, dt: number): void {
    const dx = p.velocity.x * dt;
    const dz = p.velocity.z * dt;
    const dy = p.velocity.y * dt;

    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.15));
    for (let i = 0; i < steps; i++) {
      const newX = p.position.x + dx / steps;
      if (!this.collides(p, floor, newX, p.position.z, p.position.y)) p.position.x = newX;
      else p.velocity.x = 0;
      const newZ = p.position.z + dz / steps;
      if (!this.collides(p, floor, p.position.x, newZ, p.position.y)) p.position.z = newZ;
      else p.velocity.z = 0;
    }

    const newY = p.position.y + dy;
    if (newY <= 0) {
      p.position.y = 0;
      p.velocity.y = 0;
      p.onGround = true;
    } else {
      if (!this.collides(p, floor, p.position.x, p.position.z, newY)) {
        p.position.y = newY;
        p.onGround = false;
      } else {
        p.velocity.y = 0;
        if (dy < 0) {
          p.position.y = 2;
          p.onGround = true;
        }
      }
    }
  }

  private collides(p: Player, floor: FloorData, x: number, z: number, y: number): boolean {
    const minX = Math.floor(x - PLAYER_RADIUS);
    const maxX = Math.floor(x + PLAYER_RADIUS);
    const minZ = Math.floor(z - PLAYER_RADIUS);
    const maxZ = Math.floor(z + PLAYER_RADIUS);
    const minY = y;
    const maxY = y + PLAYER_HEIGHT;
    if (encounterBarrierBlocksCylinder(
      floor, x, z, PLAYER_RADIUS, minY, maxY, p.position.x, p.position.z,
    )) return true;
    for (let gz = minZ; gz <= maxZ; gz++) {
      for (let gx = minX; gx <= maxX; gx++) {
        if (gz < 0 || gz >= floor.size || gx < 0 || gx >= floor.size) return true;
        const kind = floor.grid[gz][gx];
        if (kind === BlockKind.Wall || kind === BlockKind.Obstacle) {
          if (
            x + PLAYER_RADIUS > gx &&
            x - PLAYER_RADIUS < gx + 1 &&
            z + PLAYER_RADIUS > gz &&
            z - PLAYER_RADIUS < gz + 1 &&
            maxY > 0 &&
            minY < 2
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

}
