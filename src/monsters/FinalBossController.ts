import * as THREE from 'three';
import { decorateTelegraph, disposeTelegraphArt } from '../ui/CombatArt';
import type { FloorData } from '../types';
import type { Monster } from './Monster';
import type { Player } from '../player/Player';
import type { BossHost } from './BossController';
import { worldRayDistance } from '../world/SpatialQueries';
import { findEncounterRoomPosition } from '../world/EncounterBarriers';

export interface WardenWarning {
  kind: 'blast' | 'sweep' | 'reinforcement';
  x: number; z: number; dx: number; dz: number;
  remaining: number; duration: number; radius: number; damage: number;
}
export interface FinalBossState {
  phase: number; cooldown: number; recovery: number; cycle: number;
  warnings: WardenWarning[];
}
interface FinalBossHost extends BossHost { livingMinions(): number }

/** The final encounter combines locked telegraphs, limited reinforcements and an exposed core. */
export class FinalBossController {
  private state: FinalBossState = { phase: 1, cooldown: 1.8, recovery: 0, cycle: 0, warnings: [] };
  private meshes = new Map<WardenWarning, THREE.Mesh>();
  constructor(private scene: THREE.Scene) {}

  get damageMultiplier(): number { return this.state.recovery > 0 ? 1.5 : .8; }

  snapshot(): FinalBossState { return structuredClone(this.state); }
  restore(state: FinalBossState): void {
    this.clear();
    this.state = structuredClone(state);
    for (const warning of this.state.warnings) this.draw(warning);
  }

