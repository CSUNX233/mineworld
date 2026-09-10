import * as THREE from 'three';
import type { FloorData } from '../types';
import { BlockKind } from '../world/Block';
import type { InputManager } from '../core/InputManager';
import type { Player } from './Player';
import type { DerivedStats } from '../items/EquipmentManager';
import { clamp, damp } from '../utils/math';
import { SettingsManager } from '../core/SettingsManager';
import { worldRayDistance } from '../world/SpatialQueries';

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
  private cameraDistance = 6;
  private boomDistance = 6;
  private cameraYaw = 0;
  private cameraPitch = 0.52;
  private thirdPersonPitch = 0.52;
  private combatFacingTime = 0;
  private recenterYaw: number | null = null;
  private jumpBuffer = 0;
  private firstPerson = false;
  private shake = 0;
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

  get bodyVisible(): boolean {
    return !this.firstPerson && this.camera.position.distanceTo(
      this.player.position.clone().add(new THREE.Vector3(0, 1.35, 0)),
    ) > 1.05;
  }

  faceAim(): void {
    this.combatFacingTime = 0.32;
    this.player.yaw = this.cameraYaw;
    this.player.group.rotation.y = this.cameraYaw;
  }

  addShake(amount: number): void {
    this.shake = Math.min(0.5, this.shake + amount);
  }

  resetView(floorData: FloorData | null = null): void {
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

  getAimDirection(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.cameraYaw), 0, Math.cos(this.cameraYaw));
  }

  getProjectileDirection(): THREE.Vector3 {
    const direction = this.getAimDirection();
    if (this.firstPerson) {
      direction.multiplyScalar(Math.cos(this.cameraPitch));
      direction.y = Math.sin(this.cameraPitch);
    }
    return direction;
  }

  getProjectileOrigin(): THREE.Vector3 {
    return this.player.position.clone().add(new THREE.Vector3(0, this.firstPerson ? 1.62 : 1.25, 0));
  }

  dash(direction: THREE.Vector3): void {
    this.dashVelocity.copy(direction).multiplyScalar(17);
    this.dashTime = 0.18;
  }

  update(dt: number, floorData: FloorData | null, stats: DerivedStats, realDt = dt): void {
    const p = this.player;
    if (!p.alive) {
      p.moving = false;
      p.sprinting = false;
      return;
    }

    const lookScale = 0.0022 * SettingsManager.getLookSensitivity();
    const looking = Math.abs(this.input.mouseDeltaX) + Math.abs(this.input.mouseDeltaY) > 0;
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
    const forward = this.getAimDirection();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const moveDir = new THREE.Vector3().addScaledVector(forward, forwardInput).addScaledVector(right, strafeInput);
    p.moving = moveDir.lengthSq() > 0.001;
    p.sprinting = p.moving && (this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight'));
    this.combatFacingTime = Math.max(0, this.combatFacingTime - dt);
    const combatFacing = this.combatFacingTime > 0 || this.input.isMouseDown(0) || this.input.isMouseDown(2);
    if (combatFacing || this.firstPerson) {
      p.yaw = lerpAngle(p.yaw, this.cameraYaw, 1 - Math.exp(-28 * realDt));
    } else if (p.moving) {
      p.yaw = lerpAngle(p.yaw, Math.atan2(moveDir.x, moveDir.z), 1 - Math.exp(-20 * dt));
    }
    // Recenter once at the start of forward travel. Never chase the heading
    // derived from strafing: that feedback loop makes the camera orbit forever.
    if (!this.firstPerson && SettingsManager.getCameraFollow() && !looking && !combatFacing
      && this.input.wasPressed('KeyW') && Math.abs(strafeInput) < 0.1) {
      this.recenterYaw = p.yaw;
    }

    const speed = stats.moveSpeed * (p.sprinting ? 1.65 : 1) * 5.5;
    const targetVelocity = moveDir.multiplyScalar(speed);
    if (this.dashTime > 0) {
      targetVelocity.add(this.dashVelocity);
      this.dashTime -= dt;
      if (this.dashTime <= 0) this.dashVelocity.set(0, 0, 0);
    }

    const groundLambda = p.moving ? 24 : 38;
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
    const origin = p.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const forward = this.getAimDirection();
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
      this.boomDistance = safeDistance < this.boomDistance
        ? safeDistance : damp(this.boomDistance, safeDistance, 5, dt);
      this.camera.position.copy(origin).addScaledVector(boom, this.boomDistance);
      this.camera.lookAt(origin.clone().addScaledVector(forward, 1.5));
    }
    if (this.shake > 0) {
      const amount = this.shake * 0.35;
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
