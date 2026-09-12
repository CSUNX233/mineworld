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
  export {chapterPressure,monsterDifficultyMultiplier} from './src/data/DifficultyBalance';
  export {sanctumRitualPositions} from './src/data/SanctumChapter';
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
  assert.ok(Math.abs(api.monsterDifficultyMultiplier(1,'health') * api.monsterDifficultyMultiplier(1,'attack') - 1.05) < 1e-10);
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

test.after(() => { globalThis.document = previousDocument; });
