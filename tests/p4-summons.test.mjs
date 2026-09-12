import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const compiled = buildSync({
  stdin: {
    contents: `
      export {SummonSystem,validateSnapshot} from './src/summons/index';
      export {setEncounterBarrierRooms,clearEncounterBarriers} from './src/world/EncounterBarriers';
      export {Vector3,Scene} from 'three';`,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const {
  SummonSystem, validateSnapshot, setEncounterBarrierRooms, clearEncounterBarriers, Vector3, Scene,
} = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

function floorFixture(room = null) {
  const size = 12;
  const grid = Array.from({ length: size }, (_, z) => Array.from({ length: size }, (_, x) =>
    x === 0 || z === 0 || x === size - 1 || z === size - 1 ? 2 : 1));
  return {
    size, grid, floor: 4, seed: 81, rooms: room ? [room] : [],
    spawn: { x: 3, z: 3 }, portal: { x: 10, z: 10 }, chests: [],
    theme: { id: 'test', name: 'test', wallType: 'test', floorType: 'test', accentType: 'test' },
  };
}

const config = (capacity = 4) => ({ attack: 40, maxHealth: 120, capacity, direction: 'legion', guardianShield: 12 });
const player = () => ({ position: new Vector3(3.5, 0, 3.5), alive: true, health: 100, maxHealth: 100 });
const monster = (id, x, z) => ({
  id, position: new Vector3(x, 0, z), dead: false,
  def: { id: `test-${id}`, attack: 18, attackCooldown: 1, behavior: 'melee' },
});
const host = () => {
  const damage = [];
  return { damage, shield() {}, damageMonster: null,
    api: { damage: (target, amount, source) => damage.push({ target, amount, source }), shield() {} } };
};

test('removing talent clears its squad while equipment summons keep their own unlock source', () => {
  const summons = new SummonSystem(new Scene()), floor = floorFixture(), owner = player();
  assert.equal(summons.raise(floor, owner, config()).ok, true);
  summons.reconcileSources(false, true);
  assert.equal(summons.count, 0);
  assert.equal(summons.raiseTemporary(floor, owner, config(), { source: 'equipment-kill' }).ok, true);
  summons.reconcileSources(false, true);
  assert.equal(summons.count, 1);
  const snapshot = summons.snapshot();
  assert.equal(summons.restore(snapshot, floor, owner, config()), true);
  summons.reconcileSources(false, false);
  assert.equal(summons.count, 0);
});

test('raise starts without kills and capacity failure never removes the existing formation', () => {
  const scene = new Scene(), summons = new SummonSystem(scene), floor = floorFixture(), owner = player();
  assert.deepEqual(summons.raise(floor, owner, config()), { ok: true, message: '已补充 3 个召唤物，容量 4/4' });
  assert.equal(summons.count, 3);
  assert.equal(summons.capacityUsed, 4);
  const ids = summons.snapshot().units.map(unit => unit.id);
  assert.equal(summons.raiseTemporary(floor, owner, config(), { role: 'warrior', source: 'kill' }).ok, false);
  assert.deepEqual(summons.snapshot().units.map(unit => unit.id), ids);
  summons.clear();
});

test('recall changes movement intent without healing or refreshing cooldowns', () => {
  const summons = new SummonSystem(new Scene()), floor = floorFixture(), owner = player(), events = host();
  summons.raise(floor, owner, config());
  const beforeHit = summons.snapshot().units.find(unit => unit.role === 'warrior');
  const enemy = monster(10, beforeHit.position.x, beforeHit.position.z);
  summons.update(0.1, floor, owner, [enemy], config(), events.api);
  const hurt = summons.snapshot().units.find(unit => unit.id === beforeHit.id);
  assert.ok(hurt.health < hurt.maxHealth);
  assert.ok(hurt.cooldowns.attack > 0);
  summons.recall();
  summons.update(0.2, floor, owner, [], config(), events.api);
  const recalled = summons.snapshot().units.find(unit => unit.id === beforeHit.id);
  assert.equal(recalled.health, hurt.health);
  assert.ok(recalled.cooldowns.attack < hurt.cooldowns.attack);
  assert.equal(summons.status.mode, 'recall');
  summons.clear();
});

test('restore preserves health, life and cooldowns but discards unstable monster ids', () => {
  const floor = floorFixture(), owner = player(), first = new SummonSystem(new Scene()), events = host();
  first.raise(floor, owner, config());
  const warrior = first.snapshot().units.find(unit => unit.role === 'warrior');
  const oldTarget = monster(42, warrior.position.x, warrior.position.z);
  first.focus(oldTarget);
  first.update(0.25, floor, owner, [oldTarget], config(), events.api);
  const saved = first.snapshot();
  assert.equal(saved.focusTargetId, null);
  assert.equal(saved.mark, null);
  assert.equal(saved.mode, 'autonomous');
  assert.equal(validateSnapshot(saved), true);
  // Simulate an earlier payload whose process-local id now belongs to another monster.
  saved.mode = 'focus';
  saved.focusTargetId = 42;
  saved.mark = { targetId: 42, remaining: 2 };
  const restored = new SummonSystem(new Scene());
  assert.equal(restored.restore(saved, floor, owner, config()), true);
  assert.equal(restored.status.mode, 'autonomous');
  assert.equal(restored.status.focusTargetId, null);
  const after = restored.snapshot();
  for (const unit of saved.units) {
    const loaded = after.units.find(candidate => candidate.id === unit.id);
    assert.equal(loaded.health, unit.health);
    assert.equal(loaded.life, unit.life);
    assert.deepEqual(loaded.cooldowns, unit.cooldowns);
  }
  assert.equal(after.raiseCooldown, saved.raiseCooldown);
  assert.equal(after.coordinationCooldown, saved.coordinationCooldown);
  first.clear();
  restored.clear();
});

test('active encounter barriers block archer LOS and movement until opened', () => {
  const room = { id: 'locked', kind: 'battle', x: 2, z: 2, width: 4, depth: 4 };
  const floor = floorFixture(room), owner = player(), summons = new SummonSystem(new Scene()), events = host();
  setEncounterBarrierRooms(floor, ['locked']);
  assert.equal(summons.raiseTemporary(floor, owner, config(1), {
    role: 'archer', position: new Vector3(3.5, 0, 3.5), source: 'test', life: 20,
  }).ok, true);
  const enemy = monster(90, 8.5, 3.5);
  for (let index = 0; index < 30; index++) summons.update(0.1, floor, owner, [enemy], config(1), events.api);
  assert.equal(events.damage.length, 0);
  assert.ok(summons.snapshot().units[0].position.x < 6);
  clearEncounterBarriers(floor);
  summons.update(0.1, floor, owner, [enemy], config(1), events.api);
  assert.equal(events.damage.length, 1);
  summons.clear();
});

test('closing a room regroups outside and overlapping allies without refreshing their resources', () => {
  for (const x of [1.5, 2]) {
    const room = { id: 'locked', kind: 'battle', x: 2, z: 2, width: 7, depth: 7 };
    const floor = floorFixture(room), owner = player(), summons = new SummonSystem(new Scene());
    summons.raiseTemporary(floor, owner, config(), { role: 'warrior', position: new Vector3(x, 0, 3.5), life: 20 });
    const saved = summons.snapshot();
    saved.units[0].health = 10;
    saved.units[0].cooldowns.attack = 1;
    summons.restore(saved, floor, owner, config());
    setEncounterBarrierRooms(floor, ['locked']);
    summons.update(0.1, floor, owner, [], config(), host().api);
    const unit = summons.snapshot().units[0];
    assert.ok(unit.position.x > 2.4 && unit.position.x < 8.6);
    assert.ok(unit.position.z > 2.4 && unit.position.z < 8.6);
    assert.equal(unit.health, 10);
    assert.equal(unit.life, 19.9);
    assert.equal(unit.cooldowns.attack, 0.9);
    assert.equal(unit.id, saved.units[0].id);
    summons.clear();
  }
});

test('archer retreats and fires on the same update without shooting through walls', () => {
  const floor = floorFixture(), owner = player(), summons = new SummonSystem(new Scene()), events = host();
  summons.raiseTemporary(floor, owner, config(), { role: 'archer', position: new Vector3(4.5, 0, 4.5), life: 20 });
  const enemy = monster(77, 6.5, 4.5);
  summons.update(0.1, floor, owner, [enemy], config(), events.api);
  assert.ok(summons.snapshot().units[0].position.x < 4.5);
  assert.equal(events.damage.length, 1);
  summons.clear();
});
