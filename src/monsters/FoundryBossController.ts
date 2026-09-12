import { monsterAggression } from './EnemyIntent';
import * as THREE from 'three';
import type { FloorData, Room } from '../types';
import type { Player } from '../player/Player';
import { findEncounterRoomPosition } from '../world/EncounterBarriers';
import { isWalkable } from '../world/FloorGenerator';
import { roomContainsPoint } from '../world/RoomGeometry';
import { worldRayDistance } from '../world/SpatialQueries';
import type { BossHost } from './BossController';
import type { Monster } from './Monster';
import {
  angleOutsideGap,
  disposeFoundryObject,
  expandingWaveHitTime,
  foundryGappedRingGeometry,
  foundryLaneGeometry,
  foundrySectorGeometry,
  pointSegmentDistanceSquared,
  segmentCircleHitDistance,
  updateFoundryGappedRingGeometry,
} from './FoundryBossGeometry';

const NONE = 0;
const SWEEP_WARNING = 1;
const CHARGE_WARNING = 2;
const CHARGING = 3;
const STEAM_WARNING = 4;
const STEAM_ACTIVE = 5;
const WAVE_WARNING = 6;
const WAVE_ACTIVE = 7;
const SUMMON_WARNING = 8;

const BOSS_ID = 'furnace_regent';
const BOSS_RADIUS = 0.82;
const PLAYER_HIT_RADIUS = 1.55;
const CHARGE_SPEED = 13;
const WAVE_HEIGHT = 0.42;
const WAVE_HALF_THICKNESS = 0.28;

/** Flat numeric fields keep the controller state JSON-safe and easy to migrate. */
export interface FoundryBossState {
  phase: number;
  cooldown: number;
  stagger: number;
  exposed: number;
  cycle: number;
  attackKind: number;
  attackTimer: number;
  attackDuration: number;
  attackDamage: number;
  directionX: number;
  directionZ: number;
  originX: number;
  originZ: number;
  hitPlayer: number;
  chargeRemaining: number;
  pendingCharge: number;
  exposeAfterAttack: number;
  reinforcementUsed: number;
  summon1X: number;
  summon1Z: number;
  summon2X: number;
  summon2Z: number;
  steamX: number;
  steamZ: number;
  steamHalfWidth: number;
  steamHalfDepth: number;
  steamAxis: number;
  steamDirection: number;
  waveRadius: number;
  waveMaxRadius: number;
  waveGapAngle: number;
  waveGapHalfAngle: number;
  previousPlayerX: number;
  previousPlayerY: number;
  previousPlayerZ: number;
  playerSampleReady: number;
  pillarsReady: number;
  pillar1X: number;
  pillar1Z: number;
  pillar1Cooldown: number;
  pillar2X: number;
  pillar2Z: number;
  pillar2Cooldown: number;
  pillar3X: number;
  pillar3Z: number;
  pillar3Cooldown: number;
}

