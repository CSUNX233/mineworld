import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const compiled = buildSync({
  stdin: {
    contents: `
      export { P4SkillRuntime } from './src/combat/P4SkillRuntime';
      export { deriveP4Modifiers } from './src/combat/P4Build';
      export { createRunTalents, canUnlockTalent, unlockRunTalent } from './src/progression/RunTalents';
      export { Vector3 } from 'three';
    `,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`;
const { P4SkillRuntime, deriveP4Modifiers, createRunTalents, canUnlockTalent, unlockRunTalent, Vector3 } =
  await import(moduleUrl);

const state = (unlocked) => ({ version: 1, unlocked, resetsUsed: 0 });

function monster(id, x, z) {
  return { id, dead: false, position: new Vector3(x, 0, z) };
}

function openFloor(size = 10) {
  const grid = Array.from({ length: size }, (_, z) => Array.from({ length: size }, (_, x) =>
    x === 0 || z === 0 || x === size - 1 || z === size - 1 ? 2 : 1));
  return { size, grid, rooms: [], floor: 1 };
}

function fixture(unlocked, options = {}) {
  let attack = options.attack ?? 10;
  const damage = [];
  const ignite = [];
  const mana = [];
  const shield = [];
  const events = [];
  const host = {
    modifiers: () => deriveP4Modifiers(state(unlocked)),
    floor: () => options.floor ?? null,
    playerPosition: () => options.playerPosition ?? new Vector3(2.5, 0, 2.5),
    aimDirection: () => options.aimDirection ?? new Vector3(1, 0, 0),
    attack: () => attack,
    maxHealth: () => 100,
    monsters: () => options.monsters ?? [],
    damage: (...args) => damage.push(args),
    ignite: (...args) => ignite.push(args),
    hasBurn: () => false,
    consumeBurn: () => 0,
    shield: (amount) => shield.push(amount),
    mana: (amount) => mana.push(amount),
    raiseCompany: () => true,
    sacrificeSummon: () => options.sacrifice ?? null,
    emit: (event) => events.push(event),
  };
  return {
    runtime: new P4SkillRuntime(host),
    damage,
    ignite,
    mana,
    shield,
    events,
    setAttack: (value) => { attack = value; },
  };
}

test('P4 branches exclude their opposite and ember blade requires both roots', () => {
  let talents = createRunTalents();
  talents = unlockRunTalent(talents, 'melee_seed', 99);
  talents = unlockRunTalent(talents, 'melee_cleave', 99);
  assert.equal(canUnlockTalent(talents, 'melee_guard', 99), false);

  let summons = createRunTalents();
  summons = unlockRunTalent(summons, 'summon_seed', 99);
  summons = unlockRunTalent(summons, 'summon_elite', 99);
  assert.equal(canUnlockTalent(summons, 'summon_legion', 99), false);

  let hybrid = createRunTalents();
  hybrid = unlockRunTalent(hybrid, 'melee_seed', 99);
  assert.equal(canUnlockTalent(hybrid, 'ember_blade', 99), false);
  hybrid = unlockRunTalent(hybrid, 'fire_seed', 99);
  assert.equal(canUnlockTalent(hybrid, 'ember_blade', 99), true);
});

test('seismic slam consumes at most three basic-hit charges', () => {
  const target = monster(1, 4, 2.5);
  const { runtime, damage } = fixture(['melee_seed'], { monsters: [target] });
  runtime.basicHit();
  runtime.basicHit();
  runtime.basicHit();
  runtime.basicHit();
  assert.equal(runtime.status.meleeCharges, 3);
  const result = runtime.cast('seismic_slam');
  assert.equal(result.success, true);
  assert.equal(result.chargesConsumed, 3);
  assert.equal(runtime.status.meleeCharges, 0);
  assert.equal(damage.length, 1);
});

test('guard counter reduces and counters exactly one hit', () => {
  const source = monster(2, 3.5, 2.5);
  const { runtime, damage, mana, shield } = fixture(['melee_seed', 'melee_guard']);
  assert.equal(runtime.cast('guard_counter').success, true);
  assert.ok(Math.abs(runtime.interceptDamage(100, source) - 30) < 1e-9);
  assert.equal(runtime.interceptDamage(100, source), 100);
  assert.equal(damage.length, 1);
  assert.deepEqual(mana, [5]);
  assert.deepEqual(shield, [10]);
});

test('flame rift ticks six times with live attack and does not cross a wall', () => {
  const floor = openFloor();
  floor.grid[2][4] = 2;
  const visible = monster(3, 3.5, 2.5);
  const blocked = monster(4, 5.5, 2.5);
  const setup = fixture(['fire_seed'], { floor, monsters: [visible, blocked] });
  assert.equal(setup.runtime.cast('flame_rift').success, true);
  const start = setup.events.find((event) => event.kind === 'flame-rift-start');
  assert.deepEqual(start.position, { x: 2.5, y: 0, z: 2.5 });

  setup.runtime.update(0.5);
  setup.setAttack(20);
  setup.runtime.update(2.5);
  const visibleHits = setup.damage.filter(([target]) => target === visible);
  const blockedHits = setup.damage.filter(([target]) => target === blocked);
  assert.equal(visibleHits.length, 6);
  assert.equal(blockedHits.length, 0);
  assert.equal(visibleHits[0][1], 3.2);
  assert.ok(visibleHits.slice(1).every(([, amount]) => amount === 6.4));
  assert.equal(setup.ignite.length, 6);
  assert.equal(setup.runtime.status.activeFlameRifts, 0);
});

test('soul burst fails without sacrificing a summon', () => {
  const { runtime, damage, shield } = fixture(['summon_seed']);
  assert.deepEqual(runtime.cast('soul_burst'), {
    success: false,
    reason: 'no-summon',
    targets: 0,
    chargesConsumed: 0,
  });
  assert.equal(damage.length, 0);
  assert.equal(shield.length, 0);
});
