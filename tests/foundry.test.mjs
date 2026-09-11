import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const compiled = buildSync({stdin: {contents: `
  export {generateFloor,isWalkable} from './src/world/FloorGenerator';
  export {ValveOverseer} from './src/monsters/ValveOverseer';
  export {monsterAttack} from './src/data/recipes';
  export {FoundryEnemies} from './src/monsters/FoundryEnemies';
  export {prepareFoundryPanels,foundryPanels,breakFoundryPanel} from './src/world/FoundryPanels';
  export {EncounterDirector} from './src/core/EncounterDirector';
  export {Vector3,Scene,Group} from 'three';
  export {FoundryBossController} from './src/monsters/FoundryBossController';`,
  resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts'},
  bundle: true, write: false, format: 'esm', platform: 'node'});
const {generateFloor,isWalkable,ValveOverseer,monsterAttack,FoundryEnemies,prepareFoundryPanels,foundryPanels,breakFoundryPanel,EncounterDirector,Vector3,Scene,Group,FoundryBossController} = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

function reachable(floor, start, allowed = () => true) {
  const key = (x,z) => `${x},${z}`;
  const seen = new Set([key(start.x,start.z)]), queue = [start];
  for (let i=0;i<queue.length;i++) for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const x=queue[i].x+dx,z=queue[i].z+dz;
    if (isWalkable(floor,x,z) && allowed(x,z) && !seen.has(key(x,z))) {seen.add(key(x,z));queue.push({x,z});}
  }
  return seen;
}

test('foundry samples stay connected, with an unavoidable lesson and connected room interior', () => {
  const kinds = new Set();
  for (const seed of [1,2,3,4,5,6,7,8,9,10,11,12]) {
    const floor=generateFloor(seed,6), room=floor.rooms.find(r=>r.template==='pressure-ring');
    kinds.add(floor.layoutKind);
    assert.equal(floor.generationVersion,4);
    assert.ok(floor.size<=64 && floor.rooms.length===7 && floor.merchant);
    const all=reachable(floor,floor.spawn);
    for(let z=0;z<floor.size;z++) for(let x=0;x<floor.size;x++) if(isWalkable(floor,x,z)) assert.ok(all.has(`${x},${z}`));
    const mask=new Set(room.cells.map(c=>`${c.x},${c.z}`));
    const inside=reachable(floor,{x:Math.floor(room.center.x),z:Math.floor(room.center.z)},(x,z)=>mask.has(`${x},${z}`));
    for(const c of room.cells) if(isWalkable(floor,c.x,c.z)) assert.ok(inside.has(`${c.x},${c.z}`));
    const bypass=reachable(floor,floor.spawn,(x,z)=>!mask.has(`${x},${z}`));
    assert.ok(!bypass.has(`${floor.portal.x},${floor.portal.z}`),'teaching room cannot be bypassed');
  }
  assert.equal(kinds.size,3);
});

test('old maps retain their generator and the chapter stays within floors 6-10', () => {
  assert.equal(generateFloor(1,6,1).size,40);
  assert.equal(generateFloor(1,6,2).theme.id,'stone-ruins');
  for(const floor of [1,5,11,25]) {
    const old=generateFloor(8,floor,2), current=generateFloor(8,floor,4);
    assert.deepEqual(current.grid,old.grid);
    assert.deepEqual(current.rooms,old.rooms);
  }
});

test('steam has a warning, one scaled hit, interrupt recovery and death cleanup', () => {
  const floor=generateFloor(1,6),room=floor.rooms.find(r=>r.template==='pressure-ring');
  const monster={def:{id:'valve_overseer',attack:15},roomId:room.id,dead:false,velocity:{set(){}},faceToward(){}};
  const player={position:{x:room.x+2.5,z:room.z+4.5}};
  const visuals=new Set(), hits=[];
  const host={addWorldObject(o){visuals.add(o)},removeWorldObject(o){visuals.delete(o)},damagePlayer(n,c){hits.push([n,c])}};
  const mechanics=new ValveOverseer();
  const advance=seconds=>{for(let t=0;t<seconds-.0001;t+=.05) mechanics.update(.05,[monster],player,floor,host)};
  advance(2.6);
  assert.equal(hits.length,0);assert.equal(visuals.size,1);
  mechanics.interrupt(monster);advance(.05);
  assert.equal(visuals.size,0);assert.equal(hits.length,0);
  advance(2.1);assert.equal(hits.length,0);
  advance(1.5);assert.deepEqual(hits,[[monsterAttack(15,6),'foundry_steam']]);
  advance(1);assert.equal(hits.length,1);
  const saved=mechanics.serialize(monster);assert.equal(saved.interruptedCast,true);
  monster.dead=true;advance(.05);assert.equal(visuals.size,0);
  mechanics.clear(host);assert.equal(visuals.size,0);
  monster.dead=false;mechanics.restore(monster,saved);advance(1);assert.equal(visuals.size,0);
});


