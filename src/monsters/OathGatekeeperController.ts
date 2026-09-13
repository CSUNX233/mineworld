import { monsterAggression, monsterPursuitRate } from './EnemyIntent';
import * as THREE from 'three';
import type { ElementType, FloorData } from '../types';
import type { Monster } from './Monster';
import type { Player } from '../player/Player';
import type { BossHost } from './BossController';
import { disposeFoundryObject, foundrySectorGeometry } from './FoundryBossGeometry';
import { worldRayDistance } from '../world/SpatialQueries';
import { MonsterAI } from './MonsterAI';
import { findEncounterRoomPosition } from '../world/EncounterBarriers';

export interface OathGatekeeperHost extends BossHost {
  damagePlayer(amount: number, element: ElementType, statusChance?: number, kind?: 'sword' | 'shield'): void;
  damageMelee?(amount: number): void;
}

export interface OathGatekeeperState { phase: number; cooldown: number; cycle: number; reinforcementUsed: boolean; angle: number }
const initial = (): OathGatekeeperState => ({ phase: 1, cooldown: 1.0, cycle: 0, reinforcementUsed: false, angle: 0 });

/** Floor-five sword/shield boss; warning state is intentionally cancelled on load. */
export class OathGatekeeperController {
  private state = initial();
  private warning: THREE.Object3D | null = null;
  private timer = 0;
  private duration = 0;
  private second = false;
  private summoning = false;
  private origin = new THREE.Vector3();
  private shield: THREE.Mesh | null = null;
  private sword: THREE.Mesh | null = null;
  private actor: Monster | null = null;
  private decoration: THREE.Group | null = null;
  private attackKind: 'sword' | 'shield' = 'sword';
  private summonPositions: THREE.Vector3[] = [];
  constructor(private scene: THREE.Scene) {}

