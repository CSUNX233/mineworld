import * as THREE from 'three';
import type { FloorData } from '../types';
import type { Monster } from '../monsters/Monster';
import { isWalkable } from '../world/FloorGenerator';
import { directionToPlayer } from '../world/Navigation';
import { worldRayDistance } from '../world/SpatialQueries';
import { SummonUnit } from './SummonUnit';
import { validateSnapshot } from './validation';
import {
  SUMMON_CAPACITY,
  type RaiseResult,
  type SerializedSummonUnit,
  type SummonCommandMode,
  type SummonConfig,
  type SummonDirection,
  type SummonEffect,
  type SummonEndReason,
  type SummonHost,
  type SummonOwner,
  type SummonRole,
  type SummonSnapshot,
  type SummonStatus,
  type TemporarySummonOptions,
} from './types';

const EMPTY_HOST: SummonHost = { damage: () => undefined, shield: () => undefined };
const ROLE_LIFE: Record<SummonRole, number> = { warrior: 42, guardian: 36, archer: 40 };
const ROLE_HEALTH: Record<SummonRole, number> = { warrior: 0.38, guardian: 0.76, archer: 0.28 };
const ROLE_ATTACK: Record<SummonRole, number> = { warrior: 0.54, guardian: 0.26, archer: 0.48 };
const ROLE_SPEED: Record<SummonRole, number> = { warrior: 3.25, guardian: 2.3, archer: 2.8 };

interface Signal {
  line: THREE.Line;
  life: number;
}

function normalizedConfig(config: SummonConfig): Required<SummonConfig> {
  return {
    attack: Math.max(0, Number.isFinite(config.attack) ? config.attack : 0),
    maxHealth: Math.max(1, Number.isFinite(config.maxHealth) ? config.maxHealth : 1),
    capacity: THREE.MathUtils.clamp(Math.floor(config.capacity ?? 4), 0, 6),
    direction: config.direction === 'elite' ? 'elite' : 'legion',
    guardianShield: Math.max(0, Number.isFinite(config.guardianShield) ? config.guardianShield! : 0),
    entityLimit: THREE.MathUtils.clamp(Math.floor(config.entityLimit ?? 6), 1, 6),
  };
}

function preset(direction: SummonDirection, capacity: number): SummonRole[] {
  if (capacity <= 0) return [];
  if (capacity === 1) return ['warrior'];
  if (capacity === 2) return ['warrior', 'archer'];
  if (capacity === 3) return ['guardian', 'archer'];
  const result: SummonRole[] = ['warrior', 'guardian', 'archer'];
  if (direction === 'legion' && capacity >= 5) result.push('warrior');
  if (direction === 'legion' && capacity >= 6) result.push('archer');
  return result;
}

export class SummonSystem {
  private readonly units: SummonUnit[] = [];
  private nextId = 1;
  private mode: SummonCommandMode = 'autonomous';
  private focusTarget: Monster | null = null;
  private pendingFocusTargetId: number | null = null;
  private raiseCooldown = 0;
  private coordinationCooldown = 0;
  private guardianShieldBudget = 3;
  private coverSynergyBudget = 8;
  private mark: { targetId: number; remaining: number } | null = null;
  private elapsed = 0;
  private floorIdentity: string | null = null;
  private lastConfig = normalizedConfig({ attack: 0, maxHealth: 1, direction: 'legion' });
  private signals: Signal[] = [];
  private focusLine: THREE.Line | null = null;

  constructor(private readonly scene: THREE.Scene) {}

