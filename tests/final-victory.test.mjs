import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {buildSync}=createRequire(require.resolve('vite/package.json'))('esbuild');
const built=buildSync({stdin:{contents:`
export {generateFloor} from './src/world/FloorGenerator';
export {EncounterDirector} from './src/core/EncounterDirector';
export {RunManager} from './src/core/RunManager';
export {REQUIRED_OBJECTIVE_IDS} from './src/data/runProgression';
export {hasVictoryObjectives,canExtract} from './src/progression/Settlement';`,resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',define:{'import.meta.glob':'emptyAssetGlob','import.meta.env.BASE_URL':'"/"'},banner:{js:'const emptyAssetGlob = () => ({});'}});
const {generateFloor,EncounterDirector,RunManager,REQUIRED_OBJECTIVE_IDS,hasVictoryObjectives,canExtract}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const sample={level:30,equipmentLevelTotal:200,upgradeCount:3};
const create=()=>RunManager.startRun(RunManager.createEnvelope('profile'),'run',411485540,'vanguard',1);

test('current 25-floor maps record all objectives and settle exactly one victory',()=>{
 const envelope=create(),run=envelope.activeRun;
 for(let floor=1;floor<=25;floor++){
  const data=generateFloor(411485540,floor,7);
  const required=data.rooms.filter(r=>r.required);
  assert.deepEqual(required.map(r=>r.id).sort(),['room-1','room-4'],`floor ${floor}`);
  const director=new EncounterDirector(data);
  director.state.started=required.map(r=>r.id);
  assert.equal(director.portalReady,false);
  for(const room of director.complete(new Set())) RunManager.completeObjective(run,`${floor}-${room.id}`,sample);
  assert.equal(director.portalReady,true);
  run.snapshot={floor};
  if(floor===20) assert.equal(canExtract(run),true);
 }
 assert.equal(hasVictoryObjectives(run),true);
 const done=RunManager.finish(envelope,'victory',2);
 assert.equal(done.pendingSettlement.totalXp,500);
 assert.equal(done.pendingSettlement.completedObjectives,50);
 assert.equal(done.profile.completedBasicVictories,1);
 assert.equal(done.profile.availableMetaPoints,envelope.profile.availableMetaPoints+5);
 assert.equal(RunManager.finish(done,'victory',3),done);
});

test('stuck old floor-25 save recovers the two omitted records without changing progression or inventing fights',()=>{
 const envelope=create(),run=envelope.activeRun;
 run.completedObjectives=REQUIRED_OBJECTIVE_IDS.filter(id=>!['20-room-4','25-room-4'].includes(id));
 run.snapshot={floor:25};
 assert.equal(hasVictoryObjectives(run),false);
 assert.equal(RunManager.repairLateBossObjectives(run,25,7,['room-4','room-1']),true);
 assert.equal(hasVictoryObjectives(run),true);
 assert.equal(RunManager.repairLateBossObjectives(run,25,7,['room-4','room-1']),false);
 assert.deepEqual(run.investments,[]);
 assert.equal(RunManager.finish(envelope,'victory',2).pendingSettlement.totalXp,500);
});

test('repair does not grant an uncleared final room, an undefeated boss, or unrelated missing objectives',()=>{
 const run=create().activeRun;
 assert.equal(RunManager.repairLateBossObjectives(run,25,7,[]),false);
 run.completedObjectives=['20-room-1'];
 RunManager.repairLateBossObjectives(run,25,7,[]);
 assert.deepEqual(run.completedObjectives,['20-room-1','20-room-4']);
 assert.equal(hasVictoryObjectives(run),false);
 assert.equal(RunManager.repairLateBossObjectives(run,25,6,['room-4']),false);
 assert.throws(()=>RunManager.finish({...create(),activeRun:run},'victory',2),/required objectives/);
});

test('old floor-20 checkpoint is restored from cleared rooms without rewriting investment samples',()=>{
 const run=create().activeRun;
 run.snapshot={floor:20};
 run.completedObjectives=REQUIRED_OBJECTIVE_IDS.filter(id=>Number(id.split('-')[0])<=20&&id!=='20-room-4');
 run.investments=[{id:'20-room-4',peak:sample,completed:false}];
 const before=JSON.stringify(run.investments);
 assert.equal(canExtract(run),false);
 assert.equal(RunManager.repairLateBossObjectives(run,20,7,['room-4','room-1']),true);
 assert.equal(canExtract(run),true);
 assert.equal(JSON.stringify(run.investments),before);
});
