import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Reuse Vite's existing TS compiler; no browser, build output or extra dependency.
const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const result = buildSync({ stdin: {
  contents: `export {generateFloor,isWalkable} from './src/world/FloorGenerator';
    export {EncounterDirector} from './src/core/EncounterDirector';
    export {BuildSystem} from './src/items/BuildSystem';
    export {EquipmentManager} from './src/items/EquipmentManager';
    export {migrateSave} from './src/core/SaveMigrations';
    export {directionToPlayer} from './src/world/Navigation';`,
  resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts',
}, bundle: true, write: false, format: 'esm', platform: 'node' });
const { generateFloor,isWalkable,EncounterDirector,BuildSystem,EquipmentManager,migrateSave,directionToPlayer } =
  await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

test('800 maps remain bounded, connected and have a short route with optional loops', () => {
  for (let seed=0;seed<200;seed++) for (const depth of [1,5,25,100]) {
    const floor=generateFloor(seed,depth);
    assert.equal(floor.size,40);
    assert.equal(floor.rooms.length,9);
    assert.equal(floor.rooms.filter(room=>room.required).length,2);
    assert.ok(floor.connections.length >= floor.rooms.length);
    const distances=new Int16Array(1600).fill(-1), queue=[floor.spawn.z*40+floor.spawn.x];
    distances[queue[0]]=0;
    for (let head=0;head<queue.length;head++) {
      const index=queue[head],x=index%40,z=Math.floor(index/40);
      for (const [nx,nz] of [[x-1,z],[x+1,z],[x,z-1],[x,z+1]]) {
        const next=nz*40+nx;
        if (isWalkable(floor,nx,nz)&&distances[next]<0) { distances[next]=distances[index]+1;queue.push(next); }
      }
    }
    assert.ok(distances[floor.portal.z*40+floor.portal.x] <= 30);
    for (let z=0;z<40;z++) for(let x=0;x<40;x++) if(isWalkable(floor,x,z)) assert.ok(distances[z*40+x]>=0);
  }
});

test('seeded rooms reproduce the same map, themes do not enlarge it', () => {
  assert.deepEqual(generateFloor(42,12),generateFloor(42,12));
  assert.notDeepEqual(generateFloor(42,12).grid,generateFloor(43,12).grid);
});

test('unvisited and optional rooms cannot block the two main objectives', () => {
  const floor=generateFloor(99,1), director=new EncounterDirector(floor);
  assert.equal(director.portalReady,false);
  assert.deepEqual(director.complete(new Set()),[]);
  for(const room of floor.rooms.filter(room=>room.required)) {
    director.enter(room.x+5,room.z+5);
    assert.deepEqual(director.complete(new Set([room.id])),[]);
    assert.equal(director.complete(new Set()).length,1);
    assert.deepEqual(director.complete(new Set()),[]);
  }
  assert.equal(director.portalReady,true);
  assert.equal(director.state.visited.length,2);
  const restored=new EncounterDirector(floor,JSON.parse(JSON.stringify(director.state)));
  assert.equal(restored.portalReady,true);
});

test('build choices are once per floor, capped, persistent and change melee cadence', () => {
  const builds=new BuildSystem();
  assert.equal(builds.choose('vanguard',1),true);
  assert.equal(builds.choose('arcanist',1),false);
  assert.equal(builds.meleeEcho(false),false);
  assert.equal(builds.meleeEcho(true),false);
  assert.equal(builds.meleeEcho(true),false);
  assert.equal(builds.meleeEcho(true),true);
  builds.choose('vanguard',2);builds.choose('vanguard',3);
  assert.equal(builds.choose('vanguard',4),false);
  const restored=new BuildSystem();restored.restore(builds.ranks,builds.choiceFloor);
  assert.equal(restored.rank('vanguard'),3);
  assert.equal(restored.canChoose(3),false);
});

test('equipment stats cache invalidates after equip, unequip, load and attribute allocation', () => {
  const equipment=new EquipmentManager(), extra={strength:2};
  const first=equipment.getDerivedStats(extra);
  assert.equal(equipment.getDerivedStats(extra),first);
  const item={slot:'weapon',baseStats:{attack:10},affixes:[{special:'chainLightning',values:{}}]};
  equipment.equip(item);
  assert.ok(equipment.getDerivedStats(extra).attack>first.attack);
  assert.equal(equipment.hasSpecial('chainLightning'),true);
  equipment.unequip('weapon');
  assert.equal(equipment.getDerivedStats(extra).attack,first.attack);
  assert.equal(equipment.hasSpecial('chainLightning'),false);
  assert.ok(equipment.getDerivedStats({strength:4}).attack>first.attack);
  equipment.equipment={weapon:item};assert.equal(equipment.hasSpecial('chainLightning'),true);
});

test('legacy saves preserve ownership and reset only incompatible floor data', () => {
  const old={version:1,inventory:[{id:'kept'}],equipment:{weapon:{id:'kept'}},gold:90,floor:20,monsters:[{}]};
  const migrated=migrateSave(old);
  assert.equal(migrated.version,2);assert.equal(migrated.gold,90);assert.equal(migrated.floor,20);
  assert.deepEqual(migrated.inventory,old.inventory);assert.equal(migrated.monsters,undefined);
  assert.equal(migrateSave({version:99}),null);
});

test('navigation follows connected corridors instead of walking into walls', () => {
  const floor=generateFloor(13,5), start=floor.spawn;
  const direction=directionToPlayer(floor,start.x+.5,start.z+.5,floor.portal.x+.5,floor.portal.z+.5);
  assert.ok(direction);
  assert.ok(isWalkable(floor,Math.floor(start.x+.5+direction.x),Math.floor(start.z+.5+direction.z)));
});