  get count(): number { return this.units.length; }
  get capacityUsed(): number { return this.units.reduce((sum, unit) => sum + SUMMON_CAPACITY[unit.role], 0); }
  get status(): SummonStatus {
    const roles: Record<SummonRole, number> = { warrior: 0, guardian: 0, archer: 0 };
    this.units.forEach(unit => roles[unit.role]++);
    return {
      count: this.count,
      capacityUsed: this.capacityUsed,
      capacity: this.lastConfig.capacity,
      entityLimit: this.lastConfig.entityLimit,
      direction: this.lastConfig.direction,
      mode: this.mode,
      focusTargetId: this.focusTarget?.id ?? this.pendingFocusTargetId,
      raiseCooldown: this.raiseCooldown,
      guardianShieldBudget: this.guardianShieldBudget,
      coverSynergyBudget: this.coverSynergyBudget,
      overCapacity: this.capacityUsed > this.lastConfig.capacity || this.count > this.lastConfig.entityLimit,
      roles,
    };
  }

  raise(floor: FloorData, player: SummonOwner, config: SummonConfig): RaiseResult {
    const rules = this.acceptContext(floor, config);
    if (!player.alive) return this.result(false, '主人已死亡，无法召唤');
    if (this.raiseCooldown > 0) return this.result(false, `召唤尚需 ${this.raiseCooldown.toFixed(1)} 秒`);
    const desired = preset(rules.direction, rules.capacity);
    if (!desired.length) return this.result(false, '召唤容量为 0');

    const existing = { warrior: 0, guardian: 0, archer: 0 } satisfies Record<SummonRole, number>;
    this.units.filter(unit => !unit.temporary).forEach(unit => existing[unit.role]++);
    const wanted = { warrior: 0, guardian: 0, archer: 0 } satisfies Record<SummonRole, number>;
    desired.forEach(role => wanted[role]++);
    const missing: SummonRole[] = [];
    (Object.keys(wanted) as SummonRole[]).forEach(role => {
      for (let index = existing[role]; index < wanted[role]; index++) missing.push(role);
    });
    if (!missing.length) return this.result(false, '预设编队已经完整；现有单位的生命和冷却不会刷新');

    const requiredCapacity = missing.reduce((sum, role) => sum + SUMMON_CAPACITY[role], 0);
    if (this.capacityUsed + requiredCapacity > rules.capacity)
      return this.result(false, `容量不足：还需 ${requiredCapacity}，当前 ${this.capacityUsed}/${rules.capacity}`);
    if (this.count + missing.length > rules.entityLimit)
      return this.result(false, `实体上限不足：还需 ${missing.length}，当前 ${this.count}/${rules.entityLimit}`);

    const positions = this.planSpawnPositions(floor, player.position, missing.length);
    if (!positions) return this.result(false, '附近没有可安全召唤的位置');
    missing.forEach((role, index) => this.addUnit(player, role, 'preset', false, rules.direction === 'elite', positions[index]));
    this.raiseCooldown = 4;
    this.emit(EMPTY_HOST, { kind: 'raise', position: player.position.clone() });
    return this.result(true, `已补充 ${missing.length} 个召唤物，容量 ${this.capacityUsed}/${rules.capacity}`);
  }

  raiseTemporary(
    floor: FloorData,
    player: SummonOwner,
    config: SummonConfig,
    options: TemporarySummonOptions = {},
  ): RaiseResult {
    const rules = this.acceptContext(floor, config);
    if (!player.alive) return this.result(false, '主人已死亡，无法召唤');
    const role = options.role ?? 'warrior';
    if (!(['warrior', 'guardian', 'archer'] as SummonRole[]).includes(role)) return this.result(false, '未知召唤职责');
    if (this.capacityUsed + SUMMON_CAPACITY[role] > rules.capacity)
      return this.result(false, `容量不足：${this.capacityUsed}/${rules.capacity}`);
    if (this.count >= rules.entityLimit) return this.result(false, `实体上限已满：${this.count}/${rules.entityLimit}`);
    const source = options.source?.trim() || 'temporary';
    if (source.length > 80) return this.result(false, '召唤来源标识过长');
    let position: THREE.Vector3;
    if (options.position) {
      position = options.position.clone();
      if (!this.positionIsWalkable(floor, position)) return this.result(false, '指定召唤位置不可通行');
    } else {
      const planned = this.planSpawnPositions(floor, player.position, 1);
      if (!planned) return this.result(false, '附近没有可安全召唤的位置');
      [position] = planned;
    }
    this.addUnit(player, role, source, true, options.elite ?? false, position, THREE.MathUtils.clamp(options.life ?? 8, 1, 30));
    return this.result(true, `已召唤临时${this.roleName(role)}，容量 ${this.capacityUsed}/${rules.capacity}`);
  }

