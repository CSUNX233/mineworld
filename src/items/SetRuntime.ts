import type { Monster } from '../monsters/Monster';
import type { ElementType } from '../types';
import type { SummonRole } from '../summons/types';

export const SET_POWER = { damagePerPiecePerSecond: 0.03, bankSeconds: 3, shieldPerSecond: 0.006, manaPerSecond: 0.008 } as const;
export interface SetSnapshot {
  version: 1;
  time: number;
  meters: Record<string, number>;
  cooldowns: Record<string, number>;
  budgets: Record<string, number>;
}
export interface SetPosition { x: number; y: number; z: number }
export interface SetHost {
  attackRate(): number;
  maxHealth(): number;
  maxMana(): number;
  targets(origin: Monster | null, range: number): Monster[];
  damage(target: Monster, amount: number, element: ElementType, set: string): void;
  slow(target: Monster, seconds: number): void;
  status(target: Monster, type: 'burning' | 'poisoned', totalDamage: number): void;
  shield(amount: number): void;
  mana(amount: number): void;
  summon(): boolean;
  message(set: string, text: string): void;
  position?(): SetPosition;
  /** Return enemies within range and with clear line of sight from this node, not the player. */
  targetsAt?(position: SetPosition, range: number): Monster[];
  trail?(position: SetPosition, life: number): void;
}
const IDS = ['warlord', 'frost', 'shadow', 'warbringer', 'inferno', 'glacier', 'venom', 'sanguine', 'storm', 'soul_banner', 'soul_pyre', 'embersteel'];
const MELEE = new Set(['melee_attack', 'whirlwind', 'dash', 'guard_counter', 'seismic_slam', 'ember_blade']);
const HEAVY = new Set(['whirlwind', 'seismic_slam', 'ember_blade']);
const PRIMARY = new Set([...MELEE, 'staff_attack', 'fireball', 'frost_nova', 'lightning_chain', 'detonate', 'soul_burst']);
const aliveStatus = (target: Monster, type: string) => target.statuses.some(s => s.type === type && s.duration > 0);

