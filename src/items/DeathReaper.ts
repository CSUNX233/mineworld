import type { Item, ElementType } from '../types';
import type { Monster } from '../monsters/Monster';
import { deathReaperIdentities } from '../data/DeathReaperItems';
import { isPrimaryEquipmentHit } from './SetRuntime';

export type DeathReaperEffect = 'scythe' | 'wound' | 'stillness' | 'pursuit' | 'harvest' | 'echo' | 'burst' | 'lantern' | 'form';
export interface DeathReaperHost {
  attack(): number;
  maxHealth(): number;
  maxMana(): number;
  /** Same encounter only, with reachable geometry and line of sight already checked. */
  targets(origin: Monster | null, range: number): Monster[];
  /** Shared damage pipeline, tagged secondary: never call onHit for these effects. */
  damage(target: Monster, amount: number, element: ElementType, effect: DeathReaperEffect): void;
  shield(amount: number): void;
  mana(amount: number): void;
  slow(target: Monster, seconds: number): void;
  message(text: string): void;
  effect?(kind: DeathReaperEffect, target: Monster | null, radius: number): void;
  form?(active: boolean, seconds: number): void;
}

export interface DeathReaperState {
  version: 1;
  time: number;
  souls: number;
  soulHits: number;
  scytheHits: number;
  distance: number;
  stationary: number;
  pursuit: boolean;
  stillness: boolean;
  formRemaining: number;
  cooldowns: Record<string, number>;
}

const stateDefaults = (): DeathReaperState => ({ version: 1, time: 0, souls: 0, soulHits: 0, scytheHits: 0,
  distance: 0, stationary: 0, pursuit: false, stillness: false, formRemaining: 0, cooldowns: {} });
const KEYS = new Set(['soul-hit', 'soul-summon', 'scythe', 'crown', 'shroud', 'bindings', 'steps', 'harvest', 'echo', 'hourglass', 'lantern', 'form', 'form-pulse']);

export function validDeathReaperState(value: unknown): value is DeathReaperState {
  if (!value || typeof value !== 'object') return false;
  const state = value as DeathReaperState;
  if (state.version !== 1 || !Number.isFinite(state.time) || state.time < 0 || state.time > 1e9) return false;
  for (const [field, max] of [['souls',12], ['soulHits',2], ['scytheHits',3], ['distance',4], ['stationary',1.2], ['formRemaining',6]] as const) {
    if (!Number.isFinite(state[field]) || state[field] < 0 || state[field] > max) return false;
  }
  if (typeof state.pursuit !== 'boolean' || typeof state.stillness !== 'boolean') return false;
  return !!state.cooldowns && typeof state.cooldowns === 'object' && !Array.isArray(state.cooldowns)
    && Object.entries(state.cooldowns).every(([key, end]) => KEYS.has(key) && Number.isFinite(end) && end >= 0 && end <= state.time + 120);
}

/** Fixed mythic identities supply mechanics; equipment swaps never reset cooldowns. */
export class DeathReaper {
  private state = stateDefaults();
  private identities = new Set<string>();
  private inCombat = false;
  private delayed: Array<{ target: Monster; remaining: number; damage: number; element: ElementType }> = [];
  private killed = new WeakSet<Monster>();
  constructor(private host: DeathReaperHost) {}

