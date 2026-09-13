import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {buildSync}=createRequire(require.resolve('vite/package.json'))('esbuild');
const result=buildSync({stdin:{contents:`export {RunManager} from './src/core/RunManager'; export {unlockNode} from './src/progression/MetaProgression'; export {validateSaveEnvelope} from './src/core/SaveValidation'; export {LootSystem} from './src/items/LootSystem'; export {RNG} from './src/utils/RNG'; export {monsterAggression} from './src/monsters/EnemyIntent';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const {RunManager,unlockNode,validateSaveEnvelope,LootSystem,RNG,monsterAggression}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
test('hard unlock requires two victories and costs no points; mode survives save validation',()=>{
  let envelope=RunManager.createEnvelope('difficulty-test');
  envelope.profile.completedBasicVictories=1;
  assert.throws(()=>unlockNode(envelope,'hard_mode'));
  assert.throws(()=>RunManager.startRun(envelope,'a',1,'vanguard',1,'hard'));
  envelope.profile.completedBasicVictories=2;
  envelope=unlockNode(envelope,'hard_mode');
  assert.equal(envelope.profile.availableMetaPoints,0);
  const hard=RunManager.startRun(envelope,'a',1,'vanguard',1,'hard');
  assert.equal(hard.activeRun.difficulty,'hard');
  assert.equal(validateSaveEnvelope(JSON.parse(JSON.stringify(hard))).ok,true);
  delete hard.activeRun.difficulty;
  assert.equal(validateSaveEnvelope(hard).ok,true);
  hard.activeRun.difficulty='invalid';
  assert.equal(validateSaveEnvelope(hard).ok,false);
});
test('hard small-monster relic roll is independent of ordinary equipment and never rolls a boss weapon',()=>{
  class RelicRNG extends RNG {chance(probability){return probability===.005;}}
  const roll=mode=>LootSystem.rollLoot({id:'skeleton'},1,0,false,1,undefined,2,undefined,new RelicRNG(123),mode).filter(drop=>drop.kind==='item');
  assert.equal(roll('normal').length,0);
  const items=roll('hard');assert.equal(items.length,1);assert.equal(items[0].item.rarity,'mythic');assert.equal(items[0].item.setId,'death_reaper');
});
test('hard cadence multiplies existing normal, boss and adaptive cadence by exactly 1.2',()=>{
  for(const behavior of ['melee','boss'])for(const aggression of [.8,1,1.2]){
    const m={def:{behavior},group:{userData:{aggression}}};const normal=monsterAggression(m);m.group.userData.hardMode=true;
    assert.ok(Math.abs(monsterAggression(m)/normal-1.2)<1e-10);
  }
});