  focus(target: Monster | null): void {
    this.focusTarget = target && !target.dead ? target : null;
    this.pendingFocusTargetId = this.focusTarget?.id ?? null;
    this.mode = this.focusTarget ? 'focus' : 'autonomous';
    this.units.forEach(unit => unit.visual.setFocused(Boolean(this.focusTarget)));
    if (!this.focusTarget) this.disposeFocusLine();
  }

  recall(): void {
    this.mode = 'recall';
    this.focusTarget = null;
    this.pendingFocusTargetId = null;
    this.mark = null;
    this.disposeFocusLine();
    this.units.forEach(unit => unit.visual.setFocused(false));
  }

  sacrifice(): { position: THREE.Vector3; role: string }[] {
    const chosen = [...this.units].sort((a, b) => a.life - b.life || a.createdOrder - b.createdOrder)[0];
    if (!chosen) return [];
    const result = [{ position: chosen.position.clone(), role: chosen.role }];
    this.removeUnit(chosen, 'sacrifice');
    return result;
  }

  update(
    dt: number,
    floor: FloorData,
    player: SummonOwner,
    monsters: Monster[],
    config: SummonConfig,
    host: SummonHost,
  ): void {
    const rules = this.acceptContext(floor, config);
    if (!player.alive) {
      if (this.units.length) host.message?.('主人倒下，召唤编队已解散');
      this.clear('owner-death');
      return;
    }
    const delta = THREE.MathUtils.clamp(Number.isFinite(dt) ? dt : 0, 0, 1);
    this.elapsed += delta;
    this.raiseCooldown = Math.max(0, this.raiseCooldown - delta);
    this.coordinationCooldown = Math.max(0, this.coordinationCooldown - delta);
    if (this.mark) {
      this.mark.remaining -= delta;
      if (this.mark.remaining <= 0) this.mark = null;
    }
    if (this.pendingFocusTargetId !== null && !this.focusTarget) {
      this.focusTarget = monsters.find(monster => monster.id === this.pendingFocusTargetId && !monster.dead) ?? null;
      if (!this.focusTarget && this.mode === 'focus') this.mode = 'autonomous';
      this.pendingFocusTargetId = this.focusTarget?.id ?? null;
    }
    if (this.focusTarget?.dead) {
      host.message?.('集火目标已失效，召唤物恢复自主行动');
      this.focus(null);
    }
    this.updateFocusLine(player.position);

    for (const unit of [...this.units]) {
      unit.owner = player;
      unit.tick(delta, this.elapsed, this.derivedMaxHealth(unit.role, unit.elite, rules));
      if (unit.life <= 0) { this.removeUnit(unit, 'expired', host); continue; }
      this.applyIncomingAttack(unit, monsters, floor);
      if (unit.health <= 0) { this.removeUnit(unit, 'death', host); continue; }
      this.updateRole(unit, floor, player, monsters, rules, host, delta);
    }
    this.updateSignals(delta);
  }

  /** Talent resets and equipment changes invalidate only their own summons. */
  reconcileSources(talentUnlocked: boolean, equipmentEnabled: boolean, venomEnabled = false): void {
    for (const unit of [...this.units]) {
      if ((!unit.temporary && !talentUnlocked)
        || (unit.source === 'equipment-kill' && !equipmentEnabled)
        || (unit.source === 'p5-venom' && !venomEnabled)) this.removeUnit(unit, 'clear');
    }
  }

