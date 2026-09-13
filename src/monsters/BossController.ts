import { monsterAggression, monsterPursuitRate } from './EnemyIntent';
import { findEncounterRoomPosition, getEncounterBarriers } from '../world/EncounterBarriers';
import * as THREE from 'three';
import { decorateTelegraph, disposeTelegraphArt } from '../ui/CombatArt';
import type { FloorData, ElementType } from '../types';
import type { Monster } from './Monster';
import type { Player } from '../player/Player';
import type { Effects } from '../core/Effects';
import type { AudioManager } from '../core/AudioManager';
import { BlockKind } from '../world/Block';
import { MonsterSpawner } from './MonsterSpawner';

interface Warning {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  kind: 'cone' | 'circle' | 'dash' | 'summon';
  position: THREE.Vector3;
  direction: THREE.Vector3;
  radius: number;
  halfAngle: number;
  damage: number;
  element: ElementType;
}

export interface BossHost {
  damagePlayer(amount: number, element: ElementType, statusChance?: number): void;
  summonMinion(position: THREE.Vector3): void;
  showMessage(title: string, subtitle?: string): void;
}

export class BossController {
  private phase = 1;
  private attackTimer = 1.2;
  private dashTimer = 5;
  private summonTimer = 4;
  private warnings: Warning[] = [];
  private dashDirection = new THREE.Vector3(1, 0, 0);
  private dashTime = 0;

  constructor(
    private scene: THREE.Scene,
    private effects: Effects,
    private audio: AudioManager,
  ) {}

  update(
    dt: number,
    boss: Monster,
    player: Player,
    floor: FloorData | null,
    host: BossHost,
    attackDamage: number,
  ): void {
    if (boss.dead) {
      this.clearWarnings();
      return;
    }

    const ratio = boss.maxHealth > 0 ? boss.health / boss.maxHealth : 0;
    const nextPhase = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
    if (nextPhase !== this.phase) {
      this.phase = nextPhase;
      this.effects.explosion(boss.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 0xb56bff);
      this.audio.explosion();
      host.showMessage(
        this.phase === 2 ? '深渊领主进入第二阶段' : '深渊领主进入最终阶段',
        '新的攻击模式已激活',
      );
    }

    if (!this.warnings.length && this.dashTime <= 0) boss.faceToward(player.position.x, player.position.z);
    // Lord gains 10% cadence over its previous 1.6 baseline; other bosses unchanged.
    const cadence = boss.def.id === 'boss' ? 1.6 * 1.1 : 2;
    this.attackTimer -= dt * cadence * monsterAggression(boss);
    this.dashTimer -= dt * cadence * monsterAggression(boss);
    this.summonTimer -= dt * cadence * monsterAggression(boss);
    this.dashTime -= dt;

    if (this.warnings.some(warning => warning.kind === 'dash')) {
      boss.velocity.set(0, 0, 0);
      this.updateWarnings(dt, player, host);
      return;
    }

    if (this.dashTime > 0) {
      const speed = this.phase === 3 ? 15 : 12;
      boss.position.addScaledVector(this.dashDirection, speed * dt);
      boss.velocity.copy(this.dashDirection).multiplyScalar(speed);
      this.clampBossToFloor(boss, floor);
      const distance = player.position.distanceTo(boss.position);
      if (distance < 1.8 && boss.attackCooldown <= 0) {
        host.damagePlayer(Math.max(1, Math.round(attackDamage * 1.4)), 'shadow', boss.def.statusChance);
        boss.attackCooldown = boss.def.attackCooldown;
      }
      this.updateWarnings(dt, player, host);
      return;
    }

    // Slow advance toward player outside of ability casts.
    const toPlayer = new THREE.Vector3(
      player.position.x - boss.position.x,
      0,
      player.position.z - boss.position.z,
    );
    const distance = toPlayer.length();
    if (distance > boss.def.attackRange && distance < boss.def.detectRadius) {
      boss.movementAttempted=true;
      const speed = boss.def.speed * boss.speedMultiplier * boss.slowMultiplier * monsterPursuitRate(boss);
      toPlayer.normalize();
      boss.position.addScaledVector(toPlayer, speed * dt);
      boss.velocity.copy(toPlayer).multiplyScalar(speed);
      this.clampBossToFloor(boss, floor);
    } else {
      boss.velocity.set(0, 0, 0);
    }

    if (this.attackTimer <= 0 && distance < 18) {
      if (this.phase === 1) {
        this.queueCone(boss, player, attackDamage);
        this.attackTimer = 3.1;
      } else {
        this.queueCircle(player, attackDamage);
        this.attackTimer = this.phase === 2 ? 2.35 : 1.9;
      }
    }

    if (this.phase === 3 && this.summonTimer <= 0 && distance < 18) {
      for (let i = 0; i < 3; i++) {
        const angle = (Math.PI * 2 * i) / 3;
        const target = boss.position.clone().add(new THREE.Vector3(Math.cos(angle) * 2.4, 0, Math.sin(angle) * 2.4));
        const room = floor?.rooms.find(candidate => candidate.id === boss.roomId);
        const spot = floor && room ? findEncounterRoomPosition(floor, room, target.x, target.z) : null;
        if (spot) target.set(spot.x, 0, spot.z);
        this.queueSummon(target);
      }
      this.summonTimer = 6;
    }

    if (this.phase >= 2 && this.dashTimer <= 0 && distance > 4) {
      this.queueDash(boss, player, attackDamage);
      this.dashTimer = this.phase === 2 ? 6 : 4.5;
    }

    this.updateWarnings(dt, player, host);
  }

