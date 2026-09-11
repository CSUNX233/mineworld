import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const built = buildSync({ stdin: { contents: `
export { RunManager } from './src/core/RunManager';
export { unlockNode, setRewardPreference } from './src/progression/MetaProgression';
export { masteredBranchesForRun } from './src/progression/Settlement';
export { validateSaveEnvelope } from './src/core/SaveValidation';
export { ItemGenerator } from './src/items/ItemGenerator';
export { RNG } from './src/utils/RNG';
export { matchesRewardPreference } from './src/items/RewardPreference';
export { default as items } from './src/data/items.json';`, loader: 'ts',
resolveDir: fileURLToPath(new URL('..', import.meta.url)) }, bundle: true, write: false, format: 'esm', platform: 'node' });
const api = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

test('mastery requires actual uses, distinct rooms and victory; old saves remain valid', () => {
  const old = api.RunManager.createEnvelope('p4');
  assert.equal(api.validateSaveEnvelope(old).ok, true);
  const envelope = api.RunManager.startRun(old, 'run', 9, 'vanguard', 1);
  const run = envelope.activeRun;
  for (let i = 0; i < 20; i++) api.RunManager.recordBuildUse(run, 'melee_guard', '1:room');
  assert.deepEqual(api.masteredBranchesForRun(run, 'victory'), []);
  for (const key of ['2:room', '3:room']) api.RunManager.recordBuildUse(run, 'melee_guard', key);
  assert.deepEqual(api.masteredBranchesForRun(run, 'death'), []);
  assert.deepEqual(api.masteredBranchesForRun(run, 'victory'), ['melee_guard']);
  assert.equal(api.validateSaveEnvelope(envelope).ok, true);
  run.buildUsage.melee_guard.encounterKeys.push('3:room');
  assert.equal(api.validateSaveEnvelope(envelope).ok, false);
});

test('mastery preference needs achievement and is frozen during a run', () => {
  let envelope = api.RunManager.createEnvelope('p4');
  envelope.profile.availableMetaPoints = 4;
  assert.throws(() => api.unlockNode(envelope, 'vanguard_mastery'));
  envelope.profile.mastery.melee_guard = 1;
  envelope = api.unlockNode(envelope, 'vanguard_mastery');
  envelope = api.setRewardPreference(envelope, 'vanguard');
  assert.equal(api.validateSaveEnvelope(envelope).ok, true);
  envelope = api.RunManager.startRun(envelope, 'run', 3, 'vanguard', 1);
  assert.equal(envelope.activeRun.rewardPreference, 'vanguard');
  assert.throws(() => api.setRewardPreference(envelope, 'vanguard'));
});

test('core opportunity uses the requested family without forcing top rarity', () => {
  for (const preference of ['vanguard', 'arcanist', 'summoner']) {
    const item = api.ItemGenerator.generate(1, new api.RNG(12), 1, 'rare', undefined, 0, preference, true);
    const base = api.items.find(candidate => item.id.startsWith(candidate.id + '_rare_'));
    assert.ok(base && api.matchesRewardPreference(base, preference));
    assert.equal(item.rarity, 'rare');
    const general = api.ItemGenerator.generate(8, new api.RNG(12), 5);
    const preferred = api.ItemGenerator.generate(8, new api.RNG(12), 5, undefined, undefined, 0, preference);
    assert.equal(preferred.rarity, general.rarity);
  }
});
