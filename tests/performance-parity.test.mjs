import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const built = buildSync({ define: { 'import.meta.env.BASE_URL': '"/"' }, stdin: { contents: `
export {stepProjectile as before} from './tests/fixtures/ProjectileBaseline';
export {stepProjectile as after} from './src/combat/ProjectileSystem';
export {MonsterSpatialIndex} from './src/combat/MonsterSpatialIndex';
export {updateProjectileRuntime} from './src/combat/ProjectileRuntime';
export {EffectiveStatsCache} from './src/progression/EffectiveStatsCache';
export {applyPermanentMetaBonuses,PERMANENT_META_NODES} from './src/progression/MetaProgression';
export {EquipmentManager} from './src/items/EquipmentManager';
export {createSaveCandidate} from './src/core/SaveCandidate';
export {RunManager} from './src/core/RunManager';
export {DamageNumberSystem as OldNumbers} from './tests/fixtures/DamageNumberBaseline';
export {DamageNumberSystem as NewNumbers} from './src/ui/DamageNumber';
export {Vector3,PerspectiveCamera} from 'three';
`, loader: 'ts', resolveDir: fileURLToPath(new URL('..', import.meta.url)) }, bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

test('optimized collision matches frozen baseline across walls, ties, piercing and moving actors', () => {
  let seed = 42;
  const random = () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const vec = () => new api.Vector3(random()*20,random()*4,random()*20);
  for (let i=0;i<800;i++) {
    const monsters = Array.from({length:48},(_,id)=>({id,position:vec(),dead:random()<.1,def:{behavior:id%5?'melee':'boss'}}));
    monsters[1].position.copy(monsters[0].position);
    const player={position:vec()};
    const grid=Array.from({length:24},()=>Array.from({length:24},()=>random()<.08?2:1));
    const floor=i%2?{size:24,grid,rooms:[]}:null;
    const source={position:vec(),velocity:vec().sub(new api.Vector3(10,2,10)),life:random(),friendly:i%3!==0,traveled:random(),maxDistance:random()*20,radius:.1+random()*2,hitMonsterIds:new Set([2,7])};
    if(i%10===0)source.position.copy(monsters[0].position);
    const copy=()=>({...source,position:source.position.clone(),velocity:source.velocity.clone(),hitMonsterIds:new Set(source.hitMonsterIds)});
    const a=copy(),b=copy(),dt=random()*.4;
    const index=new api.MonsterSpatialIndex();
    index.rebuild(monsters);
    assert.deepEqual(api.after(b,dt,floor,index.query(b,dt),player),api.before(a,dt,floor,monsters,player));
    assert.deepEqual(b,a);
  }
});

test('spatial candidates refresh after knockback and new spawns, preserving ties', () => {
  const index=new api.MonsterSpatialIndex();
  const monsters=[{id:1,dead:false,position:new api.Vector3(30,0,30),def:{behavior:'melee'}}];
  index.rebuild(monsters);
  monsters[0].position.set(2,0,0);
  monsters.push({id:2,dead:false,position:new api.Vector3(2,0,0),def:{behavior:'melee'}});
  index.rebuild(monsters);
  const make=()=>({position:new api.Vector3(0,1,0),velocity:new api.Vector3(10,0,0),friendly:true,traveled:0,life:1});
  const a=make(),b=make(),player={position:new api.Vector3(50,0,50)};
  assert.deepEqual(api.after(b,.3,null,index.query(b,.3),player),api.before(a,.3,null,monsters,player));
  assert.deepEqual(a,b);
});

test('pooled damage labels keep count, random sequence, trajectory and expiry', () => {
  class Element {
    style={}; children=[]; dataset={};
    setAttribute() {}
    appendChild(child) { this.children.push(child); child.parent=this; }
    replaceChildren(...children) { this.children=[]; children.forEach(c=>this.appendChild(c)); }
    remove() { if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this); }
  }
  const oldDocument=globalThis.document,oldWindow=globalThis.window,oldRandom=Math.random;
  globalThis.document={createElement:()=>new Element()};
  globalThis.window={innerWidth:844,innerHeight:390};
  try {
    const camera=new api.PerspectiveCamera(60,844/390,.1,100);
    const old=new api.OldNumbers(new Element(),camera),next=new api.NewNumbers(new Element(),camera);
    for(const crit of [true,false]) {
      Math.random=()=>.4;
      old.spawn(new api.Vector3(0,0,-5),'123','#ff0000',crit);
      next.spawn(new api.Vector3(0,0,-5),'123','#ff0000',crit);
      for(let frame=0;frame<80;frame++) {
        old.update(.02);next.update(.02);
        assert.equal(next.entries.length,old.entries.length);
        if(!old.entries.length)continue;
        const a=old.entries[0],b=next.entries[0];
        assert.deepEqual(b.worldPosition,a.worldPosition);
        assert.deepEqual(b.velocity,a.velocity);
        assert.equal(b.life,a.life);
        assert.equal(b.element.style.opacity,a.element.style.opacity);
        assert.equal(b.element.style.transform,`translate(${a.element.style.left}, ${a.element.style.top}) translate(-50%, -50%)`);
      }
    }
    assert.equal(next.pool.length,1);
    next.clear();assert.equal(next.pool.length,0);
  } finally { globalThis.document=oldDocument;globalThis.window=oldWindow;Math.random=oldRandom; }
});

test('projectile lifecycle preserves piercing, impact precedence and pause interruption', () => {
  for (const target of ['monster','player','wall','none']) for (const expired of [false,true]) for (const pause of [false,true]) {
    const events=[];
    const projectile={position:new api.Vector3(),mesh:{position:new api.Vector3()},piercesRemaining:1};
    const projectiles=[projectile];
    api.updateProjectileRuntime(.1,{
      projectiles:()=>projectiles,paused:()=>false,
      step:()=>({hitMonster:target==='monster'?{}:null,hitPlayer:target==='player',hitWall:target==='wall',expired}),
      hitMonster:()=>{events.push('monster');return !pause;},
      hitPlayer:()=>{events.push('player');return !pause;},
      impact:()=>events.push('impact'),expire:()=>events.push('expire'),dispose:()=>events.push('dispose'),
    });
    const expected=[];
    if(target==='monster'||target==='player')expected.push(target);
    const interrupted=pause&&(target==='monster'||target==='player');
    const pierced=target==='monster'&&!expired&&!interrupted;
    const removed=!interrupted&&!pierced&&(target!=='none'||expired);
    if(removed)expected.push(target==='none'?'expire':'impact','dispose');
    assert.deepEqual(events,expected);
    assert.equal(projectiles.length,removed?0:1);
    assert.equal(projectile.piercesRemaining,pierced?0:1);
  }
});

test('stat cache matches original formulas and invalidates for node edits and new base stats', () => {
  const cache=new api.EffectiveStatsCache(),equipment=new api.EquipmentManager();
  let base=equipment.getDerivedStats();
  const nodes=[];
  for(const node of api.PERMANENT_META_NODES) {
    nodes.push(node.id);
    const result=cache.get(base,nodes);
    assert.deepEqual(result,api.applyPermanentMetaBonuses(base,nodes));
    assert.equal(cache.get(base,[...nodes]),result);
  }
  nodes.splice(0,1);
  assert.deepEqual(cache.get(base,nodes),api.applyPermanentMetaBonuses(base,nodes));
  base={...base,attack:base.attack+20};
  assert.deepEqual(cache.get(base,nodes),api.applyPermanentMetaBonuses(base,nodes));
});

test('save candidate equals old clone-and-replace without mutating original history', () => {
  const envelope=api.RunManager.startRun(api.RunManager.createEnvelope('parity'),'run',42,'vanguard',1);
  envelope.activeRun.snapshot={old:'snapshot',inventory:Array(100).fill({name:'old'})};
  const original=structuredClone(envelope),snapshot={version:2,floor:12};
  const expected=structuredClone(envelope);
  expected.activeRun.maxLevel=Math.max(expected.activeRun.maxLevel,18);
  expected.activeRun.upgradeCount=Math.max(expected.activeRun.upgradeCount,7);
  expected.activeRun.snapshot=snapshot;
  expected.revision++;
  const actual=api.createSaveCandidate(envelope,snapshot,18,7);
  assert.deepEqual(actual,expected);
  assert.equal(JSON.stringify(actual),JSON.stringify(expected));
  assert.deepEqual(envelope,original);
});