  clear(reason: SummonEndReason = 'clear'): void {
    for (const unit of [...this.units]) this.removeUnit(unit, reason);
    this.signals.forEach(signal => this.disposeSignal(signal));
    this.signals = [];
    this.disposeFocusLine();
    this.focusTarget = null;
    this.pendingFocusTargetId = null;
    this.mark = null;
    this.mode = 'autonomous';
    this.raiseCooldown = 0;
    this.coordinationCooldown = 0;
    this.guardianShieldBudget = 3;
    this.coverSynergyBudget = 8;
  }

  snapshot(): SummonSnapshot {
    // Monster ids are process-local. Target-bound commands deliberately collapse
    // to autonomous on load instead of risking a focus/mark on an unrelated enemy.
    const savedMode: SummonCommandMode = this.mode === 'recall' ? 'recall' : 'autonomous';
    return {
      version: 1,
      nextId: this.nextId,
      capacity: this.lastConfig.capacity,
      entityLimit: this.lastConfig.entityLimit,
      direction: this.lastConfig.direction,
      raiseCooldown: this.raiseCooldown,
      coordinationCooldown: this.coordinationCooldown,
      guardianShieldBudget: this.guardianShieldBudget,
      coverSynergyBudget: this.coverSynergyBudget,
      mode: savedMode,
      focusTargetId: null,
      mark: null,
      units: this.units.map(unit => unit.snapshot()),
    };
  }

  restore(saved: unknown, floor: FloorData, player: SummonOwner, config: SummonConfig): boolean {
    this.clear('restore');
    if (!validateSnapshot(saved) || saved.units.some(unit => !this.positionIsWalkable(floor, unit.position))) return false;
    const rules = this.acceptContext(floor, config);
    this.nextId = Math.max(saved.nextId, ...saved.units.map(unit => Number(unit.id.slice(7)) + 1), 1);
    this.raiseCooldown = saved.raiseCooldown;
    this.coordinationCooldown = saved.coordinationCooldown;
    this.guardianShieldBudget = saved.guardianShieldBudget;
    this.coverSynergyBudget = saved.coverSynergyBudget;
    this.mode = saved.mode === 'recall' ? 'recall' : 'autonomous';
    this.pendingFocusTargetId = null;
    this.mark = null;
    for (const data of saved.units) this.restoreUnit(data, player, rules);
    this.units.forEach(unit => unit.visual.setFocused(this.mode === 'focus'));
    return true;
  }

  private acceptContext(floor: FloorData, config: SummonConfig): Required<SummonConfig> {
    const identity = `${floor.seed}:${floor.floor}`;
    if (this.floorIdentity !== null && this.floorIdentity !== identity) this.clear('floor-change');
    this.floorIdentity = identity;
    this.lastConfig = normalizedConfig(config);
    return this.lastConfig;
  }

  private result(ok: boolean, message: string): RaiseResult { return { ok, message }; }
  private roleName(role: SummonRole): string { return role === 'warrior' ? '战士' : role === 'guardian' ? '护卫' : '射手'; }

  private addUnit(
    owner: SummonOwner,
    role: SummonRole,
    source: string,
    temporary: boolean,
    elite: boolean,
    position: THREE.Vector3,
    life = ROLE_LIFE[role] * (elite ? 0.76 : 1),
  ): SummonUnit {
    const id = `summon-${this.nextId++}`;
    const unit = new SummonUnit(this.scene, owner, {
      id, role, source, temporary, elite, createdOrder: this.nextId - 1, position,
      maxHealth: this.derivedMaxHealth(role, elite, this.lastConfig), life,
    });
    this.units.push(unit);
    return unit;
  }

  private restoreUnit(data: SerializedSummonUnit, owner: SummonOwner, rules: Required<SummonConfig>): void {
    const derivedMax = this.derivedMaxHealth(data.role, data.elite, rules);
    const unit = new SummonUnit(this.scene, owner, {
      ...data,
      position: new THREE.Vector3(data.position.x, data.position.y, data.position.z),
      maxHealth: derivedMax,
      health: Math.min(data.health, derivedMax),
      cooldowns: { ...data.cooldowns },
    });
    this.units.push(unit);
  }

