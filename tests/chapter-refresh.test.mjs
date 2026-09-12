import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
const root = fileURLToPath(new URL('..', import.meta.url));
// Only image/network presentation is stubbed; real map, spawn, encounter and facility logic runs.
const compiled = await build({ stdin: { contents: `
  export {generateFloor} from './src/world/FloorGenerator';
  export {MonsterSpawner} from './src/monsters/MonsterSpawner';
  export {EncounterDirector} from './src/core/EncounterDirector';
  export {ChapterRituals,isOptionalTrial} from './src/world/ChapterEvents';
  export {chapterPressure,monsterDifficultyMultiplier,GLOBAL_MONSTER_STAT_MULTIPLIER} from './src/data/DifficultyBalance';
  export {sanctumRitualPositions} from './src/data/SanctumChapter';
  export {LootSystem} from './src/items/LootSystem';
  export {monsterLootWeights,monsterItemChance} from './src/data/MonsterLoot';
  export {rarityWeightsForFloor,RARITY_ORDER} from './src/data/recipes';
  export {OathGatekeeperController} from './src/monsters/OathGatekeeperController';
  export {RNG} from './src/utils/RNG';
  export {prepareFoundryPanels,foundryPanels} from './src/world/FoundryPanels';
  export {Scene,Vector3} from 'three';`, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node',
  define: { 'import.meta.env.BASE_URL': '"/"' },
  plugins: [{ name: 'no-network', setup(builder) {
    builder.onLoad({ filter: /[\\/]AssetLoading\.ts$/ }, () => ({ contents: `import {Texture} from 'three'; export const trackedTexture = () => new Texture();`, loader: 'ts', resolveDir: root }));
  } }],
});
const previousDocument = globalThis.document;
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ clearRect() {}, fillRect() {}, fillText() {} }) }) };
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

test('chapter increases apply once and floor 10 belongs to the second bracket', () => {
  for (const [floor, factor] of [[1,1.05],[5,1.05],[6,1.10],[10,1.10],[11,1.15],[15,1.15],[16,1.20],[20,1.20],[21,1.25],[25,1.25]])
    assert.equal(api.chapterPressure(floor), factor);
  assert.ok(Math.abs(api.monsterDifficultyMultiplier(1,'health') * api.monsterDifficultyMultiplier(1,'attack') - 1.05 * 1.2 * 1.2) < 1e-10);
});

test('all new chapter combat rooms spawn their actual new content; optional trials wait for interaction', () => {
  for (const floor of [1,2,3,4,5,11,12,13,14,15]) {
    const data = api.generateFloor(42, floor, 5);
    const director = new api.EncounterDirector(data);
    for (const room of data.rooms.filter(r => ['battle','elite','exit'].includes(r.kind))) {
      const monsters = api.MonsterSpawner.spawnEncounter(data, room, {x:data.spawn.x+.5,z:data.spawn.z+.5}, new api.RNG(floor));
      assert.ok(monsters.length > 0 && monsters.length <= 10);
      assert.ok(monsters.every(m => Number.isFinite(m.health) && m.health > 0));
      if (floor >= 11) assert.ok(monsters.every(m => ['sanctum_mourner','bell_acolyte','epitaph_attendant','returning_blade','coffin_bearer','name_digger','bellkeeper'].includes(m.def.id)));
      if (floor % 5 === 0 && room.kind === 'exit') {
        assert.equal(monsters.length, 1);
        assert.equal(monsters[0].def.id, floor === 5 ? 'oath_gatekeeper' : 'bellkeeper');
      }
      if (api.isOptionalTrial(room.template)) {
        const center = room.center ?? { x:room.x+room.width/2, z:room.z+room.depth/2 };
        assert.equal(director.enter(center.x, center.z), null);
        assert.equal(director.enter(center.x, center.z, true)?.id, room.id);
        assert.equal(director.complete(new Set()).length, 1);
        assert.equal(director.complete(new Set()).length, 0);
      }
    }
  }
});

test('ritual is delayed, used once, and stays consumed after restore', () => {
  const data = api.generateFloor(42,12,5), scene = new api.Scene();
  const room = data.rooms.find(r => r.template === 'sanctum-ritual');
  const point = api.sanctumRitualPositions(room)[0];
  const position = new api.Vector3(point.x,0,point.z), ritual = new api.ChapterRituals(scene);
  ritual.setup(data); let hits = 0;
  assert.equal(ritual.activate(position,[]), false);
  assert.equal(ritual.activate(position,[room.id]), true);
  ritual.update(.4,[room.id],()=>hits++); assert.equal(hits,0);
  ritual.update(.5,[room.id],()=>hits++); assert.equal(hits,1);
  assert.equal(ritual.activate(position,[room.id]), false);
  const saved = ritual.snapshot(); ritual.setup(data,saved);
  assert.equal(ritual.activate(position,[room.id]), false);
  ritual.clear(); assert.equal(scene.children.length,0);
});

