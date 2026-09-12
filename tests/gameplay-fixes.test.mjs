import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const built = buildSync({stdin:{contents:`
export {ItemGenerator} from './src/items/ItemGenerator';
export {CraftingSystem} from './src/items/CraftingSystem';
export {AffixSystem} from './src/items/AffixSystem';
export {DEATH_REAPER_ITEMS} from './src/data/DeathReaperItems';
export {RNG} from './src/utils/RNG';
export {monsterLootWeights,deathReaperBossChance} from './src/data/MonsterLoot';
export {rarityWeightsForFloor,RARITY_ORDER} from './src/data/recipes';
export {materialOffers,materialPool} from './src/items/MaterialEconomy';
export {generateFloor,isWalkable} from './src/world/FloorGenerator';
export {RunManager} from './src/core/RunManager';
export {settleRun} from './src/progression/Settlement';
export {researchXpForFloor,REQUIRED_OBJECTIVE_IDS} from './src/data/runProgression';
`,resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const api = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

test('orange and red monster drop probabilities use exact floor reductions', () => {
  const gain={common:1,magic:1,rare:1.5,epic:1.7,legendary:1.8,mythic:1};
  for(const [floor,multiplier] of [[1,.7],[5,.7],[6,.8],[10,.8],[11,.9],[15,.9],[16,1],[25,1]]) {
    assert.ok(Math.abs(api.deathReaperBossChance(floor)-.03*multiplier)<1e-12);
    for(const luck of [0,50,200])for(const minimum of ['common','rare','epic']) {
      const old=api.rarityWeightsForFloor(floor,luck).filter(e=>api.RARITY_ORDER.indexOf(e.rarity)>=api.RARITY_ORDER.indexOf(minimum)).map(e=>({...e,weight:e.weight*gain[e.rarity]}));
      const next=api.monsterLootWeights(floor,luck,minimum);
      const chance=(list,rarity)=> (list.find(e=>e.rarity===rarity)?.weight ?? 0)/list.reduce((sum,e)=>sum+e.weight,0);
      for(const rarity of ['epic','legendary']) assert.ok(Math.abs(chance(next,rarity)-chance(old,rarity)*multiplier)<1e-12);
      const low=old.filter(e=>api.RARITY_ORDER.indexOf(e.rarity)<3);
      const lowSum=low.reduce((sum,e)=>sum+e.weight,0);
      const removed=old.filter(e=>['epic','legendary'].includes(e.rarity)).reduce((sum,e)=>sum+e.weight*(1-multiplier),0);
      const rare=old.find(e=>e.rarity==='rare')?.weight ?? 0;
      const previousYellow=lowSum>0?rare+removed*rare/lowSum:removed;
      const total=old.reduce((sum,e)=>sum+e.weight,0);
      const yellowMultiplier=floor<=5?.75:floor<=10?.9:1;
      assert.ok(Math.abs(chance(next,'rare')-previousYellow/total*yellowMultiplier)<1e-12);
      if(multiplier===1)assert.deepEqual(next,old);
    }
  }
});

test('all nine relic slots reforge ordinary affixes in the chosen direction and preserve identity', () => {
  for (const [i, def] of api.DEATH_REAPER_ITEMS.entries()) {
    const item = api.ItemGenerator.generateDeathReaper(20,new api.RNG(i+1),25,def.slot);
    const before = structuredClone(item);
    const locked = item.affixes.find(a=>!a.special);
    const tag = api.AffixSystem.availableTags(item.slot).find(t=>api.CraftingSystem.canReforge(item,{tag:t.id,lockedAffixId:locked.id})).id;
    const result = api.CraftingSystem.reforgeItem(item,new api.RNG(i+101),{tag,lockedAffixId:locked.id});
    assert.deepEqual(item,before);
    for(const field of ['id','contentId','name','setId','rarity','slot','baseStats']) assert.deepEqual(result[field],item[field]);
    assert.deepEqual(result.affixes.filter(a=>a.special),item.affixes.filter(a=>a.special));
    assert.deepEqual(result.affixes.find(a=>a.id===locked.id),locked);
    assert.notDeepEqual(result.affixes,item.affixes);
    assert.equal(result.reforgeCount,1);
    assert.ok(result.affixes.filter(a=>!a.special&&a.id!==locked.id).some(a=>api.AffixSystem.candidatesForTag(item.slot,tag).some(d=>d.id===api.AffixSystem.definitionId(a))));
  }
});

test('all outcomes award research XP and preserve legacy balances and remainder', () => {
  const envelope = api.RunManager.startRun(api.RunManager.createEnvelope('legacy-profile'),'run',42,'vanguard',1);
  const run = envelope.activeRun;
  for (const [floor,points] of [[1,10],[5,50],[7,70],[10,100],[12,140],[15,200],[17,260],[20,350],[23,440],[25,500]]) {
    run.snapshot={floor};
    assert.equal(api.researchXpForFloor(floor),points);
    const result = api.settleRun(run,'death',2,73);
    assert.equal(result.record.totalXp,points);
    assert.equal(result.pointsEarned,Math.floor((73+points)/100));
    assert.equal(result.researchXp,(73+points)%100);
  }
  run.completedObjectives=[...api.REQUIRED_OBJECTIVE_IDS];
  for (const [floor,xp] of [[5,50],[10,100],[15,200],[20,350]]) {
    run.snapshot={floor};
    const result=api.settleRun(run,'extracted',2,0);
    assert.equal(result.record.totalXp,xp);
    assert.equal(result.pointsEarned,Math.floor(xp/100));
    assert.equal(result.researchXp,xp%100);
  }
  assert.equal(api.settleRun(run,'victory',2,73).pointsEarned,5);
  assert.equal(api.settleRun(run,'abandoned',2,73).pointsEarned,0);
  envelope.profile.availableMetaPoints=321;
  envelope.profile.researchXp=73;
  envelope.profile.unlockedNodes.push('camp_trunk_1');
  const settled=api.RunManager.finish(envelope,'victory',2);
  assert.equal(settled.profile.availableMetaPoints,326);
  assert.deepEqual(settled.profile.unlockedNodes,envelope.profile.unlockedNodes);
  assert.equal(settled.profile.researchXp,73);
  assert.equal(api.RunManager.finish(settled,'victory',3),settled);
});

test('expanded lord arena is connected and legacy version five is unchanged', () => {
  for (const seed of [42,411485540,1234]) {
    const old = api.generateFloor(seed,20,5), current=api.generateFloor(seed,20,6);
    const arena=current.rooms.find(r=>r.kind==='exit');
    assert.equal(arena.width,18);assert.equal(arena.depth,18);
    assert.ok(old.rooms.find(r=>r.kind==='exit').width < arena.width);
    const visited=new Set(), queue=[[current.spawn.x,current.spawn.z]];
    for(let i=0;i<queue.length;i++) {
      const [x,z]=queue[i];
      for(const [nx,nz] of [[x-1,z],[x+1,z],[x,z-1],[x,z+1]]) {
        const key=`${nx},${nz}`;
        if(!visited.has(key)&&api.isWalkable(current,nx,nz)){visited.add(key);queue.push([nx,nz]);}
      }
    }
    assert.ok(visited.has(`${current.portal.x},${current.portal.z}`));
    assert.deepEqual(api.generateFloor(seed,20,5),old);
  }
});

test('shop material shelves are limited, stable on reopen and depth gated', () => {
  for(const floor of [1,5,10,15,25]) {
    const offers=api.materialOffers(42,floor,0);
    assert.deepEqual(offers,api.materialOffers(42,floor,0));
    assert.equal(offers.length,2);assert.notEqual(offers[0].materialId,offers[1].materialId);
    assert.ok(offers.every(o=>o.amount>=1&&o.amount<=2));
    assert.ok(api.materialOffers(42,floor,1).every(o=>!offers.some(old=>old.id===o.id)));
    if(floor<15) assert.ok(!api.materialPool(floor).some(m=>m.id==='void_essence'));
  }
});