  private derivedMaxHealth(role: SummonRole, elite: boolean, rules: Required<SummonConfig>): number {
    return Math.max(1, rules.maxHealth * ROLE_HEALTH[role] * (elite ? 1.38 : 1));
  }

  private attackDamage(role: SummonRole, elite: boolean, rules: Required<SummonConfig>): number {
    void elite;
    return Math.max(0, rules.attack * ROLE_ATTACK[role]);
  }

  private updateRole(
    unit: SummonUnit,
    floor: FloorData,
    player: SummonOwner,
    monsters: Monster[],
    rules: Required<SummonConfig>,
    host: SummonHost,
    dt: number,
  ): void {
    const living = monsters.filter(monster => !monster.dead);
    const target = this.mode === 'recall' ? null : this.selectTarget(unit, living);
    if (unit.role === 'warrior') this.updateWarrior(unit, target, floor, player, rules, host, dt);
    else if (unit.role === 'guardian') this.updateGuardian(unit, target, floor, player, rules, host, dt);
    else this.updateArcher(unit, target, floor, player, rules, host, dt);
  }

  private selectTarget(unit: SummonUnit, monsters: Monster[]): Monster | null {
    if (this.focusTarget && !this.focusTarget.dead && unit.position.distanceTo(this.focusTarget.position) <= 16) return this.focusTarget;
    let target: Monster | null = null;
    let best = 12;
    for (const monster of monsters) {
      const distance = unit.position.distanceTo(monster.position);
      if (distance < best) { best = distance; target = monster; }
    }
    return target;
  }

  private updateWarrior(
    unit: SummonUnit, target: Monster | null, floor: FloorData, player: SummonOwner,
    rules: Required<SummonConfig>, host: SummonHost, dt: number,
  ): void {
    if (!target) { this.follow(unit, floor, player.position, 1.45, dt); return; }
    const distance = unit.position.distanceTo(target.position);
    if (distance > 1.35) this.moveTowards(unit, floor, target.position, ROLE_SPEED.warrior, dt);
    else if (unit.cooldowns.attack <= 0 && this.hasLineOfSight(floor, unit.position, target.position)) {
      unit.cooldowns.attack = unit.elite ? 0.9 : 1.12;
      this.deal(unit, target, this.attackDamage('warrior', unit.elite, rules), host);
      if (this.focusTarget === target && this.coordinationCooldown <= 0) {
        this.mark = { targetId: target.id, remaining: 2.5 };
        this.coordinationCooldown = 5;
        this.spawnSignal(unit.position, target.position, 0xffc85a, 0.4);
        this.emit(host, { kind: 'focus-mark', position: unit.position.clone(), targetPosition: target.position.clone(), role: unit.role, summonId: unit.id });
      }
    }
  }

  private updateGuardian(
    unit: SummonUnit, target: Monster | null, floor: FloorData, player: SummonOwner,
    rules: Required<SummonConfig>, host: SummonHost, dt: number,
  ): void {
    const archer = this.nearestUnit('archer', unit.position);
    const protectedPosition = archer?.position ?? player.position;
    const anchor = protectedPosition.clone();
    if (target) {
      const toward = target.position.clone().sub(protectedPosition).setY(0);
      if (toward.lengthSq() > 0.01) anchor.add(toward.normalize().multiplyScalar(1.25));
    }
    if (unit.position.distanceTo(anchor) > 0.8) this.moveTowards(unit, floor, anchor, ROLE_SPEED.guardian, dt);
    if (target && unit.position.distanceTo(target.position) <= 1.75 && unit.cooldowns.attack <= 0 && this.hasLineOfSight(floor, unit.position, target.position)) {
      unit.cooldowns.attack = unit.elite ? 1.15 : 1.4;
      this.deal(unit, target, this.attackDamage('guardian', unit.elite, rules), host);
    }
    if (rules.guardianShield > 0 && this.guardianShieldBudget > 0 && unit.shieldCharges > 0 && unit.cooldowns.shield <= 0
      && unit.position.distanceTo(player.position) <= 3.4 && target && target.position.distanceTo(player.position) <= 6) {
      const amount = rules.guardianShield * (unit.elite ? 1.2 : 1);
      host.shield(amount);
      unit.shieldCharges--;
      this.guardianShieldBudget--;
      unit.cooldowns.shield = 8;
      this.emit(host, { kind: 'guardian-shield', position: unit.position.clone(), role: unit.role, summonId: unit.id, amount });
    }
  }

