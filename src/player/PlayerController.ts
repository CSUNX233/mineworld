import * as THREE from 'three';
import type { FloorData } from '../types';
import { BlockKind } from '../world/Block';
import type { InputManager } from '../core/InputManager';
import type { Player } from './Player';
import type { DerivedStats } from '../items/EquipmentManager';
import { clamp, damp } from '../utils/math';
import { SettingsManager } from '../core/SettingsManager';

const GRAVITY = -24;
const JUMP_SPEED = 8;
const PLAYER_RADIUS = 0.35;
const PLAYER_HEIGHT = 1.8;
const THIRD_PERSON_MIN_PITCH = -0.04;
const THIRD_PERSON_MAX_PITCH = 1.25;

function lerpAngle(current: number, target: number, t: number): number {
  let delta = ((target - current + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return current + delta * t;
}

export class PlayerController {
  private cameraDistance = 7;
  private cameraHeight = 0.45;
  private cameraYaw = 0;
  private cameraPitch = 0.28;
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
    this.firstPerson = !this.firstPerson;
    if (!this.firstPerson) {
      this.cameraPitch = clamp(this.cameraPitch, THIRD_PERSON_MIN_PITCH, THIRD_PERSON_MAX_PITCH);
    }
  }

  setFirstPerson(value: boolean): void {
    this.firstPerson = value;
    if (!value) {
      this.cameraPitch = clamp(this.cameraPitch, THIRD_PERSON_MIN_PITCH, THIRD_PERSON_MAX_PITCH);
    }
  }

  addShake(amount: number): void {
    this.shake = Math.min(0.5, this.shake + amount);
  }

  resetView(): void {
    this.cameraYaw = this.player.yaw;
    this.cameraPitch = 0.28;
    this.dashVelocity.set(0, 0, 0);
    this.dashTime = 0;
    const horizontalDistance = Math.cos(this.cameraPitch) * this.cameraDistance;
    const verticalDistance = Math.sin(this.cameraPitch) * this.cameraDistance;
    this.camera.position.set(
      this.player.position.x - Math.sin(this.cameraYaw) * horizontalDistance,
      this.player.position.y + this.cameraHeight + verticalDistance,
      this.player.position.z - Math.cos(this.cameraYaw) * horizontalDistance,
    );
    this.camera.lookAt(this.player.position.x, this.player.position.y + 1.25, this.player.position.z);
  }

  getAimDirection(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.cameraYaw), 0, Math.cos(this.cameraYaw));
  }

  dash(direction: THREE.Vector3): void {
    this.dashVelocity.copy(direction).multiplyScalar(17);
    this.dashTime = 0.18;
  }

  update(dt: number, floorData: FloorData | null, stats: DerivedStats): void {
    const p = this.player;
    if (!p.alive) {
      p.moving = false;
      p.sprinting = false;
      return;
    }

    const lookScale = 0.0022 * SettingsManager.getLookSensitivity();
    this.cameraYaw -= this.input.mouseDeltaX * lookScale;
    const pitchDelta = -this.input.mouseDeltaY * lookScale;
    if (this.firstPerson) {
      this.cameraPitch = clamp(this.cameraPitch + pitchDelta, -1.35, 1.35);
    } else {
      this.cameraPitch = clamp(this.cameraPitch + pitchDelta, THIRD_PERSON_MIN_PITCH, THIRD_PERSON_MAX_PITCH);
    }

    const forwardInput = this.input.isDown('KeyW') ? 1 : this.input.isDown('KeyS') ? -1 : 0;
    const strafeInput = this.input.isDown('KeyD') ? 1 : this.input.isDown('KeyA') ? -1 : 0;

    const forward = new THREE.Vector3(Math.sin(this.cameraYaw), 0, Math.cos(this.cameraYaw));
    const right = new THREE.Vector3(-Math.cos(this.cameraYaw), 0, Math.sin(this.cameraYaw));
    const moveDir = new THREE.Vector3()
      .addScaledVector(forward, forwardInput)
      .addScaledVector(right, strafeInput);
    p.moving = moveDir.lengthSq() > 0.001;
    p.sprinting = p.moving && (this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight'));

    if (p.moving) {
      moveDir.normalize();
      const targetYaw = Math.atan2(moveDir.x, moveDir.z);
      p.yaw = lerpAngle(p.yaw, targetYaw, 1 - Math.exp(-12 * dt));
    }

    const speed = stats.moveSpeed * (p.sprinting ? 1.65 : 1) * 5.5;
    const targetVelocity = moveDir.multiplyScalar(speed);
    if (this.dashTime > 0) {
      targetVelocity.add(this.dashVelocity);
      this.dashTime -= dt;
      if (this.dashTime <= 0) this.dashVelocity.set(0, 0, 0);
    }

    const groundLambda = 15;
    p.velocity.x = damp(p.velocity.x, targetVelocity.x, groundLambda, dt);
    p.velocity.z = damp(p.velocity.z, targetVelocity.z, groundLambda, dt);

    if (this.input.wasPressed('Space') && p.onGround) {
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

    const wheel = this.input.consumeWheel();
    this.cameraDistance = clamp(this.cameraDistance + wheel * 0.7, 3, 11);

    const lookTarget = new THREE.Vector3();
    if (this.firstPerson) {
      this.camera.position.set(p.position.x, p.position.y + 1.62, p.position.z);
      const lookDistance = 10;
      lookTarget.set(
        p.position.x + Math.sin(this.cameraYaw) * Math.cos(this.cameraPitch) * lookDistance,
        p.position.y + 1.62 + Math.sin(this.cameraPitch) * lookDistance,
        p.position.z + Math.cos(this.cameraYaw) * Math.cos(this.cameraPitch) * lookDistance,
      );
    } else {
      const horizontalDistance = Math.cos(this.cameraPitch) * this.cameraDistance;
      const verticalDistance = Math.sin(this.cameraPitch) * this.cameraDistance;
      const desired = new THREE.Vector3(
        p.position.x - Math.sin(this.cameraYaw) * horizontalDistance,
        p.position.y + this.cameraHeight + verticalDistance,
        p.position.z - Math.cos(this.cameraYaw) * horizontalDistance,
      );
      const target = floorData ? this.resolveCameraCollision(p, floorData, desired) : desired;
      const lambda = 14;
      this.camera.position.x = damp(this.camera.position.x, target.x, lambda, dt);
      this.camera.position.y = damp(this.camera.position.y, target.y, lambda, dt);
      this.camera.position.z = damp(this.camera.position.z, target.z, lambda, dt);
      lookTarget.set(p.position.x, p.position.y + 1.25, p.position.z);
    }

    this.camera.lookAt(lookTarget);

    if (this.shake > 0) {
      const amount = this.shake;
      this.camera.position.x += (Math.random() - 0.5) * amount;
      this.camera.position.y += (Math.random() - 0.5) * amount;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }

    this.camera.fov = damp(this.camera.fov, this.firstPerson ? 75 : p.sprinting ? 66 : 60, 8, dt);
    this.camera.updateProjectionMatrix();
  }

  private moveWithCollisions(p: Player, floor: FloorData, dt: number): void {
    const dx = p.velocity.x * dt;
    const dz = p.velocity.z * dt;
    const dy = p.velocity.y * dt;

    const newX = p.position.x + dx;
    if (!this.collides(p, floor, newX, p.position.z, p.position.y)) {
      p.position.x = newX;
    } else {
      p.velocity.x = 0;
    }

    const newZ = p.position.z + dz;
    if (!this.collides(p, floor, p.position.x, newZ, p.position.y)) {
      p.position.z = newZ;
    } else {
      p.velocity.z = 0;
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
          p.position.y = Math.max(0, Math.floor(newY));
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

  private resolveCameraCollision(p: Player, floor: FloorData, target: THREE.Vector3): THREE.Vector3 {
    const origin = new THREE.Vector3(p.position.x, p.position.y + 1.25, p.position.z);
    let lastGood = origin.clone();
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      const sample = origin.clone().lerp(target, i / steps);
      const gx = Math.floor(sample.x);
      const gz = Math.floor(sample.z);
      if (gz < 0 || gz >= floor.size || gx < 0 || gx >= floor.size) return lastGood;
      const kind = floor.grid[gz][gx];
      if (kind === BlockKind.Wall || kind === BlockKind.Obstacle) return lastGood;
      lastGood = sample;
    }
    return target;
  }
}