/** Owns only set state. Its secondary effects never feed primary-hit callbacks. */
export class SetRuntime {
  private state: SetSnapshot = { version: 1, time: 0, meters: {}, cooldowns: {}, budgets: {} };
  private counts: Record<string, number> = {};
  private delayed: Array<{ remaining: number; target: Monster; amount: number; element: ElementType; set: string; requiredPieces: number }> = [];
  private trails: Array<{ position: SetPosition; remaining: number; nextPulse: number }> = [];
  constructor(private host: SetHost) {}
  count(id: string): number { return this.counts[id] ?? 0; }
  private active(id: string): boolean { return this.count(id) >= 2; }
  private full(id: string): boolean { return this.count(id) >= 4; }
  private meter(id: string): number { return this.state.meters[id] ?? 0; }
  private set(id: string, value: number): void { this.state.meters[id] = Math.max(0, Math.min(100, value)); }
  private ready(id: string, seconds: number): boolean {
    if ((this.state.cooldowns[id] ?? 0) > this.state.time) return false;
    this.state.cooldowns[id] = this.state.time + seconds;
    return true;
  }
  update(dt: number, counts: Record<string, number>, movingDistance: number, inCombat: boolean): void {
    const delta = Math.max(0, Math.min(.1, dt));
    this.state.time += delta;
    this.counts = counts;
    // A removed source forfeits its reserved hit immediately, even if re-equipped before impact.
    this.delayed = this.delayed.filter(entry => this.count(entry.set) >= entry.requiredPieces);
    if (!this.full('frost')) this.set('frost-tail', 0);
    if (!this.full('soul_pyre')) { this.set('soul_pyre-fire', 0); this.set('soul_pyre-cycle', 0); }
    if (!this.full('embersteel')) this.set('embersteel-fire', 0);
    for (const id of IDS) {
      if (!this.active(id)) {
        for (const key of Object.keys(this.state.meters)) if (key === id || key.startsWith(`${id}-`)) this.set(key, 0);
        this.state.budgets[id] = 0; continue;
      }
      const rate = this.host.attackRate() * SET_POWER.damagePerPiecePerSecond * (this.full(id) ? 4 : 2);
      this.state.budgets[id] = Math.min(rate * SET_POWER.bankSeconds, (this.state.budgets[id] ?? 0) + (inCombat ? rate * delta : 0));
    }
    for (const kind of ['shield', 'mana']) {
      const max = kind === 'shield' ? this.host.maxHealth() : this.host.maxMana();
      const rate = max * (kind === 'shield' ? SET_POWER.shieldPerSecond : SET_POWER.manaPerSecond);
      this.state.budgets[kind] = Math.min(rate * 5, (this.state.budgets[kind] ?? 0) + (inCombat ? rate * delta : 0));
    }
    if (this.active('shadow') && inCombat) this.set('shadow', this.meter('shadow') + Math.min(.8, Math.max(0, movingDistance)));
    this.updateTrails(delta, movingDistance, inCombat);
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const entry = this.delayed[i]; entry.remaining -= delta;
      if (entry.remaining > 0) continue;
      this.delayed.splice(i, 1);
      if (!entry.target.dead && this.count(entry.set) >= entry.requiredPieces && this.host.targets(null, 14).includes(entry.target))
        this.host.damage(entry.target, entry.amount, entry.element, entry.set);
    }
  }
  private spend(id: string, fraction = 1): number {
    const amount = Math.max(0, (this.state.budgets[id] ?? 0) * fraction);
    this.state.budgets[id] = Math.max(0, (this.state.budgets[id] ?? 0) - amount);
    return amount;
  }
  private support(kind: 'shield' | 'mana', desired: number): void {
    const amount = Math.min(desired, this.state.budgets[kind] ?? 0);
    if (amount <= 0) return;
    this.state.budgets[kind] -= amount;
    if (kind === 'shield') this.host.shield(amount); else this.host.mana(amount);
  }
  private apply(id: string, targets: Monster[], element: ElementType, status?: 'burning' | 'poisoned', delay = 0): void {
    const live = targets.filter(t => !t.dead).slice(0, this.full(id) ? 3 : 1);
    if (!live.length) return;
    const amount = this.spend(id);
    if (amount < 1) return;
    for (const target of live) {
      const share = amount / live.length;
      if (status) this.host.status(target, status, share);
      else if (delay > 0) {
        // Queue saturation forfeits the share rather than turning a delayed strike into an instant one.
        if (this.delayed.length < 8) this.delayed.push({ remaining: delay, target, amount: share, element, set: id, requiredPieces: this.full(id) ? 4 : 2 });
      } else this.host.damage(target, share, element, id);
    }
    if (this.ready(`${id}-message`, 4)) this.host.message(id, '联动触发');
  }
  onHit(target: Monster, element: ElementType, source: string): void {
    if (target.dead || !PRIMARY.has(source)) return;
    const melee = MELEE.has(source);
    if (source === 'guard_counter' && this.active('warlord')) this.set('warlord', 1);
    else if (melee && this.active('warlord') && this.meter('warlord') > 0) {
      this.set('warlord', 0);
      this.apply('warlord', [target], 'physical');
      if (this.full('warlord') && HEAVY.has(source)) this.support('shield', this.host.maxHealth() * .035);
    }
    if (this.active('warbringer') && melee) {
      if (HEAVY.has(source) && this.meter('warbringer') >= 3 && this.ready('warbringer', 2)) {
        this.set('warbringer', 0); this.host.slow(target, 1);
        this.apply('warbringer', this.host.targets(target, this.full('warbringer') ? 2.5 : .1), 'physical', undefined, this.full('warbringer') ? .22 : 0);
      } else if (this.ready('warbringer-stack', .25)) this.set('warbringer', Math.min(3, this.meter('warbringer') + 1));
    }
    if (this.active('shadow') && this.meter('shadow') >= 3 && this.ready('shadow', 2)) {
      this.set('shadow', 0);
      this.apply('shadow', [target], element, undefined, this.full('shadow') ? .25 : 0);
    }
    if (this.active('frost') && element === 'frost' && this.ready('frost-stack', .5)) {
      this.set('frost', Math.min(3, this.meter('frost') + 1)); this.host.slow(target, 1);
      this.apply('frost', [target], 'frost');
    } else if (element !== 'frost' && this.full('frost') && this.meter('frost-tail') > 0) {
      this.set('frost-tail', 0); this.host.targets(target, 2).slice(0, 3).forEach(t => this.host.slow(t, 1));
    }
    if (this.active('glacier') && aliveStatus(target, 'frozen')) {
      if (element === 'frost' && source !== 'staff_attack' && this.meter('glacier') >= 2 && this.ready('glacier', 2)) {
        this.set('glacier', 0);
        this.apply('glacier', this.host.targets(target, this.full('glacier') ? 3 : .1), 'frost', undefined, .3);
      } else if (this.ready('glacier-stack', .4)) this.set('glacier', Math.min(3, this.meter('glacier') + 1));
    }
    if (this.active('inferno') && aliveStatus(target, 'burning') && this.ready('inferno', 2)) {
      const nearby = this.host.targets(target, 3).filter(t => t !== target);
      this.apply('inferno', nearby.length ? nearby : [target], 'fire', 'burning');
    }
    if (this.active('venom') && (aliveStatus(target, 'poisoned') || element === 'poison') && this.ready('venom-stack', .6)) {
      this.set('venom', Math.min(4, this.meter('venom') + 1));
      this.tryHatch();
      this.apply('venom', [target], 'poison', 'poisoned');
    }
    if (this.active('storm') && this.ready('storm-stack', .4)) this.set('storm', Math.min(3, this.meter('storm') + 1));
    if (this.active('embersteel') && melee && aliveStatus(target, 'burning') && this.ready('embersteel', 1.5)) {
      const burn = target.statuses.find(s => s.type === 'burning' && s.duration > 0)!;
      // Transfer only a portion of existing DoT; remaining damage is removed exactly once.
      const consumedDuration = Math.min(.6, burn.duration);
      const transfer = Math.min(burn.damagePerTick * consumedDuration, this.state.budgets.embersteel ?? 0);
      if (transfer > 0 && burn.damagePerTick > 0) {
        burn.duration -= transfer / burn.damagePerTick;
        this.state.budgets.embersteel -= transfer;
        this.host.damage(target, transfer, 'fire', 'embersteel');
      }
      if (this.full('embersteel') && this.meter('embersteel-fire') > 0) {
        this.set('embersteel-fire', 0); this.apply('embersteel', this.host.targets(target, 2.4), 'fire');
      } else this.apply('embersteel', [target], 'fire');
    }
  }
  get coldStacks(): number { return this.meter('frost'); }
  onCast(id: string, paidMana: number, previousColdStacks = this.meter('frost')): void {
    if (paidMana > 0 && this.active('frost') && previousColdStacks > 0) {
      const stacks = Math.min(previousColdStacks, this.meter('frost')); this.set('frost', this.meter('frost') - stacks);
      this.support('mana', paidMana * Math.min(.18, stacks * .06));
      if (this.full('frost')) this.set('frost-tail', 1);
    }
    if (this.active('storm') && this.meter('storm') >= 3 && this.ready('storm', 2)) {
      this.set('storm', 0); this.apply('storm', this.host.targets(null, 8), 'lightning');
    }
    if (this.active('sanguine') && this.meter('sanguine') > 0 && this.ready('sanguine', 3)) {
      this.set('sanguine', 0); this.support('shield', this.host.maxHealth() * .03);
      this.apply('sanguine', this.host.targets(null, 4), 'physical');
    }
    if (['fireball', 'flame_rift', 'detonate'].includes(id) && this.full('embersteel')) this.set('embersteel-fire', 1);
    if (paidMana > 0 && id === 'raise_company' && this.active('soul_pyre') && this.meter('soul_pyre') > 0) {
      const role = this.meter('soul_pyre'); this.set('soul_pyre', 0);
      if (this.full('soul_pyre')) this.set('soul_pyre-cycle', this.meter('soul_pyre-cycle') | (1 << (role - 1)));
      if (role === 2) this.support('shield', this.host.maxHealth() * .03);
      if (role === 3) this.support('mana', paidMana * .15);
      this.apply('soul_pyre', this.host.targets(null, 7), role === 3 ? 'fire' : 'shadow');
      if (this.full('soul_pyre') && this.meter('soul_pyre-cycle') === 7) {
        this.set('soul_pyre-cycle', 0); this.set('soul_pyre-fire', 3);
      }
    }
  }
  onLeechRecovered(amount: number): void {
    if (amount > 0 && this.active('sanguine')) this.set('sanguine', this.meter('sanguine') + amount);
  }
  onLowHealth(): void {
    if (this.full('sanguine') && this.ready('sanguine-emergency', 12)) this.support('shield', this.host.maxHealth() * .04);
  }
  onSacrifice(role: SummonRole): void {
    if (!this.active('soul_pyre')) return;
    const value = role === 'warrior' ? 1 : role === 'guardian' ? 2 : 3;
    this.set('soul_pyre', value);
  }
  onSummonHit(target: Monster, role: SummonRole, focused: boolean, temporary: boolean): void {
    if (target.dead) return;
    if (temporary) {
      if (this.full('venom') && this.ready('venom-spread', 2)) this.apply('venom', this.host.targets(target, 2.5), 'poison', 'poisoned');
      return;
    }
    const value = role === 'warrior' ? 1 : role === 'archer' ? 2 : 4;
    if (this.active('soul_banner') && focused && this.meter('soul_banner-role') !== value) {
      this.set('soul_banner-role', value);
      this.set('soul_banner', this.meter('soul_banner') | value);
      if ((this.meter('soul_banner') & 3) === 3 && this.ready('soul_banner', 2)) {
        if (this.full('soul_banner') && this.meter('soul_banner') === 7) this.support('shield', this.host.maxHealth() * .03);
        this.set('soul_banner', 0); this.apply('soul_banner', [target], 'physical');
      }
    }
    if (this.full('soul_pyre') && this.meter('soul_pyre-fire') > 0 && this.ready('soul_pyre-fire', 1)) {
      this.set('soul_pyre-fire', this.meter('soul_pyre-fire') - 1); this.apply('soul_pyre', [target], 'fire');
    }
  }
  onTemporaryEnd(targets: Monster[]): void {
    if (this.full('venom') && this.ready('venom-end', 2)) this.apply('venom', targets, 'poison', 'poisoned');
  }
  temporaryDamage(): number { return this.active('venom') ? this.spend('venom', .35) : 0; }
  private tryHatch(): void {
    if (!this.active('venom') || this.meter('venom') < 4 || (this.state.cooldowns.venom ?? 0) > this.state.time) return;
    // A full shared capacity is not a successful trigger and must not burn its cooldown.
    if (!this.host.summon()) return;
    this.ready('venom', 6);
    this.set('venom', 0);
    this.host.message('venom', '疫骸孵化');
  }
  private updateTrails(delta: number, movingDistance: number, inCombat: boolean): void {
    if (!this.full('inferno')) { this.trails = []; return; }
    this.trails = this.trails.filter(node => { node.remaining -= delta; return node.remaining > 1e-8; });
    if (this.host.position && this.host.targetsAt && movingDistance > .02 && inCombat && this.ready('inferno-path', 1.5)) {
      const source = this.host.position();
      const position = { x: source.x, y: source.y, z: source.z };
      this.trails.push({ position, remaining: 3, nextPulse: this.state.time });
      if (this.trails.length > 3) this.trails.shift();
      this.host.trail?.({ ...position }, 3);
    }
    if (!inCombat || !this.host.targetsAt) return;
    for (const node of this.trails) {
      if (node.nextPulse > this.state.time) continue;
      node.nextPulse = this.state.time + .5;
      // Every node and propagation hit draws from the same inferno allowance.
      this.apply('inferno', this.host.targetsAt(node.position, 2.2), 'fire', 'burning');
    }
  }
  onKillingHit(element: ElementType, source: string): void {
    if (!PRIMARY.has(source)) return;
    if (source === 'guard_counter' && this.active('warlord')) this.set('warlord', 1);
    if (MELEE.has(source) && this.active('warbringer') && this.ready('warbringer-stack', .25)) this.set('warbringer', Math.min(3, this.meter('warbringer') + 1));
    if (this.active('storm') && this.ready('storm-stack', .4)) this.set('storm', Math.min(3, this.meter('storm') + 1));
    if (this.active('frost') && element === 'frost' && this.ready('frost-stack', .5)) this.set('frost', Math.min(3, this.meter('frost') + 1));
    if (this.active('venom') && element === 'poison') {
      this.set('venom', Math.min(4, this.meter('venom') + 1));
      this.tryHatch();
    }
  }
  /** Victim references and delayed hits never survive a floor boundary. Reserved damage is not refunded. */
  clearTargets(): void { this.delayed = []; this.trails = []; }
  reset(): void { this.state = { version: 1, time: 0, meters: {}, cooldowns: {}, budgets: {} }; this.delayed = []; this.trails = []; this.counts = {}; }
  snapshot(): SetSnapshot { return structuredClone(this.state); }
  restore(value: unknown): void {
    this.reset();
    if (!value || typeof value !== 'object') return;
    const s = value as SetSnapshot;
    if (s.version !== 1 || !Number.isFinite(s.time) || s.time < 0) return;
    for (const field of ['meters', 'cooldowns', 'budgets'] as const) {
      if (!s[field] || typeof s[field] !== 'object' || Object.keys(s[field]).length > 100
        || Object.values(s[field]).some(v => !Number.isFinite(v) || v < 0 || v > 1e9)) return;
    }
    this.state = structuredClone(s);
  }
}