  private updateArcher(
    unit: SummonUnit, target: Monster | null, floor: FloorData, player: SummonOwner,
    rules: Required<SummonConfig>, host: SummonHost, dt: number,
  ): void {
    const guardian = this.nearestUnit('guardian', unit.position, 3.4);
    unit.visual.setGuardianLink(guardian?.position ?? null, guardian ? unit.position : null);
    if (!target) { this.follow(unit, floor, player.position, 2.4, dt); return; }
    const distance = unit.position.distanceTo(target.position);
    const hasLos = this.hasLineOfSight(floor, unit.position, target.position);
    if (distance < 3.8) this.moveAway(unit, floor, target.position, ROLE_SPEED.archer, dt);
    else if (distance > 7.2 || !hasLos) this.moveTowards(unit, floor, target.position, ROLE_SPEED.archer, dt);
    else if (unit.cooldowns.attack <= 0) {
      unit.cooldowns.attack = unit.elite ? 1.0 : 1.3;
      let damage = this.attackDamage('archer', unit.elite, rules);
      if (guardian && this.focusTarget === target && this.coverSynergyBudget > 0 && unit.coverCharges > 0) {
        damage *= 1.25;
        unit.coverCharges--;
        this.coverSynergyBudget--;
        this.emit(host, { kind: 'guardian-archer-link', position: guardian.position.clone(), targetPosition: unit.position.clone(), role: unit.role, summonId: unit.id });
      }
      if (this.mark?.targetId === target.id) {
        damage *= 1.35;
        this.mark = null;
        this.spawnSignal(unit.position, target.position, 0x8bdcff, 0.55);
        this.emit(host, { kind: 'coordinated-shot', position: unit.position.clone(), targetPosition: target.position.clone(), role: unit.role, summonId: unit.id, amount: damage });
      }
      this.deal(unit, target, damage, host);
    }
  }

  private deal(unit: SummonUnit, target: Monster, damage: number, host: SummonHost): void {
    if (target.dead || damage <= 0) return;
    host.damage(target, damage, unit.position.clone(), { role: unit.role, temporary: unit.temporary, source: unit.source, focused: this.mode === 'focus' && this.focusTarget === target });
    this.emit(host, { kind: 'hit', position: unit.position.clone(), targetPosition: target.position.clone(), role: unit.role, summonId: unit.id, amount: damage });
  }

  private applyIncomingAttack(unit: SummonUnit, monsters: Monster[], floor: FloorData): void {
    if (unit.cooldowns.incoming > 0) return;
    let attacker: Monster | null = null;
    let best = 2.25;
    for (const monster of monsters) {
      if (monster.dead) continue;
      const distance = unit.position.distanceTo(monster.position);
      if (distance < best && this.hasLineOfSight(floor, unit.position, monster.position)) { best = distance; attacker = monster; }
    }
    if (!attacker) return;
    const boss = attacker.def.behavior === 'boss';
    let damage = Math.max(1, attacker.def.attack * 0.42);
    if (unit.role === 'guardian') damage *= 0.62;
    if (boss) damage = Math.max(damage * 1.45, unit.maxHealth * 0.09);
    unit.health = Math.max(0, unit.health - damage);
    unit.cooldowns.incoming = Math.max(0.5, Math.min(1.4, attacker.def.attackCooldown || 1));
  }

