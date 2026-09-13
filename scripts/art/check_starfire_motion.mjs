import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {buildSync}=createRequire(require.resolve('vite/package.json'))('esbuild');
const result=buildSync({entryPoints:['src/player/HeroMotionState.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {HeroMotionState}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const m=new HeroMotionState(), dt=1/60;
// Repeated small step-downs never queue a heavy recovery.
for(let step=0;step<12;step++) {
  m.update(dt,false,-1,3,1,true);m.update(dt,false,-1.4,3,1,true);
  m.update(dt,true,0,3,1,true);assert.equal(m.landing,0);
}
m.reset();const seen=new Set();
for(let i=0;i<40;i++){m.update(dt,false,8-i*.4,0,0,true);seen.add(m.state);}
assert.deepEqual([...seen],['Jump_Start','Jump_Rise','Jump_Apex','Jump_Fall']);
m.update(dt,true,0,0,0,true);assert.equal(m.state,'Land_Light');
m.update(dt,false,8,2,1,true);assert.equal(m.state,'Jump_Start');assert.equal(m.landing,0);
m.reset();for(let i=0;i<50;i++)m.update(dt,false,-i*.4,0,0,true);
m.update(dt,true,0,3,1,true);assert.equal(m.state,'Land_Heavy');
const before=JSON.stringify(m);m.update(1,true,0,0,0,false);assert.equal(JSON.stringify(m),before);
console.log('PASS: short steps, all jump phases, light/heavy landing, immediate re-jump, dead-state freeze');