  update(dt: number, boss: Monster, player: Player, floor: FloorData, host: FinalBossHost, attack: number): void {
    if (boss.dead) { this.clear(); return; }
    if (dt <= 0) return;
    boss.velocity.set(0, 0, 0);
    boss.faceToward(player.position.x, player.position.z);
    const phase = boss.health / boss.maxHealth > .66 ? 1 : boss.health / boss.maxHealth > .33 ? 2 : 3;
    if (phase !== this.state.phase) {
      this.state.phase = phase;
      host.showMessage(`遗迹监守者 · 第 ${phase} 阶段`, phase === 2 ? '双重落点：离开预警圈，蓄力结束后反击' : '援军仪式：先清支援，利用核心暴露窗口');
    }
    let core = boss.group.getObjectByName('warden-core') as THREE.Mesh | undefined;
    if (!core) {
      core = new THREE.Mesh(new THREE.OctahedronGeometry(.48), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
      core.name = 'warden-core'; core.position.y = 2.8; boss.group.add(core);
    }
    (core.material as THREE.MeshBasicMaterial).color.setHex(this.state.recovery > 0 ? 0xff9b39 : 0x74bad8);
    core.rotation.y += dt;
    this.state.recovery = Math.max(0, this.state.recovery - dt);
    this.state.cooldown = Math.max(0, this.state.cooldown - dt);
    let resolved = false;
    for (const warning of [...this.state.warnings]) {
      warning.remaining = Math.max(0, warning.remaining - dt);
      const mesh = this.meshes.get(warning);
      if (mesh) (mesh.material as THREE.MeshBasicMaterial).opacity = .15 + .22 * (1 - warning.remaining / warning.duration);
      if (warning.remaining > 0) continue;
      if (warning.kind === 'reinforcement') {
        if (host.livingMinions() < 4) host.summonMinion(new THREE.Vector3(warning.x, 0, warning.z));
      } else {
        const dx = player.position.x - warning.x, dz = player.position.z - warning.z;
        const distance = Math.hypot(dx, dz);
        const inside = distance <= warning.radius && (warning.kind === 'blast' || distance < .001 || (dx * warning.dx + dz * warning.dz) / distance >= Math.cos(Math.PI / 4));
        const origin = new THREE.Vector3(warning.x, 1, warning.z);
        const direction = new THREE.Vector3(dx, 0, dz).normalize();
        if (inside && (distance < .01 || worldRayDistance(floor, origin, direction, distance) >= distance - .05)) host.damagePlayer(warning.damage, 'shadow', 0);
      }
      this.remove(warning);
      this.state.warnings.splice(this.state.warnings.indexOf(warning), 1);
      resolved = true;
      if (!player.alive) break;
    }
    if (resolved && !this.state.warnings.length && player.alive) {
      this.state.recovery = 2.4;
      this.state.cooldown = 3.2;
      host.showMessage('核心暴露', '橙色核心：2.4 秒内直接命中伤害提高，可集中输出');
    }
    if (!player.alive || this.state.cooldown > 0 || this.state.warnings.length || this.state.recovery > 0) return;
    const room = floor.rooms.find(candidate => candidate.id === boss.roomId);
    const cycle = this.state.cycle++;
    if (phase === 3 && cycle % 3 === 2 && host.livingMinions() < 4) {
      const roomCenter = room?.center ?? { x: boss.position.x, z: boss.position.z };
      for (const side of [-1, 1]) {
        const point = room ? findEncounterRoomPosition(floor, room, roomCenter.x + side * 3, roomCenter.z + 2) : roomCenter;
        if (point) this.queue('reinforcement', point.x, point.z, 0, 0, 1.8, .8, 0);
      }
      host.showMessage('援军仪式', '蓝色标记将在 1.8 秒后出现援军，最多同时 4 只');
    } else if (phase >= 2 && cycle % 2 === 1) {
      this.queue('blast', player.position.x, player.position.z, 0, 0, 1.2, 1.8, Math.round(attack * 1.15));
      const point = room ? findEncounterRoomPosition(floor, room, boss.position.x + 3, boss.position.z - 3) : boss.position;
      if (point && Math.hypot(point.x - player.position.x, point.z - player.position.z) > 3.6) this.queue('blast', point.x, point.z, 0, 0, 1.7, 1.8, attack);
      host.showMessage('双重震荡', '预警落点已锁定：离开圆圈，等待核心暴露');
    } else {
      const direction = player.position.clone().sub(boss.position).setY(0).normalize();
      if (direction.lengthSq() === 0) direction.z = 1;
      this.queue('sweep', boss.position.x, boss.position.z, direction.x, direction.z, 1.1, 6, attack);
      host.showMessage('防线扫击', '方向已锁定：绕到侧后或退到扇形之外');
    }
    this.state.cooldown = 2;
  }

  private queue(kind: WardenWarning['kind'], x: number, z: number, dx: number, dz: number, duration: number, radius: number, damage: number): void {
    const warning = { kind, x, z, dx, dz, remaining: duration, duration, radius, damage };
    this.state.warnings.push(warning); this.draw(warning);
  }
  private draw(warning: WardenWarning): void {
    const angle = Math.atan2(warning.dz, warning.dx);
    const geometry = warning.kind === 'sweep'
      ? new THREE.CircleGeometry(warning.radius, 32, -angle - Math.PI / 4, Math.PI / 2)
      : new THREE.CircleGeometry(warning.radius, 32);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: warning.kind === 'reinforcement' ? 0x72caff : 0xff684c, transparent: true, opacity: .35, depthWrite: false, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(warning.x, .07, warning.z);
    if (warning.kind === 'sweep') {
      decorateTelegraph(mesh, 'cone', warning.radius * .65, warning.radius * .65, -angle - Math.PI / 2);
      mesh.children[0].position.set(warning.dx * warning.radius * .5, -warning.dz * warning.radius * .5, .015);
    } else decorateTelegraph(mesh, 'landing', warning.radius * 1.9);
    this.scene.add(mesh); this.meshes.set(warning, mesh);
  }
  private remove(warning: WardenWarning): void {
    const mesh = this.meshes.get(warning);
    if (!mesh) return;
    disposeTelegraphArt(mesh);
    this.scene.remove(mesh); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); this.meshes.delete(warning);
  }
  clear(): void {
    for (const warning of this.meshes.keys()) this.remove(warning);
    this.state = { phase: 1, cooldown: 1.8, recovery: 0, cycle: 0, warnings: [] };
  }
}
