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
export {materialOffers,materialPool} from './src/items/MaterialEconomy';
export {generateFloor,isWalkable} from './src/world/FloorGenerator';
export {RunManager} from './src/core/RunManager';
export {settleRun} from './src/progression/Settlement';
export {talentPointsForFloor,REQUIRED_OBJECTIVE_IDS} from './src/data/runProgression';
`,resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const api = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

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

test('death and victory award full depth points without consuming legacy research remainder', () => {
  const envelope = api.RunManager.startRun(api.RunManager.createEnvelope('legacy-profile'),'run',42,'vanguard',1);
  const run = envelope.activeRun;
  for (const [floor,points] of [[1,10],[5,50],[7,70],[10,100],[12,140],[15,200],[17,260],[20,350],[23,440],[25,500]]) {
    run.snapshot={floor};
    assert.equal(api.talentPointsForFloor(floor),points);
    const result = api.settleRun(run,'death',2,73);
    assert.equal(result.pointsEarned,points);
    assert.equal(result.researchXp,73);
  }
  run.completedObjectives=[...api.REQUIRED_OBJECTIVE_IDS];
  assert.equal(api.settleRun(run,'victory',2,73).pointsEarned,500);
  assert.equal(api.settleRun(run,'abandoned',2,73).pointsEarned,0);
  envelope.profile.availableMetaPoints=321;
  envelope.profile.researchXp=73;
  envelope.profile.unlockedNodes.push('camp_trunk_1');
  const settled=api.RunManager.finish(envelope,'victory',2);
  assert.equal(settled.profile.availableMetaPoints,821);
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