function initialState(): FoundryBossState {
  return {
    phase: 1, cooldown: 1.6, stagger: 0, exposed: 0, cycle: 0,
    attackKind: NONE, attackTimer: 0, attackDuration: 0, attackDamage: 0,
    directionX: 0, directionZ: 1, originX: 0, originZ: 0,
    hitPlayer: 0, chargeRemaining: 0, pendingCharge: 0, exposeAfterAttack: 0,
    reinforcementUsed: 0, summon1X: 0, summon1Z: 0, summon2X: 0, summon2Z: 0,
    steamX: 0, steamZ: 0, steamHalfWidth: 0, steamHalfDepth: 0,
    steamAxis: 0, steamDirection: 1,
    waveRadius: 0, waveMaxRadius: 0, waveGapAngle: 0, waveGapHalfAngle: Math.PI / 5,
    previousPlayerX: 0, previousPlayerY: 0, previousPlayerZ: 0, playerSampleReady: 0,
    pillarsReady: 0,
    pillar1X: 0, pillar1Z: 0, pillar1Cooldown: 0,
    pillar2X: 0, pillar2Z: 0, pillar2Cooldown: 0,
    pillar3X: 0, pillar3Z: 0, pillar3Cooldown: 0,
  };
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** Dedicated controller for the floor-10 Furnace Regent encounter. */
export class FoundryBossController {
  private state: FoundryBossState = initialState();
  private attackMeshes: THREE.Mesh[] = [];
  private pillarMeshes: THREE.Group[] = [];
  private bossDecoration: THREE.Group | null = null;
  private coreMesh: THREE.Mesh | null = null;

  constructor(private scene: THREE.Scene) {}

  get damageMultiplier(): number {
    return this.state.exposed > 0 ? 1.2 : 1;
  }

  snapshot(): FoundryBossState {
    return { ...this.state };
  }

  restore(saved: FoundryBossState): void {
    this.destroyVisuals();
    const defaults = initialState();
    const restored = { ...defaults, ...saved };
    for (const key of Object.keys(defaults) as (keyof FoundryBossState)[]) {
      restored[key] = finite(restored[key], defaults[key]);
    }
    restored.phase = Math.max(1, Math.min(3, Math.round(restored.phase)));
    restored.reinforcementUsed = restored.reinforcementUsed > 0 ? 1 : 0;
    restored.pillarsReady = restored.pillarsReady > 0 ? 1 : 0;
    restored.pillar1Cooldown = Math.max(0, restored.pillar1Cooldown);
    restored.pillar2Cooldown = Math.max(0, restored.pillar2Cooldown);
    restored.pillar3Cooldown = Math.max(0, restored.pillar3Cooldown);
    restored.exposed = Math.max(0, restored.exposed);
    restored.attackKind = NONE;
    restored.attackTimer = 0;
    restored.attackDuration = 0;
    restored.hitPlayer = 0;
    restored.pendingCharge = 0;
    restored.exposeAfterAttack = 0;
    restored.playerSampleReady = 0;
    restored.cooldown = Math.max(2.5, restored.cooldown);
    this.state = restored;
  }

  update(
    dt: number,
    boss: Monster,
    player: Player,
    floor: FloorData,
    host: BossHost,
    attack: number,
  ): void {
    if (boss.def.id !== BOSS_ID) return;
    if (boss.dead) {
      this.clear();
      return;
    }

    const room = floor.rooms.find(candidate => candidate.id === boss.roomId);
    this.ensureBossDecoration(boss);
    if (room) this.ensurePillars(room, floor);
    this.updateDecoration(Math.max(0, dt));
    if (dt <= 0) return;

    const ratio = boss.maxHealth > 0 ? boss.health / boss.maxHealth : 0;
    const nextPhase = ratio > 0.65 ? 1 : ratio > 0.30 ? 2 : 3;
    if (nextPhase !== this.state.phase) {
      this.state.phase = nextPhase;
      host.showMessage(
        nextPhase === 2 ? '铸炉执政官 · 泄压' : '铸炉执政官 · 过载',
        nextPhase === 2 ? '蒸汽只封锁一侧，换线后再引导冲锋' : '低位炉环可跳过，也可从亮起的缺口绕开',
      );
    }

    this.state.cooldown = Math.max(0, this.state.cooldown - dt * 2 * monsterAggression(boss));
    this.state.stagger = Math.max(0, this.state.stagger - dt);
    this.state.exposed = Math.max(0, this.state.exposed - dt);
    this.state.pillar1Cooldown = Math.max(0, this.state.pillar1Cooldown - dt);
    this.state.pillar2Cooldown = Math.max(0, this.state.pillar2Cooldown - dt);
    this.state.pillar3Cooldown = Math.max(0, this.state.pillar3Cooldown - dt);
    this.updatePillarAppearance();

    if (!player.alive) {
      boss.velocity.set(0, 0, 0);
      this.cancelAttack();
      this.capturePlayer(player);
      return;
    }

    if (this.state.attackKind !== NONE) {
      this.updateAttack(dt, boss, player, floor, room, host);
      this.capturePlayer(player);
      return;
    }

    if (this.state.exposed > 0 || this.state.stagger > 0) {
      boss.velocity.set(0, 0, 0);
      this.capturePlayer(player);
      return;
    }

    if (this.state.cooldown <= 0 && room) {
      this.startNextAttack(boss, player, room, floor, host, Math.max(1, Math.round(attack)));
    } else {
      this.advanceTowardPlayer(dt, boss, player, floor, room);
    }
    this.capturePlayer(player);
  }

  clear(): void {
    this.destroyVisuals();
    this.state = initialState();
  }

  private updateAttack(
    dt: number,
    boss: Monster,
    player: Player,
    floor: FloorData,
    room: Room | undefined,
    host: BossHost,
  ): void {
    boss.velocity.set(0, 0, 0);
    if (this.state.attackKind === CHARGING) {
      this.updateCharge(dt, boss, player, floor, room, host);
      return;
    }
    if (this.state.attackKind === STEAM_ACTIVE) {
      this.updateSteam(dt, player, floor, room, host);
      return;
    }
    if (this.state.attackKind === WAVE_ACTIVE) {
      this.updateWave(dt, player, floor, room, host);
      return;
    }

    boss.faceToward(boss.position.x + this.state.directionX, boss.position.z + this.state.directionZ);
    this.state.attackTimer -= dt * 2;
    this.updateWarningOpacity();
    if (this.state.attackTimer > 0) return;

    if (this.state.attackKind === SWEEP_WARNING) {
      this.resolveSweep(player, floor, room, host);
      this.finishAttack(host, 2.2, 0.9);
    } else if (this.state.attackKind === CHARGE_WARNING) {
      this.removeAttackMeshes();
      this.state.attackKind = CHARGING;
      this.state.attackTimer = this.state.chargeRemaining / CHARGE_SPEED;
      this.state.attackDuration = this.state.attackTimer;
      this.state.hitPlayer = 0;
    } else if (this.state.attackKind === STEAM_WARNING) {
      this.state.attackKind = STEAM_ACTIVE;
      this.state.attackTimer = 1.8;
      this.state.attackDuration = 1.8;
      this.state.hitPlayer = 0;
      this.redrawSteam(false);
    } else if (this.state.attackKind === WAVE_WARNING) {
      this.removeAttackMeshes();
      this.state.attackKind = WAVE_ACTIVE;
      this.state.attackTimer = 1.8;
      this.state.attackDuration = 1.8;
      this.state.waveRadius = 0.8;
      this.state.hitPlayer = 0;
      this.state.previousPlayerX = player.position.x;
      this.state.previousPlayerY = player.position.y;
      this.state.previousPlayerZ = player.position.z;
      this.state.playerSampleReady = 1;
      this.redrawWaveFront();
    } else if (this.state.attackKind === SUMMON_WARNING) {
      host.summonMinion(new THREE.Vector3(this.state.summon1X, 0, this.state.summon1Z));
      host.summonMinion(new THREE.Vector3(this.state.summon2X, 0, this.state.summon2Z));
      this.finishAttack(host, 2.4, 0.7);
    }
  }

  private startNextAttack(
    boss: Monster,
    player: Player,
    room: Room,
    floor: FloorData,
    host: BossHost,
    attack: number,
  ): void {
    if (this.state.phase === 3 && this.state.reinforcementUsed === 0) {
      this.startSummon(room, floor, boss, host);
      return;
    }
    if (this.state.pendingCharge > 0) {
      this.state.pendingCharge = 0;
      this.startCharge(boss, player, floor, attack);
      return;
    }

    const cycle = this.state.cycle++;
    if (this.state.phase === 1) {
      if (cycle % 2 === 0) this.startSweep(boss, player, attack);
      else this.startCharge(boss, player, floor, attack);
      return;
    }
    if (this.state.phase === 2) {
      if (cycle % 3 === 0) this.startSweep(boss, player, attack);
      else if (cycle % 3 === 1) this.startSteam(room, player, attack, true);
      else this.startCharge(boss, player, floor, attack);
      return;
    }

    if (cycle % 3 === 0) this.startSweep(boss, player, Math.round(attack * 1.05));
    else if (cycle % 3 === 1) this.startSteam(room, player, attack, true);
    else {
      this.state.exposeAfterAttack = 1;
      this.startWave(boss, player, room, Math.round(attack * 1.1));
    }
  }

  private startSweep(boss: Monster, player: Player, damage: number): void {
    this.lockDirection(boss, player);
    this.state.attackKind = SWEEP_WARNING;
    this.state.attackTimer = 1.25;
    this.state.attackDuration = 1.25;
    this.state.attackDamage = damage;
    this.state.originX = boss.position.x;
    this.state.originZ = boss.position.z;
    const geometry = foundrySectorGeometry(6.2, Math.atan2(this.state.directionZ, this.state.directionX), Math.PI / 3);
    this.addAttackMesh(geometry, 0xff6a32, 0.34, this.state.originX, this.state.originZ);
  }

  private startCharge(boss: Monster, player: Player, floor: FloorData, damage: number): void {
    this.lockDirection(boss, player);
    this.state.attackKind = CHARGE_WARNING;
    this.state.attackTimer = 1.25;
    this.state.attackDuration = 1.25;
    this.state.attackDamage = Math.max(1, Math.round(damage * 1.15));
    this.state.originX = boss.position.x;
    this.state.originZ = boss.position.z;
    const room = floor.rooms.find(candidate => candidate.id === boss.roomId);
    const possible = this.maskedTravelDistance(floor, room, boss.position.x, boss.position.z,
      this.state.directionX, this.state.directionZ, 11, BOSS_RADIUS);
    this.state.chargeRemaining = Math.max(1.2, Math.min(11, possible - 0.05));
    const mesh = new THREE.Mesh(foundryLaneGeometry(
      PLAYER_HIT_RADIUS * 2,
      this.state.chargeRemaining,
      this.state.directionX,
      this.state.directionZ,
    ), this.telegraphMaterial(0xff3e25, 0.36));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(boss.position.x, 0.075, boss.position.z);
    this.scene.add(mesh);
    this.attackMeshes.push(mesh);
  }

  private startSteam(room: Room, player: Player, damage: number, chainCharge: boolean): void {
    const centerX = room.x + room.width / 2;
    const centerZ = room.z + room.depth / 2;
    if (room.width >= room.depth) {
      const usable = Math.max(6, room.depth - 2);
      const depth = Math.max(3, usable * 0.42);
      const lowSide = player.position.z <= centerZ;
      this.state.steamX = centerX;
      this.state.steamZ = lowSide ? room.z + 1 + depth / 2 : room.z + room.depth - 1 - depth / 2;
      this.state.steamHalfWidth = Math.max(2, (room.width - 2) / 2);
      this.state.steamHalfDepth = depth / 2;
      this.state.steamAxis = 1;
      this.state.steamDirection = lowSide ? 1 : -1;
    } else {
      const usable = Math.max(6, room.width - 2);
      const width = Math.max(3, usable * 0.42);
      const lowSide = player.position.x <= centerX;
      this.state.steamX = lowSide ? room.x + 1 + width / 2 : room.x + room.width - 1 - width / 2;
      this.state.steamZ = centerZ;
      this.state.steamHalfWidth = width / 2;
      this.state.steamHalfDepth = Math.max(2, (room.depth - 2) / 2);
      this.state.steamAxis = 0;
      this.state.steamDirection = lowSide ? 1 : -1;
    }
    this.state.attackKind = STEAM_WARNING;
    this.state.attackTimer = 1.4;
    this.state.attackDuration = 1.4;
    this.state.attackDamage = damage;
    this.state.pendingCharge = chainCharge ? 1 : 0;
    this.state.hitPlayer = 0;
    this.redrawSteam(true);
  }

  private startWave(boss: Monster, player: Player, room: Room, damage: number): void {
    this.state.attackKind = WAVE_WARNING;
    this.state.attackTimer = 1.3;
    this.state.attackDuration = 1.3;
    this.state.attackDamage = damage;
    this.state.originX = boss.position.x;
    this.state.originZ = boss.position.z;
    this.state.waveRadius = 0.8;
    this.state.waveMaxRadius = Math.max(6, Math.min(11, Math.hypot(room.width, room.depth) * 0.55));
    this.state.waveGapAngle = Math.atan2(player.position.z - boss.position.z, player.position.x - boss.position.x);
    this.state.waveGapHalfAngle = Math.PI / 5;
    const geometry = foundryGappedRingGeometry(
      0.65,
      this.state.waveMaxRadius,
      this.state.waveGapAngle,
      this.state.waveGapHalfAngle,
    );
    this.addAttackMesh(geometry, 0x86e5ee, 0.2, boss.position.x, boss.position.z);
  }

  private startSummon(room: Room, floor: FloorData, boss: Monster, host: BossHost): void {
    const first = findEncounterRoomPosition(floor, room, room.x + 2.5, room.z + 2.5)
      ?? { x: boss.position.x - 2.5, z: boss.position.z };
    const second = findEncounterRoomPosition(floor, room, room.x + room.width - 2.5, room.z + room.depth - 2.5)
      ?? { x: boss.position.x + 2.5, z: boss.position.z };
    this.state.summon1X = first.x;
    this.state.summon1Z = first.z;
    this.state.summon2X = second.x;
    this.state.summon2Z = second.z;
    this.state.reinforcementUsed = 1;
    this.state.attackKind = SUMMON_WARNING;
    this.state.attackTimer = 1.2;
    this.state.attackDuration = 1.2;
    for (const point of [first, second]) {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.9, 28), this.telegraphMaterial(0x71c9ff, 0.48));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(point.x, 0.08, point.z);
      this.scene.add(mesh);
      this.attackMeshes.push(mesh);
    }
    host.showMessage('熔渣援军', '两个蓝色炉印将在 1.2 秒后生成普通援军，本阶段只出现一次');
  }

  private resolveSweep(player: Player, floor: FloorData, room: Room | undefined, host: BossHost): void {
    const dx = player.position.x - this.state.originX;
    const dz = player.position.z - this.state.originZ;
    const distance = Math.hypot(dx, dz);
    const dot = distance > 1e-6 ? (dx * this.state.directionX + dz * this.state.directionZ) / distance : 1;
    if (distance > 6.2 || dot < Math.cos(Math.PI / 3)) return;
    if (room && !roomContainsPoint(room, player.position.x, player.position.z)) return;
    const direction = new THREE.Vector3(dx, 0, dz).normalize();
    if (distance > 0.01 && worldRayDistance(
      floor,
      new THREE.Vector3(this.state.originX, 1, this.state.originZ),
      direction,
      distance,
    ) < distance - 0.05) return;
    host.damagePlayer(this.state.attackDamage, 'fire', 0.12);
  }

  private updateCharge(
    dt: number,
    boss: Monster,
    player: Player,
    floor: FloorData,
    room: Room | undefined,
    host: BossHost,
  ): void {
    boss.faceToward(boss.position.x + this.state.directionX, boss.position.z + this.state.directionZ);
    const time = Math.min(dt, Math.max(0, this.state.attackTimer));
    const desired = Math.min(this.state.chargeRemaining, CHARGE_SPEED * time);
    const direction = new THREE.Vector3(this.state.directionX, 0, this.state.directionZ);
    const wallDistance = this.maskedTravelDistance(floor, room, boss.position.x, boss.position.z,
      direction.x, direction.z, desired, BOSS_RADIUS);
    let travel = Math.max(0, Math.min(desired, wallDistance - 0.04));
    let hitPillar = 0;
    for (let index = 1; index <= 3; index++) {
      if (this.pillarCooldown(index) > 0) continue;
      const hit = segmentCircleHitDistance(
        boss.position.x, boss.position.z,
        this.state.directionX, this.state.directionZ,
        travel,
        this.pillarX(index), this.pillarZ(index),
        1.3,
      );
      if (hit !== null && hit <= travel) {
        travel = Math.max(0, hit - 0.04);
        hitPillar = index;
      }
    }

    const startX = boss.position.x;
    const startZ = boss.position.z;
    boss.position.x += this.state.directionX * travel;
    boss.position.z += this.state.directionZ * travel;
    boss.velocity.set(this.state.directionX * CHARGE_SPEED, 0, this.state.directionZ * CHARGE_SPEED);
    this.state.chargeRemaining = Math.max(0, this.state.chargeRemaining - travel);
    this.state.attackTimer = Math.max(0, this.state.attackTimer - time);

    if (this.state.hitPlayer === 0 && pointSegmentDistanceSquared(
      player.position.x, player.position.z,
      startX, startZ, boss.position.x, boss.position.z,
    ) <= PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
      host.damagePlayer(this.state.attackDamage, 'fire', 0.16);
      this.state.hitPlayer = 1;
    }

    if (hitPillar > 0) {
      this.setPillarCooldown(hitPillar, 10);
      this.exposeCore(host, '阀柱被撞熄，炉芯暴露 3 秒');
      this.finishAttack(host, 3, 0);
      return;
    }
    const hitWall = wallDistance + 0.05 < desired;
    if (hitWall) {
      this.finishAttack(host, 2.3, 1.4);
      host.showMessage('冲锋撞墙', '铸炉执政官进入 1.4 秒制动后摇');
      return;
    }
    if (this.state.attackTimer <= 0 || this.state.chargeRemaining <= 0.05) {
      this.finishAttack(host, 2.2, 1.2);
    }
  }

  private updateSteam(dt: number, player: Player, floor: FloorData, room: Room | undefined, host: BossHost): void {
    this.state.attackTimer = Math.max(0, this.state.attackTimer - dt);
    const pulse = 0.28 + Math.sin(this.state.attackTimer * 16) * 0.08;
    for (const mesh of this.attackMeshes) (mesh.material as THREE.MeshBasicMaterial).opacity = pulse;
    const inside = Math.abs(player.position.x - this.state.steamX) <= this.state.steamHalfWidth
      && Math.abs(player.position.z - this.state.steamZ) <= this.state.steamHalfDepth;
    if (this.state.hitPlayer === 0 && inside && (!room || roomContainsPoint(room, player.position.x, player.position.z))
      && isWalkable(floor, Math.floor(player.position.x), Math.floor(player.position.z))
      && this.steamHasLineOfSight(player, floor)) {
      host.damagePlayer(this.state.attackDamage, 'fire', 0.15);
      this.state.hitPlayer = 1;
    }
    if (this.state.attackTimer <= 0) this.finishAttack(host, this.state.pendingCharge > 0 ? 0.65 : 2.4, 0.7);
  }

  private updateWave(dt: number, player: Player, floor: FloorData, room: Room | undefined, host: BossHost): void {
    const oldRadius = this.state.waveRadius;
    const time = Math.min(dt, Math.max(0, this.state.attackTimer));
    const speed = (this.state.waveMaxRadius - 0.8) / this.state.attackDuration;
    const nextRadius = Math.min(this.state.waveMaxRadius, oldRadius + speed * time);
    if (this.state.hitPlayer === 0 && this.state.playerSampleReady > 0) {
      const hitTime = expandingWaveHitTime(
        this.state.originX, this.state.originZ,
        oldRadius, nextRadius,
        this.state.previousPlayerX, this.state.previousPlayerZ,
        player.position.x, player.position.z,
        WAVE_HALF_THICKNESS,
      );
      if (hitTime !== null) {
        const x = this.state.previousPlayerX + (player.position.x - this.state.previousPlayerX) * hitTime;
        const y = this.state.previousPlayerY + (player.position.y - this.state.previousPlayerY) * hitTime;
        const z = this.state.previousPlayerZ + (player.position.z - this.state.previousPlayerZ) * hitTime;
        const angle = Math.atan2(z - this.state.originZ, x - this.state.originX);
        const distance = Math.hypot(x - this.state.originX, z - this.state.originZ);
        const direction = new THREE.Vector3(x - this.state.originX, 0, z - this.state.originZ).normalize();
        const visible = distance <= 0.01 || worldRayDistance(
          floor,
          new THREE.Vector3(this.state.originX, 0.24, this.state.originZ),
          direction,
          distance,
        ) >= distance - 0.05;
        this.state.hitPlayer = 2;
        if (y <= WAVE_HEIGHT && angleOutsideGap(angle, this.state.waveGapAngle, this.state.waveGapHalfAngle)
          && visible && (!room || roomContainsPoint(room, x, z))) {
          host.damagePlayer(this.state.attackDamage, 'fire', 0.1);
          this.state.hitPlayer = 1;
        }
      }
    }
    this.state.waveRadius = nextRadius;
    this.state.attackTimer = Math.max(0, this.state.attackTimer - time);
    this.redrawWaveFront();
    if (nextRadius >= this.state.waveMaxRadius - 0.01 || this.state.attackTimer <= 0) {
      this.finishAttack(host, 2.5, 0.8);
    }
  }

  private steamHasLineOfSight(player: Player, floor: FloorData): boolean {
    const source = new THREE.Vector3(player.position.x, 0.7, player.position.z);
    const direction = new THREE.Vector3();
    let distance: number;
    if (this.state.steamAxis === 1) {
      source.z = this.state.steamZ - this.state.steamDirection * this.state.steamHalfDepth;
      direction.z = this.state.steamDirection;
      distance = Math.abs(player.position.z - source.z);
    } else {
      source.x = this.state.steamX - this.state.steamDirection * this.state.steamHalfWidth;
      direction.x = this.state.steamDirection;
      distance = Math.abs(player.position.x - source.x);
    }
    return distance <= 0.01 || worldRayDistance(floor, source, direction, distance) >= distance - 0.05;
  }

  private finishAttack(host: BossHost, cooldown: number, stagger: number): void {
    const shouldExpose = this.state.exposeAfterAttack > 0;
    this.removeAttackMeshes();
    this.state.attackKind = NONE;
    this.state.attackTimer = 0;
    this.state.attackDuration = 0;
    this.state.hitPlayer = 0;
    this.state.cooldown = Math.max(this.state.cooldown, cooldown);
    this.state.stagger = Math.max(this.state.stagger, stagger);
    if (shouldExpose) this.exposeCore(host, '一轮过载组合结束，炉芯强制暴露 3 秒');
    this.state.exposeAfterAttack = 0;
  }

  private exposeCore(host: BossHost, subtitle: string): void {
    this.state.exposed = Math.max(this.state.exposed, 3);
    this.state.cooldown = Math.max(this.state.cooldown, 3);
    this.state.stagger = 0;
    host.showMessage('炉芯暴露', subtitle);
  }

  private advanceTowardPlayer(
    dt: number,
    boss: Monster,
    player: Player,
    floor: FloorData,
    room: Room | undefined,
  ): void {
    const direction = new THREE.Vector3(
      player.position.x - boss.position.x,
      0,
      player.position.z - boss.position.z,
    );
    const distance = direction.length();
    boss.faceToward(player.position.x, player.position.z);
    if (distance <= boss.def.attackRange || distance >= boss.def.detectRadius || distance <= 0.001) {
      boss.velocity.set(0, 0, 0);
      return;
    }
    direction.normalize();
    const desired = Math.min(distance - boss.def.attackRange, boss.def.speed * boss.speedMultiplier * boss.slowMultiplier * dt);
    const allowed = this.maskedTravelDistance(floor, room, boss.position.x, boss.position.z,
      direction.x, direction.z, desired, BOSS_RADIUS);
    const travel = Math.max(0, Math.min(desired, allowed - 0.04));
    boss.position.addScaledVector(direction, travel);
    boss.velocity.copy(direction).multiplyScalar(travel > 0 ? travel / Math.max(dt, 1e-6) : 0);
  }

  private maskedTravelDistance(
    floor: FloorData,
    room: Room | undefined,
    startX: number,
    startZ: number,
    directionX: number,
    directionZ: number,
    distance: number,
    radius: number,
  ): number {
    const wallDistance = worldRayDistance(
      floor,
      new THREE.Vector3(startX, 1, startZ),
      new THREE.Vector3(directionX, 0, directionZ),
      distance,
      radius,
    );
    if (!room) return wallDistance;
    const limit = Math.min(distance, wallDistance);
    const steps = Math.max(1, Math.ceil(limit / 0.2));
    let previous = 0;
    for (let step = 1; step <= steps; step++) {
      const travel = limit * step / steps;
      const x = startX + directionX * travel;
      const z = startZ + directionZ * travel;
      const inside = roomContainsPoint(room, x, z)
        && roomContainsPoint(room, x + radius, z)
        && roomContainsPoint(room, x - radius, z)
        && roomContainsPoint(room, x, z + radius)
        && roomContainsPoint(room, x, z - radius);
      if (!inside) return previous;
      previous = travel;
    }
    return limit;
  }

  private ensurePillars(room: Room, floor: FloorData): void {
    if (this.state.pillarsReady === 0) {
      const centerX = room.x + room.width / 2;
      const centerZ = room.z + room.depth / 2;
      const radiusX = Math.max(3, room.width * 0.29);
      const radiusZ = Math.max(3, room.depth * 0.29);
      const angles = [-Math.PI / 2, Math.PI / 6, Math.PI * 5 / 6];
      const points = angles.map(angle => findEncounterRoomPosition(
        floor,
        room,
        centerX + Math.cos(angle) * radiusX,
        centerZ + Math.sin(angle) * radiusZ,
      ) ?? { x: centerX, z: centerZ });
      this.state.pillar1X = points[0].x; this.state.pillar1Z = points[0].z;
      this.state.pillar2X = points[1].x; this.state.pillar2Z = points[1].z;
      this.state.pillar3X = points[2].x; this.state.pillar3Z = points[2].z;
      this.state.pillarsReady = 1;
    }
    if (this.pillarMeshes.length > 0) return;
    for (let index = 1; index <= 3; index++) {
      const group = this.buildPillar(index);
      group.position.set(this.pillarX(index), 0, this.pillarZ(index));
      this.scene.add(group);
      this.pillarMeshes.push(group);
    }
    this.updatePillarAppearance();
  }

  private buildPillar(index: number): THREE.Group {
    const group = new THREE.Group();
    group.name = `foundry-valve-pillar-${index}`;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.82, 0.38, 10),
      new THREE.MeshLambertMaterial({ color: 0x47362c }),
    );
    base.position.y = 0.19;
    group.add(base);
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.5, 2.45, 10),
      new THREE.MeshLambertMaterial({ color: 0x6f4d35 }),
    );
    column.position.y = 1.55;
    group.add(column);
    const valve = new THREE.Mesh(
      new THREE.TorusGeometry(0.54, 0.11, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0xff9f32 }),
    );
    valve.name = 'valve';
    valve.position.set(0, 2.15, 0.38);
    group.add(valve);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.72, 8),
      new THREE.MeshBasicMaterial({ color: 0xffc05a }),
    );
    stem.rotation.z = Math.PI / 2;
    valve.add(stem);
    return group;
  }

  private ensureBossDecoration(boss: Monster): void {
    if (this.bossDecoration?.parent === boss.group) return;
    if (this.bossDecoration) disposeFoundryObject(this.bossDecoration);
    const group = new THREE.Group();
    group.name = 'foundry-furnace-core';
    const furnace = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.72, 1.25, 10, 1, true),
      new THREE.MeshLambertMaterial({ color: 0x382b27, side: THREE.DoubleSide }),
    );
    furnace.rotation.x = Math.PI / 2;
    furnace.position.set(0, 1.65, 0.38);
    group.add(furnace);
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.42, 1),
      new THREE.MeshBasicMaterial({ color: 0xff6a1f }),
    );
    core.name = 'furnace-core';
    core.position.set(0, 1.65, 0.78);
    group.add(core);
    for (const y of [1.18, 2.12]) {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.7, 0.09, 8, 20),
        new THREE.MeshLambertMaterial({ color: 0x8b684c }),
      );
      band.rotation.x = Math.PI / 2;
      band.position.set(0, y, 0.38);
      group.add(band);
    }
    boss.group.add(group);
    this.bossDecoration = group;
    this.coreMesh = core;
  }

  private updateDecoration(dt: number): void {
    if (this.coreMesh) {
      this.coreMesh.rotation.y += dt * (this.state.exposed > 0 ? 5 : 2);
      const material = this.coreMesh.material as THREE.MeshBasicMaterial;
      material.color.setHex(this.state.exposed > 0 ? 0xffd36a : 0xff5a18);
      const scale = this.state.exposed > 0 ? 1.22 : 1;
      this.coreMesh.scale.lerp(new THREE.Vector3(scale, scale, scale), Math.min(1, dt * 10));
    }
  }

  private updatePillarAppearance(): void {
    this.pillarMeshes.forEach((group, offset) => {
      const valve = group.getObjectByName('valve') as THREE.Mesh | undefined;
      if (!valve) return;
      const cooldown = this.pillarCooldown(offset + 1);
      (valve.material as THREE.MeshBasicMaterial).color.setHex(cooldown > 0 ? 0x493b35 : 0xff9f32);
      valve.rotation.z += cooldown > 0 ? 0 : 0.012;
    });
  }

  private redrawSteam(warning: boolean): void {
    this.removeAttackMeshes();
    const geometry = warning
      ? new THREE.PlaneGeometry(this.state.steamHalfWidth * 2, this.state.steamHalfDepth * 2)
      : new THREE.BoxGeometry(this.state.steamHalfWidth * 2, 1.8, this.state.steamHalfDepth * 2);
    const mesh = new THREE.Mesh(
      geometry,
      this.telegraphMaterial(warning ? 0xff7540 : 0xffbd66, warning ? 0.29 : 0.34),
    );
    if (warning) mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(this.state.steamX, warning ? 0.07 : 0.9, this.state.steamZ);
    this.scene.add(mesh);
    this.attackMeshes.push(mesh);
    const arrowCount = 3;
    for (let i = 0; i < arrowCount; i++) {
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 0.5, 3),
        this.telegraphMaterial(0xffe4a1, 0.72),
      );
      const along = (i - 1) * 1.4;
      arrow.rotation.x = Math.PI / 2;
      arrow.rotation.z = this.state.steamAxis === 1
        ? (this.state.steamDirection > 0 ? 0 : Math.PI)
        : (this.state.steamDirection > 0 ? -Math.PI / 2 : Math.PI / 2);
      arrow.position.set(
        this.state.steamX + (this.state.steamAxis === 1 ? along : 0),
        0.1,
        this.state.steamZ + (this.state.steamAxis === 0 ? along : 0),
      );
      this.scene.add(arrow);
      this.attackMeshes.push(arrow);
    }
  }

  private redrawWaveFront(): void {
    const inner = Math.max(0.03, this.state.waveRadius - WAVE_HALF_THICKNESS);
    const existing = this.attackMeshes[0];
    if (existing?.userData.foundryWaveFront === true) {
      updateFoundryGappedRingGeometry(
        existing.geometry,
        inner,
        this.state.waveRadius + WAVE_HALF_THICKNESS,
        this.state.waveGapAngle,
        this.state.waveGapHalfAngle,
      );
      return;
    }
    this.removeAttackMeshes();
    const geometry = foundryGappedRingGeometry(inner, this.state.waveRadius + WAVE_HALF_THICKNESS,
      this.state.waveGapAngle, this.state.waveGapHalfAngle);
    this.addAttackMesh(geometry, 0x86e5ee, 0.72, this.state.originX, this.state.originZ, 0.16);
    this.attackMeshes[0].userData.foundryWaveFront = true;
  }

  private lockDirection(boss: Monster, player: Player): void {
    const dx = player.position.x - boss.position.x;
    const dz = player.position.z - boss.position.z;
    const length = Math.hypot(dx, dz);
    this.state.directionX = length > 1e-6 ? dx / length : 0;
    this.state.directionZ = length > 1e-6 ? dz / length : 1;
    boss.faceToward(boss.position.x + this.state.directionX, boss.position.z + this.state.directionZ);
  }

  private capturePlayer(player: Player): void {
    this.state.previousPlayerX = player.position.x;
    this.state.previousPlayerY = player.position.y;
    this.state.previousPlayerZ = player.position.z;
    this.state.playerSampleReady = 1;
  }

  private updateWarningOpacity(): void {
    const progress = this.state.attackDuration > 0
      ? 1 - Math.max(0, this.state.attackTimer) / this.state.attackDuration : 1;
    for (const mesh of this.attackMeshes) {
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.18 + progress * 0.34;
    }
  }

  private addAttackMesh(
    geometry: THREE.BufferGeometry,
    color: number,
    opacity: number,
    x: number,
    z: number,
    y = 0.075,
  ): void {
    const mesh = new THREE.Mesh(geometry, this.telegraphMaterial(color, opacity));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.renderOrder = 4;
    this.scene.add(mesh);
    this.attackMeshes.push(mesh);
  }

  private telegraphMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
    });
  }

  private cancelAttack(): void {
    this.removeAttackMeshes();
    this.state.attackKind = NONE;
    this.state.attackTimer = 0;
    this.state.pendingCharge = 0;
    this.state.exposeAfterAttack = 0;
    this.state.cooldown = Math.max(this.state.cooldown, 2.5);
  }

  private removeAttackMeshes(): void {
    for (const mesh of this.attackMeshes) disposeFoundryObject(mesh);
    this.attackMeshes = [];
  }

  private destroyVisuals(): void {
    this.removeAttackMeshes();
    for (const pillar of this.pillarMeshes) disposeFoundryObject(pillar);
    this.pillarMeshes = [];
    if (this.bossDecoration) disposeFoundryObject(this.bossDecoration);
    this.bossDecoration = null;
    this.coreMesh = null;
  }

  private pillarX(index: number): number {
    return index === 1 ? this.state.pillar1X : index === 2 ? this.state.pillar2X : this.state.pillar3X;
  }

  private pillarZ(index: number): number {
    return index === 1 ? this.state.pillar1Z : index === 2 ? this.state.pillar2Z : this.state.pillar3Z;
  }

  private pillarCooldown(index: number): number {
    return index === 1 ? this.state.pillar1Cooldown : index === 2 ? this.state.pillar2Cooldown : this.state.pillar3Cooldown;
  }

  private setPillarCooldown(index: number, value: number): void {
    if (index === 1) this.state.pillar1Cooldown = value;
    else if (index === 2) this.state.pillar2Cooldown = value;
    else this.state.pillar3Cooldown = value;
  }
}