  snapshot(): OathGatekeeperState { return { ...this.state }; }
  restore(value: OathGatekeeperState): void {
    this.clear();
    this.state = {
      phase: value.phase === 2 ? 2 : 1,
      cooldown: Math.max(1.5, Number.isFinite(value.cooldown) ? value.cooldown : 1.5),
      cycle: Math.max(0, Number.isFinite(value.cycle) ? Math.floor(value.cycle) : 0),
      // Older partial saves in phase two must not summon another army on load.
      reinforcementUsed: typeof value.reinforcementUsed === 'boolean' ? value.reinforcementUsed : value.phase === 2,
      angle: Number.isFinite(value.angle) ? value.angle : 0,
    };
  }
  private removeWarning(): void {
    if (!this.warning) return;
    disposeFoundryObject(this.warning); this.warning = null;
  }
  clear(): void {
    this.removeWarning(); this.timer = 0; this.duration = 0; this.second = false; this.summoning = false;
    if (this.decoration) disposeFoundryObject(this.decoration);
    this.decoration = null; this.summonPositions = [];
    this.actor = null; this.shield = this.sword = null; this.state = initial();
  }
  damageMultiplier(boss: Monster, source?: THREE.Vector3): number {
    if (!source || this.state.phase !== 1 || this.warning || this.state.cooldown > 0) return 1;
    const delta = source.clone().sub(boss.position);
    return Math.cos(Math.atan2(delta.z, delta.x) - this.state.angle) > .45 ? .75 : 1;
  }
  private attach(boss: Monster): void {
    if (this.actor === boss) return;
    if (this.decoration) disposeFoundryObject(this.decoration);
    this.actor = boss;
    this.decoration = new THREE.Group(); this.decoration.name = 'oath-gatekeeper-arms'; boss.group.add(this.decoration);
    this.shield = new THREE.Mesh(new THREE.BoxGeometry(.9, 1.25, .18), new THREE.MeshLambertMaterial({ color: 0x8c8262 }));
    this.shield.position.set(-.75, 1.15, .65); this.decoration.add(this.shield);
    this.sword = new THREE.Mesh(new THREE.BoxGeometry(.16, 1.6, .25), new THREE.MeshLambertMaterial({ color: 0xb3b4a0 }));
    this.sword.position.set(.8, 1.2, .55); this.sword.rotation.z = -.25; this.decoration.add(this.sword);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(.8, .65, .06), new THREE.MeshLambertMaterial({ color: 0x6a3635 }));
    banner.position.set(0, 2.45, -.3); this.decoration.add(banner);
  }
  private queue(boss: Monster, duration: number): void {
    this.removeWarning();
    this.origin.copy(boss.position); this.origin.y = .06;
    this.warning = new THREE.Mesh(foundrySectorGeometry(this.attackKind === 'shield' ? 3.2 : 3.8, this.state.angle, this.attackKind === 'shield' ? .95 : .8), new THREE.MeshBasicMaterial({
      color: this.second ? 0xffb75b : 0xe99764, transparent: true, opacity: .45, side: THREE.DoubleSide, depthWrite: false }));
    this.warning.rotation.x = -Math.PI / 2; this.warning.position.copy(this.origin); this.scene.add(this.warning);
    this.timer = this.duration = duration;
  }
  update(dt: number, boss: Monster, player: Player, floor: FloorData, host: OathGatekeeperHost, attack: number): void {
    if (boss.dead) { this.clear(); return; }
    this.attach(boss);
    boss.velocity.set(0, 0, 0);
    if (!player.alive) {
      this.removeWarning(); this.timer = 0; this.second = false; this.summoning = false;
      this.state.cooldown = Math.max(1.5, this.state.cooldown); return;
    }
    if (dt <= 0) return;
    if (boss.health / boss.maxHealth <= .6 && this.state.phase === 1) {
      this.state.phase = 2; this.removeWarning(); this.second = false; this.timer = 0;
      this.state.cooldown = 1.0;
      host.showMessage('断旗奋战', '盾已破碎 · 注意两次挥剑，趁收势进攻');
    }
    if (this.shield) this.shield.visible = this.state.phase === 1;
    if (boss.slowMultiplier <= 0 || boss.statuses.some(status => status.type === 'frozen' && status.duration > 0)) return;
    const activeDt = dt * Math.min(1, boss.slowMultiplier);
    if (this.state.phase === 2 && !this.state.reinforcementUsed && this.state.cooldown <= 0 && !this.warning) {
      this.state.reinforcementUsed = true; this.summoning = true;
      const room = floor.rooms.find(candidate => candidate.id === boss.roomId);
      this.summonPositions = [];
      if (room) for (const side of [-1, 1]) {
        const spot = findEncounterRoomPosition(floor, room, boss.position.x + side * 2.2, boss.position.z);
        if (spot && !this.summonPositions.some(p => Math.hypot(p.x - spot.x, p.z - spot.z) < .8)) this.summonPositions.push(new THREE.Vector3(spot.x, 0, spot.z));
      }
      const warning = new THREE.Group();
      for (const spot of this.summonPositions) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(.55, .7, 24), new THREE.MeshBasicMaterial({ color: 0xe4c47c, side: THREE.DoubleSide, transparent: true, opacity: .6 }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(spot.x, .08, spot.z); warning.add(ring);
      }
      this.warning = warning; this.scene.add(warning); this.timer = this.duration = 1.1;
      host.showMessage('旧军响应', '两名守军即将到来');
    }
    if (this.shield && this.state.phase === 1) {
      const raised = !this.warning && this.state.cooldown <= 0;
      this.shield.position.y = raised || this.attackKind === 'shield' && !!this.warning ? 1.15 : .7;
      this.shield.rotation.x = raised ? 0 : .45;
    }
    if (this.sword) {
      const progress = this.warning && !this.summoning ? 1 - Math.max(0, this.timer) / Math.max(.001, this.duration) : 0;
      const swing = Math.max(0, Math.min(1, (progress - .72) / .28));
      this.sword.rotation.z = this.attackKind === 'sword' && this.warning ? -.85 + swing * 2.0 : -.25;
      this.sword.rotation.x = this.attackKind === 'sword' && this.warning ? -.2 - swing * 1.0 : 0;
      this.sword.position.z = this.attackKind === 'sword' && this.warning ? .55 + Math.sin(swing * Math.PI) * .6 : .55;
    }
    if (this.warning) {
      this.timer -= activeDt * 2;
      boss.faceToward(boss.position.x + Math.cos(this.state.angle), boss.position.z + Math.sin(this.state.angle));
      if (this.timer > 0) return;
      this.removeWarning();
      if (this.summoning) {
        this.summoning = false;
        for (const spot of this.summonPositions) host.summonMinion(spot.clone());
        this.summonPositions = [];
        this.state.cooldown = 1.25; return;
      }
      const offset = player.position.clone().sub(this.origin); offset.y = 0;
      const distance = offset.length();
      const angle = Math.atan2(offset.z, offset.x) - this.state.angle;
      const origin = this.origin.clone(); origin.y = 1;
      if (distance < (this.attackKind === 'shield' ? 3.2 : 3.8) && Math.cos(angle) >= Math.cos(this.attackKind === 'shield' ? .95 : .8)
        && worldRayDistance(floor, origin, offset.normalize(), distance) >= distance - .05) {
        const damage = attack * (this.state.phase === 1 ? 1 : .5);
        if (this.attackKind === 'sword' && host.damageMelee) host.damageMelee(damage);
        else host.damagePlayer(damage, 'physical', 0, this.attackKind);
      }
      if (this.state.phase === 2 && !this.second) { this.second = true; this.queue(boss, .6); }
      else { this.second = false; this.state.cooldown = this.state.phase === 1 ? 1.15 : 1.45; }
      return;
    }
    this.state.cooldown = Math.max(0, this.state.cooldown - activeDt * 2 * monsterAggression(boss));
    // Track during recovery as well, while an announced attack still keeps its locked direction.
    const desired = Math.atan2(player.position.z - boss.position.z, player.position.x - boss.position.x);
    const difference = Math.atan2(Math.sin(desired - this.state.angle), Math.cos(desired - this.state.angle));
    this.state.angle += Math.max(-activeDt * 5 * monsterPursuitRate(boss), Math.min(activeDt * 5 * monsterPursuitRate(boss), difference));
    boss.faceToward(boss.position.x + Math.cos(this.state.angle), boss.position.z + Math.sin(this.state.angle));
    if (this.state.cooldown > 0) return;
    // On the frame the phase-transition delay ends, reserve the next cast for
    // the marked summons instead of constructing an immediately replaced sword warning.
    if (this.state.phase === 2 && !this.state.reinforcementUsed) return;
    if (boss.position.distanceTo(player.position) > 3) {
      boss.state = 'chase'; MonsterAI.update(boss, dt, player, floor);
    } else if (Math.abs(difference) < .35) {
      this.attackKind = this.state.phase === 1 && this.state.cycle % 2 === 1 ? 'shield' : 'sword';
      this.state.cycle++; this.queue(boss, this.attackKind === 'shield' ? .7 : .8);
    }
    boss.faceToward(boss.position.x + Math.cos(this.state.angle), boss.position.z + Math.sin(this.state.angle));
  }
}