  private clampBossToFloor(boss: Monster, floor: FloorData | null): void {
    if (!floor) return;
    const room = floor.rooms.find(candidate => candidate.id === boss.roomId);
    if (room && getEncounterBarriers(floor).some(barrier => barrier.roomId === boss.roomId)) {
      boss.position.x = Math.max(room.x + .8, Math.min(room.x + room.width - .8, boss.position.x));
      boss.position.z = Math.max(room.z + .8, Math.min(room.z + room.depth - .8, boss.position.z));
      if (!MonsterSpawner.isWalkableCell(floor, boss.position.x, boss.position.z)) {
        const spot = findEncounterRoomPosition(floor, room, boss.position.x, boss.position.z);
        if (spot) { boss.position.x = spot.x; boss.position.z = spot.z; }
      }
      return;
    }
    const max = floor.size - 0.5;
    boss.position.x = Math.max(0.5, Math.min(max, boss.position.x));
    boss.position.z = Math.max(0.5, Math.min(max, boss.position.z));
    if (!MonsterSpawner.isWalkableCell(floor, boss.position.x, boss.position.z)) {
      const spot = MonsterSpawner.findNearestWalkable(floor, boss.position.x, boss.position.z);
      if (spot) {
        boss.position.x = spot.x + 0.5;
        boss.position.z = spot.z + 0.5;
      }
    }
  }

