import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const {buildSync}=createRequire(require.resolve('vite/package.json'))('esbuild');
const built=buildSync({stdin:{contents:`
export {BOSS_WEAPONS} from './src/data/BossWeapons';
export {BossWeaponRuntime} from './src/items/BossWeaponRuntime';
export {ItemGenerator} from './src/items/ItemGenerator';
export {LootSystem} from './src/items/LootSystem';
export {P5_BASE_ITEMS} from './src/items/SetItems';
export {EquipmentManager} from './src/items/EquipmentManager';
export {CraftingSystem} from './src/items/CraftingSystem';
export {RNG} from './src/utils/RNG';
export {RunManager} from './src/core/RunManager';
export {validateSaveEnvelope} from './src/core/SaveValidation';
`,resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const a=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const itemFor=w=>a.ItemGenerator.generateBossWeapon(w.bossId,25,new a.RNG(19),25);

test('exclusive pool rolls once, chooses only owner weapon or old relic; regular sources excluded',()=>{
  for(const w of a.BOSS_WEAPONS){
    for(const chooseWeapon of [true,false]){
      const rng=new a.RNG(2),chances=[];
      rng.chance=p=>{chances.push(p);return p===.03 || (p===.5 && chooseWeapon);};
      const drops=a.LootSystem.rollLoot({id:w.bossId},25,0,true,25,undefined,2,undefined,rng);
      const red=drops.filter(d=>d.kind==='item'&&d.item.rarity==='mythic');
      assert.equal(red.length,1);assert.equal(chances.filter(p=>p===.03).length,1);
      assert.equal(red[0].item.contentId.startsWith('boss_'),chooseWeapon);
      if(chooseWeapon)assert.equal(red[0].item.contentId,w.id);
    }
    assert.ok(!a.P5_BASE_ITEMS.some(i=>i.setId===w.setId));
    const rng=new a.RNG(2);rng.chance=()=>false;
    assert.ok(!a.LootSystem.rollLoot({id:w.bossId},25,100,true,25,undefined,2,undefined,rng).some(d=>d.kind==='item'&&d.item.rarity==='mythic'));
    rng.chance=()=>true;
    const normal=a.LootSystem.rollLoot({id:w.bossId},25,100,false,25,undefined,2,undefined,rng);
    assert.ok(!normal.some(d=>d.kind==='item'&&d.item.rarity==='mythic'));
  }
});

test('one weapon activates 1-piece set, crafting preserves identity, save retains equipped and ground relic',()=>{
  for(const w of a.BOSS_WEAPONS){
    const item=itemFor(w),eq=new a.EquipmentManager();eq.equip(item);
    assert.ok(eq.getActiveSetBonuses().some(s=>s.setId===w.setId&&s.count===1));
    const reforged=a.CraftingSystem.reforgeItem(item,new a.RNG(10),{tag:'melee'});
    assert.equal(reforged.contentId,w.id);assert.ok(reforged.affixes.some(f=>f.special===w.id));
    const env=a.RunManager.startRun(a.RunManager.createEnvelope('boss-save'),'run',31,'vanguard',1);
    env.profile.discoveredRelics=[w.id,'death_reaper_scythe'];
    env.activeRun.snapshot={version:2,floor:1,seed:31,player:{level:25,xp:0,xpToNext:100,attributePoints:0,health:100,mana:30,stats:{},position:{x:1,y:0,z:1}},gold:100,materials:0,kills:0,inventory:[item],equipment:{weapon:item},shopStock:[],runtime:{elapsed:0,shield:0,invulnerable:0,attackTimer:0,comboCount:0,comboTimer:0,lowHealthShieldCooldown:0,skillCooldowns:{},bossWeaponCooldown:2,relicDrops:[{x:2,z:2,item}]}};
    assert.equal(a.validateSaveEnvelope(env).ok,true,w.id);
  }
});

function fixture(w){
  const target={dead:false,roomId:'r'},other={dead:false,roomId:'r'},hits=[],slows=[],shields=[];
  const runtime=new a.BossWeaponRuntime({attack:()=>100,maxHealth:()=>100,targets:()=>[target,other].filter(t=>!t.dead),damage:(t,n,e)=>hits.push({t,n,e}),slow:(t,n)=>slows.push(n),shield:n=>shields.push(n)});
  const item=itemFor(w);const tick=(distance=0)=>runtime.update(.25,[item],distance,true);
  tick();return {target,other,hits,slows,shields,runtime,item,tick};
}
test('five actual mechanics trigger, no secondary recursion, pending strikes cancel on swap and transition',()=>{
  for(const w of a.BOSS_WEAPONS){
    const f=fixture(w),r=f.runtime;
    r.onHit(f.target,10,'equipment');assert.equal(f.hits.length,0);
    if(w.id==='boss_oath'){for(let i=0;i<3;i++){r.onHit(f.target,10,'melee_attack');f.tick();}assert.equal(f.shields[0],8);}
    else if(w.id==='boss_furnace'){r.onHit(f.target,10,'melee_attack');assert.equal(f.hits.length,0);f.tick();r.onCast(0);r.onHit(f.target,10,'melee_attack');assert.equal(f.hits.length,0);f.tick();r.onCast(10);r.onHit(f.target,10,'melee_attack');}
    else if(w.id==='boss_warden'){for(let i=0;i<4;i++)f.tick(1);r.onHit(f.target,10,'melee_attack');}
    else {r.onHit(f.target,10,'staff_attack');for(let i=0;i<3;i++)f.tick();}
    assert.ok(f.hits.length>0,w.id);assert.ok(f.hits.every(h=>h.e===w.element));
    const count=f.hits.length;r.onHit(f.target,10,'melee_attack');assert.equal(f.hits.length,count);
    const remaining=r.snapshot();assert.ok(remaining>0&&remaining<=3);
    r.restore(remaining);r.update(.01,[f.item],0,true);r.onHit(f.target,10,'staff_attack');assert.equal(f.hits.length,count);
    r.clearTargets();for(let i=0;i<4;i++)f.tick();assert.equal(f.hits.length,count);
  }
  for(const id of ['boss_bell','boss_abyss']){
    const f=fixture(a.BOSS_WEAPONS.find(w=>w.id===id));f.runtime.onHit(f.target,10,'staff_attack');
    f.target.dead=true;for(let i=0;i<3;i++)f.tick();
    assert.equal(f.hits.length,id==='boss_bell'?0:3);
    const g=fixture(a.BOSS_WEAPONS.find(w=>w.id===id));g.runtime.onHit(g.target,10,'staff_attack');g.runtime.update(.25,[],0,true);for(let i=0;i<4;i++)g.tick();assert.equal(g.hits.length,0);
  }
});