test('version five retains the foundry breakable panels and its own boss', () => {
  const yard = api.generateFloor(42,7,5);
  api.prepareFoundryPanels(yard);
  assert.equal(api.foundryPanels(yard).length,2);
  const data = api.generateFloor(42,10,5), room = data.rooms.find(r => r.kind === 'exit');
  const wave = api.MonsterSpawner.spawnEncounter(data,room,{x:data.spawn.x+.5,z:data.spawn.z+.5},new api.RNG(10));
  assert.equal(wave[0].def.id,'furnace_regent');
});

test('all depths get both +20% stats and saved health only scales once', () => {
  assert.equal(api.GLOBAL_MONSTER_STAT_MULTIPLIER,1.2);
  for (const floor of [1,5,6,10,11,15,16,20,21,25]) for (const tier of ['normal','boss']) {
    const t = Math.max(0,Math.min(1,(floor-5)/20)), ramp = t*t*(3-2*t);
    for (const [stat,growth,late] of [['health',.18,tier==='boss'?.25:.20],['attack',.12,tier==='boss'?.08:.06]]) {
      const before = (1+growth*(floor-1))*(1+late*ramp)*Math.sqrt(api.chapterPressure(floor));
      assert.ok(Math.abs(api.monsterDifficultyMultiplier(floor,stat,tier)/before-1.2)<1e-10);
    }
  }
  const data=api.generateFloor(42,2,5);
  const saved={defId:'zombie',x:data.spawn.x,z:data.spawn.z,health:40,maxHealth:100,elite:false,eliteModifiers:[]};
  const first=api.MonsterSpawner.spawnSaved(saved,data);
  assert.equal(first.maxHealth,120);assert.equal(first.health,48);
  const again=api.MonsterSpawner.spawnSaved({...saved,health:first.health,maxHealth:first.maxHealth,difficultyStatMultiplier:1.2},data);
  assert.equal(again.maxHealth,120);assert.equal(again.health,48);
});

test('floor six retains one teaching enemy and fills other rooms with 5–7 foes', () => {
  const data=api.generateFloor(42,6,5);
  for (const room of data.rooms.filter(r=>['battle','elite','exit'].includes(r.kind))) {
    const wave=api.MonsterSpawner.spawnEncounter(data,room,{x:data.spawn.x+.5,z:data.spawn.z+.5},new api.RNG(6));
    if(room.id==='room-0') assert.equal(wave.length,1);
    else assert.ok(wave.length>=5 && wave.length<=7);
  }
});

test('monster quality improves and bosses actually award both quality floors', () => {
  const chance=weights=>weights.filter(e=>['rare','epic','legendary'].includes(e.rarity)).reduce((s,e)=>s+e.weight,0)/weights.reduce((s,e)=>s+e.weight,0);
  for(const floor of [1,5,10,15,25]) {
    assert.ok(chance(api.monsterLootWeights(floor,0))>chance(api.rarityWeightsForFloor(floor,0)));
    assert.ok(api.monsterItemChance(floor)>.25+floor*.01);
  }
  for(const floor of [5,10,15,20,25]) {
    const drops=api.LootSystem.rollLoot({},floor,0,true,floor,undefined,2,undefined,new api.RNG(123));
    const items=drops.filter(d=>d.kind==='item').map(d=>d.item);
    assert.equal(items.length,2);
    assert.ok(items.every(i=>api.RARITY_ORDER.indexOf(i.rarity)>=2));
    if(floor>=10) assert.ok(api.RARITY_ORDER.indexOf(items[1].rarity)>=3);
  }
});

test('fifth boss has frequent attacks with a visible warning before each strike', () => {
  const floor=api.generateFloor(42,5,5),room=floor.rooms.find(r=>r.kind==='exit');
  const boss=api.MonsterSpawner.spawnEncounter(floor,room,{x:floor.spawn.x+.5,z:floor.spawn.z+.5},new api.RNG(5))[0];
  boss.position.set(room.center.x,0,room.center.z);
  const player={alive:true,position:boss.position.clone().add(new api.Vector3(2,0,0))};
  const controller=new api.OathGatekeeperController(new api.Scene());
  const hits=[];let time=0;
  const host={damagePlayer:()=>hits.push(time),damageMelee:()=>hits.push(time),summonMinion(){},showMessage(){}};
  for(;time<10;time+=.05)controller.update(.05,boss,player,floor,host,100);
  assert.ok(hits.length>=4);assert.ok(hits[0]>=1.5);
  assert.ok(hits.slice(1).every((value,i)=>value-hits[i]>=1.6));
  controller.clear();
});

test.after(() => { globalThis.document = previousDocument; });
