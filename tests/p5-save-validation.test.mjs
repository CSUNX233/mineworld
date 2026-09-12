import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const built = buildSync({ stdin: {
  contents: `export {validateSaveEnvelope,validateLegacySaveData} from './src/core/SaveValidation';
    export {RunManager} from './src/core/RunManager'; export {SetRuntime} from './src/items/SetRuntime';`,
  resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts',
}, bundle: true, write: false, format: 'esm', platform: 'node' });
const { validateSaveEnvelope, validateLegacySaveData, RunManager, SetRuntime } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

function fixture(p5 = true) {
  const envelope = RunManager.startRun(RunManager.createEnvelope('p5-validation'), 'run', 31, 'vanguard', 1);
  const item = { id: 'legacy-sword', name: '长剑', slot: 'weapon', rarity: 'rare', baseStats: {}, affixes: [], requiredLevel: 1, icon: 'sword', itemLevel: 1, sellPrice: 1 };
  envelope.activeRun.snapshot = {
    version: 2, floor: 1, seed: 31,
    player: { level: 1, xp: 0, xpToNext: 100, attributePoints: 0, health: 100, mana: 30, stats: {}, position: { x: 1, y: 0, z: 1 } },
    gold: 100, materials: 0, kills: 0,
    inventory: [item], equipment: { weapon: { ...item } }, shopStock: [{ item: { ...item }, price: 20 }],
    runtime: { elapsed: 0, shield: 0, invulnerable: 0, attackTimer: 0, comboCount: 0, comboTimer: 0, lowHealthShieldCooldown: 0, skillCooldowns: {} },
  };
  if (p5) {
    const run = envelope.activeRun, save = run.snapshot;
    run.equipmentRulesVersion = save.equipmentRulesVersion = 2;
    run.setPreference = save.setPreference = 'defense';
    save.craftingSequence = 10;
    const runtime = new SetRuntime({ attackRate: () => 100, maxHealth: () => 100, maxMana: () => 30 });
    runtime.update(.1, { warlord: 4 }, 0, true);
    save.runtime.setState = runtime.snapshot();
    for (const item of [save.inventory[0], save.equipment.weapon, save.shopStock[0].item]) Object.assign(item, { contentId: 'weapon_sword', equipmentRulesVersion: 2, reforgeCount: 3 });
  } else delete envelope.activeRun.equipmentRulesVersion;
  return envelope;
}

test('legal summon talent saves while screenshot-only overspending is diagnosed without mutating data', () => {
  const envelope = fixture();
  envelope.activeRun.snapshot.runTalents = {version:1,unlocked:['melee_seed','summon_seed'],resetsUsed:0};
  const before = JSON.stringify(envelope);
  const invalid = validateSaveEnvelope(envelope);
  assert.equal(invalid.ok,false);
  assert.match(invalid.error,/局内天赋已用/);
  assert.equal(JSON.stringify(envelope),before);
  envelope.activeRun.snapshot.runTalents.unlocked=['summon_seed'];
  assert.equal(validateSaveEnvelope(envelope).ok,true);
});

test('missing P5 fields preserve old saves and current runtime snapshots remain valid without mutation', () => {
  const legacy = fixture(false);
  assert.equal(validateSaveEnvelope(legacy).ok, true);
  assert.equal(validateLegacySaveData({ version: 1, floor: 1, seed: 31, player: { level: 1 }, inventory: [{}], equipment: { weapon: null } }).ok, true);
  const current = fixture();
  const before = JSON.stringify(current);
  assert.equal(validateSaveEnvelope(current).ok, true);
  assert.equal(JSON.stringify(current), before);
});

test('equipment versions, crafting sequence and mechanism preference reject invalid values wherever saved', () => {
  for (const location of ['run', 'snapshot']) {
    for (const [field, values] of [
      ['equipmentRulesVersion', [0, 3, '2', null]],
      ['setPreference', ['warlord', '', 'unknown', null]],
      ...(location === 'snapshot' ? [['craftingSequence', [-1, .5, Infinity, Number.MAX_SAFE_INTEGER + 1, '0']]] : []),
    ]) for (const value of values) {
      const envelope = fixture();
      (location === 'run' ? envelope.activeRun : envelope.activeRun.snapshot)[field] = value;
      assert.equal(validateSaveEnvelope(envelope).ok, false, `${location}.${field} accepted ${String(value)}`);
      if (location === 'snapshot') assert.equal(validateLegacySaveData(envelope.activeRun.snapshot).ok, false);
    }
  }
  for (const value of [true, false]) {
    const envelope = fixture();
    envelope.activeRun.p5StarterGranted = value;
    assert.equal(validateSaveEnvelope(envelope).ok, true);
  }
  for (const value of [0, 1, 'true', null]) {
    const envelope = fixture();
    envelope.activeRun.p5StarterGranted = value;
    assert.equal(validateSaveEnvelope(envelope).ok, false);
  }
});

test('item identity and attempt counts are checked in inventory, equipped gear and merchant stock', () => {
  for (const location of ['inventory', 'equipment', 'shop']) for (const [field, values] of [
    ['contentId', ['', 4, null]],
    ['equipmentRulesVersion', [3, '2', null]],
    ['reforgeCount', [-1, .5, 4, Infinity, '0', null]],
  ]) for (const value of values) {
    const envelope = fixture(), save = envelope.activeRun.snapshot;
    const item = location === 'inventory' ? save.inventory[0] : location === 'equipment' ? save.equipment.weapon : save.shopStock[0].item;
    item[field] = value;
    assert.equal(validateSaveEnvelope(envelope).ok, false, `${location}.${field} accepted ${String(value)}`);
  }
  const save = fixture().activeRun.snapshot;
  save.inventory[0].reforgeCount = 0;
  assert.equal(validateLegacySaveData(save).ok, true);
});

test('malformed set snapshots are rejected instead of loading a reset cooldown or refunded budget', () => {
  const corruptions = [
    state => { state.version = 2; }, state => { state.time = -1; }, state => { state.time = NaN; },
    state => { delete state.cooldowns; }, state => { state.meters = []; },
    state => { state.cooldowns = { storm: -1 }; }, state => { state.budgets = { storm: Infinity }; },
    state => { state.budgets = { storm: 1e9 + 1 }; },
    state => { state.meters = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`meter-${i}`, 0])); },
  ];
  for (const corrupt of corruptions) {
    const envelope = fixture();
    corrupt(envelope.activeRun.snapshot.runtime.setState);
    assert.equal(validateSaveEnvelope(envelope).ok, false);
  }
  const envelope = fixture();
  envelope.activeRun.snapshot.runtime.setState = null;
  assert.equal(validateSaveEnvelope(envelope).ok, false);
});