test('chapter rooms and broken panels remain navigable and optional trial requires interaction',()=>{
  for(const floorNumber of [7,8,9,10]) for(const seed of [2,7,11]) {
    const floor=generateFloor(seed,floorNumber);prepareFoundryPanels(floor);
    const reached=reachable(floor,floor.spawn);
    for(const room of floor.rooms) assert.ok(reached.has(`${Math.floor(room.center.x)},${Math.floor(room.center.z)}`));
    for(const panel of foundryPanels(floor)) {
      assert.ok(breakFoundryPanel(floor,panel.cells[0].x,panel.cells[0].z));
      assert.equal(breakFoundryPanel(floor,panel.cells[0].x,panel.cells[0].z),null);
    }
    const restored=generateFloor(seed,floorNumber);prepareFoundryPanels(restored,foundryPanels(floor).map(p=>p.id));
    assert.deepEqual(restored.grid,floor.grid);
    const trial=floor.rooms.find(r=>r.template==='overload-trial');
    if(trial) {
      const director=new EncounterDirector(floor),p=trial.center;
      assert.equal(director.enter(p.x,p.z),null);
      assert.equal(director.enter(p.x,p.z,true)?.id,trial.id);
      assert.equal(director.enter(p.x,p.z,true),null);
    }
  }
});

function actor(id,x,z) {
  return {def:{id,attack:17,behavior:'melee'},position:new Vector3(x,0,z),velocity:new Vector3(),
    roomId:'r',dead:false,slowMultiplier:1,faceToward(){}};
}
function fixture() {
  const size=16,grid=Array.from({length:size},(_,z)=>Array.from({length:size},(_,x)=>x===0||z===0||x===size-1||z===size-1?2:1));
  return {size,grid,floor:8,rooms:[{id:'r',x:1,z:1,width:14,depth:14,kind:'battle'}]};
}
test('prism locks its line and smith supply breaks on direct interruption',()=>{
  const floor=fixture(),scene=new Scene(),hits=[];
  const host={addWorldObject:o=>scene.add(o),removeWorldObject:o=>scene.remove(o),damagePlayer:(n,c)=>hits.push([n,c])};
  const sentry=actor('prism_sentry',4.5,4.5),player={position:new Vector3(10.5,0,4.5)};
  const behavior=new FoundryEnemies();
  for(let i=0;i<43;i++) behavior.update(.05,[sentry],player,floor,host);
  assert.equal(hits.length,0);assert.equal(scene.children.length,1);
  player.position.z=8;
  for(let i=0;i<24;i++) behavior.update(.05,[sentry],player,floor,host);
  assert.equal(hits.length,0);behavior.clear(host);assert.equal(scene.children.length,0);
  const smith=actor('chain_smith',4.5,4.5),target=actor('zombie',5.5,4.5);
  for(let i=0;i<43;i++) behavior.update(.05,[smith,target],player,floor,host);
  assert.equal(behavior.directHit(target,100),75);
  behavior.directHit(smith,10);assert.equal(behavior.directHit(target,100),100);
  behavior.clear(host);assert.equal(scene.children.length,0);
});


test('regent warning, jumpable wave, single reinforcement and load cleanup',()=>{
  const floor=fixture();floor.floor=10;
  function setup(height=0) {
    const scene=new Scene(),boss=actor('furnace_regent',7.5,7.5);
    Object.assign(boss,{group:new Group(),health:100,maxHealth:760,speedMultiplier:1});
    Object.assign(boss.def,{attackRange:2,speed:1.8,detectRadius:28});
    const player={position:new Vector3(10.5,height,7.5),alive:true};
    const hits=[],summons=[];
    const host={damagePlayer:(...args)=>hits.push(args),summonMinion:p=>summons.push(p),showMessage(){}};
    const controller=new FoundryBossController(scene);
    return {scene,boss,player,hits,summons,host,controller};
  }
  for(const height of [0,1]) {
    const f=setup(height),c=f.controller;
    c.restore({...c.snapshot(),phase:3,cycle:2,reinforcementUsed:1});
    c.update(2.5,f.boss,f.player,floor,f.host,40);
    assert.equal(c.snapshot().attackKind,6);assert.equal(f.hits.length,0);
    f.player.position.set(7.5,height,10.5);
    c.update(1.3,f.boss,f.player,floor,f.host,40);
    for(let i=0;i<6;i++) c.update(.2,f.boss,f.player,floor,f.host,40);
    assert.equal(f.hits.length,height===0?1:0);
    const saved=c.snapshot();c.restore(saved);assert.ok(c.snapshot().cooldown>=2.5);assert.equal(c.snapshot().attackKind,0);
    c.clear();assert.equal(f.scene.children.length,0);assert.equal(f.boss.group.children.length,0);
  }
  const f=setup();
  for(let i=0;i<100;i++) f.controller.update(.1,f.boss,f.player,floor,f.host,40);
  assert.equal(f.summons.length,2);
  f.controller.restore(f.controller.snapshot());
  for(let i=0;i<100;i++) f.controller.update(.1,f.boss,f.player,floor,f.host,40);
  assert.equal(f.summons.length,2);
  f.boss.dead=true;f.controller.update(.1,f.boss,f.player,floor,f.host,40);
  assert.equal(f.scene.children.length,0);
});