  get count(): number { return this.identities.size; }
  get souls(): number { return this.state.souls; }
  get transformed(): boolean { return this.state.formRemaining > 0; }
  private has(piece: string): boolean { return this.identities.has(`death_reaper_${piece}`); }
  private ready(key: string, seconds: number): boolean {
    if ((this.state.cooldowns[key] ?? 0) > this.state.time) return false;
    this.state.cooldowns[key] = this.state.time + seconds; return true;
  }
  private available(key: string): boolean { return (this.state.cooldowns[key] ?? 0) <= this.state.time; }
  private power(): number { return (this.count >= 6 ? 1.3 : 1) * (this.transformed ? 1.5 : 1); }
  private limit(base: number): number { return Math.min(6, base + (this.count >= 4 ? 2 : 0)); }
  private gain(souls: number): void {
    this.state.souls = Math.min(this.count >= 2 ? 12 : 9, this.state.souls + souls);
    this.tryForm();
  }
  private spend(souls: number): boolean {
    if (this.state.souls < souls) return false;
    this.state.souls -= souls; return true;
  }
  private tryForm(): void {
    if (!this.inCombat || this.count !== 9 || this.transformed || this.state.souls < 9
      || !this.host.targets(null,30).some(target=>!target.dead) || !this.ready('form',20)) return;
    this.state.souls -= 9; this.state.formRemaining = 6;
    this.host.form?.(true,6); this.host.message('九魂归一 · 死神化身');
  }
  private strike(targets: Monster[], multiplier: number, kind: DeathReaperEffect, radius: number): void {
    const unique = [...new Set(targets)].filter(target => !target.dead);
    if (!unique.length) return;
    const amount = Math.max(0,this.host.attack()) * multiplier * this.power();
    this.host.effect?.(kind,unique[0],radius);
    for (const target of unique) if (!target.dead) this.host.damage(target,amount,'shadow',kind);
  }
  private around(target: Monster | null, range: number, limit: number): Monster[] {
    const targets=this.host.targets(target,range).filter(other=>!other.dead);
    if(target&&!target.dead&&!targets.includes(target)) targets.unshift(target);
    return [...new Set(targets)].slice(0,limit);
  }

  update(dt: number, items: readonly Item[], movingDistance: number, inCombat: boolean): void {
    this.identities = deathReaperIdentities(items);
    this.inCombat = inCombat;
    const delta = Number.isFinite(dt) ? Math.max(0,Math.min(.25,dt)) : 0;
    this.state.time += delta;
    if (!this.count) {
      this.state.souls=0; this.state.soulHits=0; this.state.scytheHits=0;
      this.state.distance=0; this.state.stationary=0; this.state.pursuit=false; this.state.stillness=false;
      this.delayed=[]; this.cancelForm(); return;
    }
    this.state.souls=Math.min(this.count>=2?12:9,this.state.souls);
    if(this.count!==9||!inCombat) this.cancelForm();
    if(!inCombat) {
      this.delayed=[];this.state.stationary=0;this.state.distance=0;this.state.stillness=false;this.state.pursuit=false;
    }
    if(!this.has('echo_ring')) this.delayed=[];
    if(!this.has('scythe')) this.state.scytheHits=0;
    if(!this.has('steps')) {this.state.distance=0;this.state.pursuit=false;}
    if(!this.has('bindings')) {this.state.stationary=0;this.state.stillness=false;}
    const moved=Number.isFinite(movingDistance)?Math.max(0,Math.min(1,movingDistance)):0;
    if(inCombat&&this.has('steps')&&!this.state.pursuit) {
      this.state.distance=Math.min(4,this.state.distance+moved);
      if(this.state.distance>=4&&this.available('steps')) {this.state.pursuit=true;this.state.distance=0;}
    }
    if(inCombat&&this.has('bindings')&&!this.state.stillness) {
      this.state.stationary=moved>.02?0:Math.min(1.2,this.state.stationary+delta);
      if(this.state.stationary>=1.2&&this.ready('bindings',3)) {this.state.stillness=true;this.state.stationary=0;}
    }
    if(inCombat) this.tryForm();
    if(this.transformed) {
      this.state.formRemaining=Math.max(0,this.state.formRemaining-delta);
      if(this.state.formRemaining<=0) this.host.form?.(false,0);
      else if(this.available('form-pulse')) {
        const targets=this.around(null,7,6);
        if(targets.length&&this.ready('form-pulse',1)) this.strike(targets,2.5,'form',7);
      }
    }
    if(inCombat&&this.has('lantern')&&this.state.souls>0&&this.available('lantern')) {
      const targets=this.around(null,9,1);
      if(targets.length&&this.spend(1)&&this.ready('lantern',3)) this.strike(targets,1.6,'lantern',9);
    }
    for(let i=this.delayed.length-1;i>=0;i--) {
      const echo=this.delayed[i];echo.remaining-=delta;
      if(echo.remaining>0) continue;
      this.delayed.splice(i,1);
      if(inCombat&&!echo.target.dead&&this.around(null,14,32).includes(echo.target)) {
        this.host.effect?.('echo',echo.target,1);
        this.host.damage(echo.target,echo.damage,echo.element,'echo');
      }
    }
  }

