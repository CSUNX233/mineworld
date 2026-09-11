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
    export {directionToPlayer} from './src/world/Navigation';
    export {ShopSystem,SHOP_SLOTS} from './src/items/ShopSystem';
    export {CraftingSystem} from './src/items/CraftingSystem';
    export {Inventory} from './src/items/Inventory';
    export {RNG} from './src/utils/RNG';`,
  resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts',
}, bundle: true, write: false, format: 'esm', platform: 'node' });
const { generateFloor,isWalkable,EncounterDirector,BuildSystem,EquipmentManager,migrateSave,directionToPlayer,ShopSystem,SHOP_SLOTS,CraftingSystem,Inventory,RNG } =
  await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

test('800 maps remain bounded, connected and have a short route with optional loops', () => {
  for (let seed=0;seed<200;seed++) for (const depth of [1,5,25,100]) {
    const floor=generateFloor(seed,depth);
    assert.ok(floor.size >= 48 && floor.size <= 64);
    assert.ok(floor.rooms.length >= 6 && floor.rooms.length <= 8);
    assert.equal(floor.rooms.filter(room=>room.required).length,2);
    assert.ok(floor.connections.length >= floor.rooms.length);
    const distances=new Int16Array(floor.size*floor.size).fill(-1), queue=[floor.spawn.z*floor.size+floor.spawn.x];
    distances[queue[0]]=0;
    for (let head=0;head<queue.length;head++) {
      const index=queue[head],x=index%floor.size,z=Math.floor(index/floor.size);
      for (const [nx,nz] of [[x-1,z],[x+1,z],[x,z-1],[x,z+1]]) {
        const next=nz*floor.size+nx;
        if (isWalkable(floor,nx,nz)&&distances[next]<0) { distances[next]=distances[index]+1;queue.push(next); }
      }
    }
    assert.ok(distances[floor.portal.z*floor.size+floor.portal.x] <= floor.size+12);
    for (let z=0;z<floor.size;z++) for(let x=0;x<floor.size;x++) if(isWalkable(floor,x,z)) assert.ok(distances[z*floor.size+x]>=0);
  }
});

test('legacy generation remains fixed at 40 tiles', () => {
  assert.equal(generateFloor(42,12,1).size,40);
});

test('seeded rooms reproduce the same map, themes do not enlarge it', () => {
  assert.deepEqual(generateFloor(42,12),generateFloor(42,12));
  assert.notDeepEqual(generateFloor(42,12).grid,generateFloor(43,12).grid);
});

test('merchant tiles are walkable, optional, deterministic and guaranteed every three floors', () => {
  let optional = 0, absent = 0;
  for (let seed = 0; seed < 100; seed++) for (let floor = 1; floor <= 12; floor++) {
    const map = generateFloor(seed, floor);
    if (floor % 3 === 0) assert.ok(map.merchant);
    else if (map.merchant) optional++; else absent++;
    if (!map.merchant) continue;
    const {x,z} = map.merchant;
    assert.equal(isWalkable(map,x,z),true);
    assert.deepEqual(map.merchant,generateFloor(seed,floor).merchant);
    assert.ok(Math.hypot(x-map.portal.x,z-map.portal.z)>4);
    assert.ok(map.chests.every(chest=>Math.hypot(x-chest.x,z-chest.z)>2));
  }
  assert.ok(optional>0 && absent>0);
});

test('merchant stock cannot be immediately recycled for profit and commissions obey slot and rarity limits', () => {
  for (const floor of [1,3,5,10,25,100]) {
    const stock = ShopSystem.generateStock(floor,1,4,new RNG(41));
    assert.equal(stock.length,4);
    assert.ok(stock.every(entry=>entry.price>ShopSystem.recoveryValue(entry.item,floor)));
    assert.ok(stock.every(entry=>entry.item.rarity!=='legendary'));
    assert.ok(ShopSystem.refreshPrice(floor,1)>ShopSystem.refreshPrice(floor,0));
    for (const {slot} of SHOP_SLOTS) for (let seed=0;seed<40;seed++) {
      const item=ShopSystem.gamble(floor,1,slot,new RNG(seed));
      assert.equal(item.slot,slot);
      assert.ok((floor<5 ? ['magic','rare'] : ['magic','rare','epic']).includes(item.rarity));
      assert.equal(item.requiredLevel,1);
      assert.ok(ShopSystem.gamblePrice(floor,slot)>0);
    }
  }
  assert.equal(ShopSystem.floorIncome(1),66);
  assert.equal(ShopSystem.floorIncome(3),122);
});

test('bulk salvage sums the same materials as individual salvage without mutating gear', () => {
  const items=[{slot:'weapon',rarity:'common',itemLevel:3},{slot:'helmet',rarity:'magic',itemLevel:6},{slot:'ring',rarity:'rare',itemLevel:8}];
  const before=JSON.stringify(items), expected=new Map();
  for (const item of items) for (const entry of CraftingSystem.salvageYield(item)) expected.set(entry.materialId,(expected.get(entry.materialId)||0)+entry.amount);
  assert.deepEqual(CraftingSystem.bulkSalvageYield(items),[...expected].map(([materialId,amount])=>({materialId,amount})));
  assert.equal(JSON.stringify(items),before);
  assert.deepEqual(CraftingSystem.bulkSalvageYield([]),[]);
});

test('organizing inventory preserves item identity and orders quality, slot then level', () => {
  const inventory=new Inventory();
  const items=[{name:'A',rarity:'common',slot:'weapon',itemLevel:8},{name:'B',rarity:'rare',slot:'helmet',itemLevel:4},{name:'C',rarity:'rare',slot:'weapon',itemLevel:1},{name:'D',rarity:'rare',slot:'weapon',itemLevel:5}];
  inventory.items=[...items]; inventory.sort();
  assert.deepEqual(inventory.items.map(item=>item.name),['D','C','B','A']);
  assert.ok(items.every(item=>inventory.items.includes(item)));
  const sorted=[...inventory.items];inventory.sort();assert.deepEqual(inventory.items,sorted);
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