  private follow(unit: SummonUnit, floor: FloorData, ownerPosition: THREE.Vector3, desired: number, dt: number): void {
    if (unit.position.distanceTo(ownerPosition) > desired) this.moveTowards(unit, floor, ownerPosition, ROLE_SPEED[unit.role], dt);
  }

  private moveTowards(unit: SummonUnit, floor: FloorData, target: THREE.Vector3, speed: number, dt: number): void {
    const direct = target.clone().sub(unit.position).setY(0);
    if (direct.lengthSq() < 0.0025) return;
    direct.normalize();
    let direction = direct;
    const probe = Math.max(0.4, speed * dt + 0.08);
    if (worldRayDistance(floor, unit.position.clone().setY(0.8), direct, probe, 0.3) < probe - 0.01) {
      const routed = directionToPlayer(floor, unit.position.x, unit.position.z, target.x, target.z);
      if (!routed) return;
      direction = new THREE.Vector3(routed.x, 0, routed.z).normalize();
    }
    const avoidance = new THREE.Vector3();
    for (const other of this.units) {
      if (other === unit) continue;
      const offset = unit.position.clone().sub(other.position).setY(0);
      const distance = offset.length();
      if (distance > 0.01 && distance < 0.72) avoidance.addScaledVector(offset.normalize(), (0.72 - distance) * 0.55);
    }
    direction.add(avoidance).normalize();
    this.tryMove(unit, floor, direction, speed * dt);
  }

  private moveAway(unit: SummonUnit, floor: FloorData, threat: THREE.Vector3, speed: number, dt: number): void {
    const away = unit.position.clone().sub(threat).setY(0);
    if (away.lengthSq() < 0.01) away.set(1, 0, 0);
    away.normalize();
    if (this.tryMove(unit, floor, away, speed * dt)) return;
    const left = new THREE.Vector3(-away.z, 0, away.x);
    if (this.tryMove(unit, floor, left, speed * dt)) return;
    this.tryMove(unit, floor, left.negate(), speed * dt);
  }

  private tryMove(unit: SummonUnit, floor: FloorData, direction: THREE.Vector3, distance: number): boolean {
    const step = Math.max(0, Math.min(distance, 0.45));
    if (step <= 0) return false;
    const origin = unit.position.clone().setY(0.8);
    if (worldRayDistance(floor, origin, direction, step + 0.025, 0.3) < step + 0.015) return false;
    const nextX = unit.position.x + direction.x * step;
    const nextZ = unit.position.z + direction.z * step;
    if (!isWalkable(floor, Math.floor(nextX), Math.floor(nextZ))) return false;
    unit.position.x = nextX;
    unit.position.z = nextZ;
    unit.yaw = Math.atan2(direction.x, direction.z);
    return true;
  }

  private hasLineOfSight(floor: FloorData, from: THREE.Vector3, to: THREE.Vector3): boolean {
    const direction = to.clone().sub(from).setY(0);
    const distance = direction.length();
    if (distance < 0.01) return true;
    direction.normalize();
    return worldRayDistance(floor, from.clone().setY(1.05), direction, distance, 0.04) >= distance - 0.05;
  }

  private nearestUnit(role: SummonRole, position: THREE.Vector3, maxDistance = Infinity): SummonUnit | null {
    let result: SummonUnit | null = null;
    let best = maxDistance;
    for (const unit of this.units) {
      if (unit.role !== role || unit.health <= 0) continue;
      const distance = unit.position.distanceTo(position);
      if (distance < best) { best = distance; result = unit; }
    }
    return result;
  }