  private queueSummon(position: THREE.Vector3): void {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(.8, 24), new THREE.MeshBasicMaterial({ color: 0x72caff, transparent: true, opacity: .4, depthWrite: false, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.copy(position); mesh.position.y = .06;
    decorateTelegraph(mesh, 'landing', 1.5);
    this.scene.add(mesh);
    this.warnings.push({ mesh, life: 1.5, maxLife: 1.5, kind: 'summon', position, direction: new THREE.Vector3(), radius: .8, halfAngle: 0, damage: 0, element: 'shadow' });
  }

  private queueCone(boss: Monster, player: Player, attackDamage: number): void {
    const direction = new THREE.Vector3(player.position.x - boss.position.x, 0, player.position.z - boss.position.z).normalize();
    if (direction.lengthSq() === 0) direction.set(0, 0, 1);
    const geometry = new THREE.CircleGeometry(5.5, 32, -Math.atan2(direction.z, direction.x) - Math.PI / 4.8, Math.PI / 2.4);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff3b3b,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(boss.position).add(new THREE.Vector3(0, 0.06, 0));
    decorateTelegraph(mesh, 'cone', 2, 2, -Math.atan2(direction.z, direction.x) - Math.PI / 2);
    mesh.children[0].position.set(direction.x * 2.8, -direction.z * 2.8, .015);
    this.scene.add(mesh);
    this.audio.warn();
    this.warnings.push({
      mesh,
      life: 0.85,
      maxLife: 0.85,
      kind: 'cone',
      position: boss.position.clone(),
      direction,
      radius: 5.5,
      halfAngle: Math.PI / 4.8,
      damage: attackDamage,
      element: 'shadow',
    });
  }

  private queueCircle(player: Player, attackDamage: number): void {
    const geometry = new THREE.CircleGeometry(3.1, 48);
    const material = new THREE.MeshBasicMaterial({
      color: this.phase === 2 ? 0xc05bff : 0xff6a2a,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(player.position);
    mesh.position.y = 0.06;
    decorateTelegraph(mesh, 'landing', 5.8);
    this.scene.add(mesh);
    this.audio.warn();
    this.warnings.push({
      mesh,
      life: this.phase === 2 ? 1.15 : 0.85,
      maxLife: this.phase === 2 ? 1.15 : 0.85,
      kind: 'circle',
      position: player.position.clone(),
      direction: new THREE.Vector3(),
      radius: 2.7,
      halfAngle: Math.PI,
      damage: Math.round(attackDamage * 1.25),
      element: this.phase === 2 ? 'shadow' : 'fire',
    });
  }

  private queueDash(boss: Monster, player: Player, attackDamage: number): void {
    this.dashDirection = new THREE.Vector3(player.position.x - boss.position.x, 0, player.position.z - boss.position.z).normalize();
    if (this.dashDirection.lengthSq() === 0) this.dashDirection.set(0, 0, 1);
    this.dashTime = 0;
    const travel = (this.phase === 3 ? 15 : 12) * .55;
    const geometry = new THREE.PlaneGeometry(3.6, travel + 3.6);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff3b3b,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(boss.position).addScaledVector(this.dashDirection, travel / 2);
    mesh.position.y = 0.06;
    mesh.rotation.z = -Math.atan2(this.dashDirection.x, this.dashDirection.z);
    decorateTelegraph(mesh, 'lane', 3.2, travel + 3.2);
    this.scene.add(mesh);
    this.audio.warn();
    this.warnings.push({
      mesh,
      life: 0.8,
      maxLife: 0.8,
      kind: 'dash',
      position: boss.position.clone(),
      direction: this.dashDirection.clone(),
      radius: 8,
      halfAngle: 0.35,
      damage: attackDamage,
      element: 'shadow',
    });
  }

  private updateWarnings(dt: number, player: Player, host: BossHost): void {
    for (let i = this.warnings.length - 1; i >= 0; i--) {
      const warning = this.warnings[i];
      warning.life -= dt * 2;
      const progress = 1 - warning.life / warning.maxLife;
      warning.mesh.scale.setScalar(1);
      const material = warning.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = .15 + progress * .22;

      if (warning.life <= 0) {
        this.resolveWarning(warning, player, host);
        this.scene.remove(warning.mesh);
        disposeTelegraphArt(warning.mesh);
        warning.mesh.geometry.dispose();
        material.dispose();
        this.warnings.splice(i, 1);
      }
    }
  }

  private resolveWarning(warning: Warning, player: Player, host: BossHost): void {
    if (warning.kind === 'summon') { host.summonMinion(warning.position); return; }
    const dx = player.position.x - warning.position.x;
    const dz = player.position.z - warning.position.z;
    const distance = Math.hypot(dx, dz);
    if (warning.kind === 'circle') {
      if (distance <= warning.radius + 0.4) {
        host.damagePlayer(warning.damage, warning.element, 0.2);
      }
      return;
    }
    const rawAngle = Math.atan2(dx, dz) - Math.atan2(warning.direction.x, warning.direction.z);
    const angle = Math.atan2(Math.sin(rawAngle), Math.cos(rawAngle));
    if (warning.kind === 'cone') {
      if (distance <= warning.radius && Math.abs(angle) <= warning.halfAngle) {
        host.damagePlayer(warning.damage, warning.element, 0.22);
      }
      return;
    }
    if (warning.kind === 'dash') {
      this.dashDirection.copy(warning.direction);
      this.dashTime = .55;
    }
  }

  clearWarnings(): void {
    this.warnings.forEach((warning) => {
      this.scene.remove(warning.mesh);
      disposeTelegraphArt(warning.mesh);
      warning.mesh.geometry.dispose();
      (warning.mesh.material as THREE.Material).dispose();
    });
    this.warnings = [];
    this.phase = 1; this.attackTimer = 1.2; this.dashTimer = 5; this.summonTimer = 4; this.dashTime = 0;
  }
}