  onHit(target: Monster, actualDamage: number, element: ElementType, source: string): void {
    if(!this.inCombat||!this.count||target.dead||!Number.isFinite(actualDamage)||actualDamage<=0||!isPrimaryEquipmentHit(source)) return;
    if(this.ready('soul-hit',.25)) {
      this.state.soulHits++;
      if(this.state.soulHits>=3){this.state.soulHits=0;this.gain(this.count>=4?2:1);}
      if(this.has('scythe')) {
        this.state.scytheHits=Math.min(3,this.state.scytheHits+1);
        if(this.state.scytheHits>=3&&this.ready('scythe',1.5)) {
          this.state.scytheHits=0;this.strike(this.around(target,3,this.limit(3)),1.5,'scythe',3);
        }
      }
    }
    if(this.has('bindings')&&this.state.stillness) {
      this.state.stillness=false;this.host.slow(target,1.2);this.strike([target],2,'stillness',1);
    }
    if(this.has('steps')&&this.state.pursuit&&this.ready('steps',2)) {
      this.state.pursuit=false;this.strike(this.around(target,2.5,this.limit(3)),.9,'pursuit',2.5);
    }
    const threshold=this.transformed ? .35 : this.count>=6 ? .25 : .2;
    if(this.has('harvest_ring')&&target.health/Math.max(1,target.maxHealth)<=threshold&&this.ready('harvest',1.5))
      this.strike([target],1.6,'harvest',1);
    if(this.has('echo_ring')&&this.delayed.length<4&&this.ready('echo',2)&&!target.dead) {
      this.delayed.push({target,remaining:.35,damage:Math.min(actualDamage*.7,this.host.attack()*3)*this.power(),element});
      this.host.effect?.('echo',target,1);
    }
  }
  onKill(target: Monster): void {
    if(!this.inCombat||!this.count||!target.dead||this.killed.has(target)) return;
    this.killed.add(target);this.gain((this.count>=2?2:1)+(this.count>=6?1:0));
  }
  onSummonHit(target: Monster, actualDamage: number): void {
    if(this.inCombat&&this.has('lantern')&&!target.dead&&Number.isFinite(actualDamage)&&actualDamage>0&&this.ready('soul-summon',1)) this.gain(1);
  }
  onCast(_id: string, paidMana: number): void {
    if(!this.inCombat||!this.count||!Number.isFinite(paidMana)||paidMana<=0) return;
    if(this.has('crown')&&this.available('crown')&&this.spend(1)&&this.ready('crown',3)) this.host.mana(Math.min(paidMana*.3,this.host.maxMana()*.2));
    if(this.has('hourglass')&&this.available('hourglass')&&this.state.souls>=2) {
      const targets=this.around(null,6,this.limit(4));
      if(targets.length&&this.spend(2)&&this.ready('hourglass',4)) this.strike(targets,2.2,'burst',6);
    }
  }
  onDamaged(actualDamage: number): void {
    if(!this.inCombat||!this.has('shroud')||!Number.isFinite(actualDamage)||actualDamage<=0||!this.ready('shroud',8)) return;
    this.host.shield(this.host.maxHealth()*.15);this.gain(1);
    this.strike(this.around(null,3,this.limit(3)),1,'wound',3);
  }
  private cancelForm(): void {
    if(this.transformed) this.host.form?.(false,0);
    this.state.formRemaining=0;
  }
  clearTargets(): void {
    this.delayed=[];this.killed=new WeakSet();this.cancelForm();this.inCombat=false;
    this.state.distance=0;this.state.stationary=0;this.state.scytheHits=0;this.state.pursuit=false;this.state.stillness=false;
  }
  reset(): void {this.clearTargets();this.state=stateDefaults();this.identities.clear();}
  snapshot(): DeathReaperState {return {...this.state,cooldowns:{...this.state.cooldowns}};}
  restore(value: unknown): void {
    this.reset();
    if(!validDeathReaperState(value)) return;
    this.state={...value,cooldowns:{...value.cooldowns},formRemaining:0,pursuit:false,stillness:false,stationary:0,distance:0};
    // Entity-bound pending echoes are forfeited; a resumed game never lands an invisible old strike.
    this.state.cooldowns.echo=Math.max(this.state.cooldowns.echo??0,this.state.time+2);
  }
}
