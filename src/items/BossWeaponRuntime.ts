import type { Item } from '../types';
import type { Monster } from '../monsters/Monster';
import { equippedBossWeapon, type BossWeaponDefinition } from '../data/BossWeapons';
import type { DeathReaperHost } from './DeathReaper';
import { isPrimaryEquipmentHit } from './SetRuntime';

/** Small bounded queues; secondary strikes cannot recursively trigger equipment effects. */
export class BossWeaponRuntime {
  private weapon?: BossWeaponDefinition;
  private combat=false;
  private time=0;
  private cooldown=0;
  private hitGate=0;
  private hits=0;
  private pressure=false;
  private distance=0;
  private pending: Array<{target:Monster; at:number; multiplier:number; retarget:boolean}> = [];
  constructor(private host: DeathReaperHost) {}
  update(dt:number,items:readonly Item[],distance:number,combat:boolean):void {
    this.time+=Math.max(0,Math.min(.25,dt));
    const weapon=equippedBossWeapon(items);
    if(weapon?.id!==this.weapon?.id) this.clearTargets();
    this.weapon=weapon;this.combat=combat;
    if(!combat || !weapon) {this.clearTargets();return;}
    if(weapon.id==='boss_warden') this.distance=Math.min(4,this.distance+Math.max(0,Math.min(1,distance)));
    for(let i=this.pending.length-1;i>=0;i--){
      const hit=this.pending[i];if(hit.at>this.time)continue;this.pending.splice(i,1);
      const nearby=this.host.targets(null,14).filter(m=>m.roomId===hit.target.roomId);
      const target=nearby.includes(hit.target)&&!hit.target.dead ? hit.target : hit.retarget?nearby.find(m=>!m.dead):undefined;
      if(!target)continue;
      this.strike(target,hit.multiplier);
      if(weapon.id==='boss_bell')this.host.slow(target,1.5);
    }
  }
  onCast(paidMana:number):void {if(this.combat&&this.weapon?.id==='boss_furnace'&&paidMana>0)this.pressure=true;}
  onHit(target:Monster,damage:number,source:string):void {
    if(!this.combat||!this.weapon||target.dead||damage<=0||!isPrimaryEquipmentHit(source)||this.hitGate>this.time)return;
    this.hitGate=this.time+.25;
    const id=this.weapon.id;
    if(id==='boss_oath')this.hits=Math.min(3,this.hits+1);
    if(this.cooldown>this.time)return;
    if(id==='boss_oath'){
      if(this.hits<3)return;this.hits=0;this.cooldown=this.time+3;
      this.strike(target,1.8);this.host.slow(target,1.2);this.host.shield(this.host.maxHealth()*.08);
    } else if(id==='boss_furnace'||id==='boss_warden'){
      if(id==='boss_furnace'?!this.pressure:this.distance<4)return;
      this.pressure=false;this.distance=0;this.cooldown=this.time+3;
      for(const other of this.host.targets(target,3).filter(m=>!m.dead).slice(0,3)){
        this.strike(other,.9);if(id==='boss_warden')this.host.slow(other,1);
      }
    } else {
      this.cooldown=this.time+3;
      const abyss=id==='boss_abyss';
      for(let i=0;i<(abyss?3:1);i++)this.pending.push({target,at:this.time+(abyss?.18*(i+1):.65),multiplier:abyss?.6:1.8,retarget:abyss});
    }
  }
  private strike(target:Monster,multiplier:number):void {
    if(!this.weapon||target.dead)return;
    this.host.effect?.(this.weapon.id==='boss_furnace'?'burst':this.weapon.id==='boss_bell'?'echo':'scythe',target,2);
    this.host.damage(target,this.host.attack()*multiplier,this.weapon.element,'scythe');
  }
  clearTargets():void {this.pending=[];this.hits=0;this.distance=0;this.pressure=false;this.combat=false;}
  reset():void {this.clearTargets();this.weapon=undefined;this.time=0;this.cooldown=0;this.hitGate=0;}
  /** Only remaining cooldown persists; entity-bound attacks and charges never cross loading. */
  snapshot():number {return Math.max(0,Math.min(3,this.cooldown-this.time));}
  restore(remaining=0):void {this.reset();this.cooldown=Math.max(0,Math.min(3,remaining));}
}