  private planSpawnPositions(floor: FloorData, origin: THREE.Vector3, count: number): THREE.Vector3[] | null {
    const result: THREE.Vector3[] = [];
    const phase = ((floor.seed ^ this.nextId) & 7) * Math.PI / 4;
    for (let index = 0; index < count; index++) {
      let found: THREE.Vector3 | null = null;
      for (let ring = 0; ring < 3 && !found; ring++) {
        for (let attempt = 0; attempt < 12; attempt++) {
          const angle = phase + (attempt + index * 3) * Math.PI / 6;
          const radius = 0.9 + ring * 0.55;
          const candidate = new THREE.Vector3(origin.x + Math.cos(angle) * radius, 0, origin.z + Math.sin(angle) * radius);
          if (!this.positionIsWalkable(floor, candidate)) continue;
          const direction = candidate.clone().sub(origin).setY(0);
          const distance = direction.length();
          if (distance > 0.01 && worldRayDistance(floor, origin.clone().setY(0.8), direction.normalize(), distance, 0.3) < distance - 0.02) continue;
          if ([...this.units.map(unit => unit.position), ...result].some(position => position.distanceTo(candidate) < 0.55)) continue;
          found = candidate;
          break;
        }
      }
      if (!found) return null;
      result.push(found);
    }
    return result;
  }

  private positionIsWalkable(floor: FloorData, position: { x: number; z: number }): boolean {
    return Number.isFinite(position.x) && Number.isFinite(position.z)
      && isWalkable(floor, Math.floor(position.x), Math.floor(position.z));
  }

  private removeUnit(unit: SummonUnit, reason: SummonEndReason, host?: SummonHost): void {
    const index = this.units.indexOf(unit);
    if (index < 0) return;
    if (host) this.emit(host, { kind: 'end', position: unit.position.clone(), role: unit.role, summonId: unit.id, source: unit.source, temporary: unit.temporary, reason });
    unit.dispose(this.scene);
    this.units.splice(index, 1);
  }

  private emit(host: SummonHost, effect: SummonEffect): void {
    host.effect?.(effect);
  }

  private spawnSignal(from: THREE.Vector3, to: THREE.Vector3, color: number, life: number): void {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      from.clone().add(new THREE.Vector3(0, 1.1, 0)),
      to.clone().add(new THREE.Vector3(0, 1.1, 0)),
    ]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    line.frustumCulled = false;
    this.scene.add(line);
    this.signals.push({ line, life });
  }

  private updateSignals(dt: number): void {
    for (let index = this.signals.length - 1; index >= 0; index--) {
      const signal = this.signals[index];
      signal.life -= dt;
      const material = signal.line.material as THREE.LineBasicMaterial;
      material.opacity = Math.max(0, Math.min(0.9, signal.life * 2));
      if (signal.life <= 0) { this.disposeSignal(signal); this.signals.splice(index, 1); }
    }
  }

  private disposeSignal(signal: Signal): void {
    this.scene.remove(signal.line);
    signal.line.geometry.dispose();
    const materials = Array.isArray(signal.line.material) ? signal.line.material : [signal.line.material];
    materials.forEach(material => material.dispose());
  }

  private updateFocusLine(ownerPosition: THREE.Vector3): void {
    if (this.mode !== 'focus' || !this.focusTarget || this.focusTarget.dead) { this.disposeFocusLine(); return; }
    if (!this.focusLine) {
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      this.focusLine = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color: 0xffc85a, dashSize: 0.28, gapSize: 0.18, transparent: true, opacity: 0.75, depthWrite: false }));
      this.focusLine.frustumCulled = false;
      this.scene.add(this.focusLine);
    }
    const position = this.focusLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    position.setXYZ(0, ownerPosition.x, ownerPosition.y + 1.2, ownerPosition.z);
    position.setXYZ(1, this.focusTarget.position.x, this.focusTarget.position.y + 1.1, this.focusTarget.position.z);
    position.needsUpdate = true;
    this.focusLine.computeLineDistances();
    this.focusLine.geometry.computeBoundingSphere();
  }

  private disposeFocusLine(): void {
    if (!this.focusLine) return;
    this.scene.remove(this.focusLine);
    this.focusLine.geometry.dispose();
    const materials = Array.isArray(this.focusLine.material) ? this.focusLine.material : [this.focusLine.material];
    materials.forEach(material => material.dispose());
    this.focusLine = null;
  }
}
