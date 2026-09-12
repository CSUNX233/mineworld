import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const built = buildSync({ stdin: { contents: `
export { SaveManager } from './src/core/SaveManager';
export { RunManager } from './src/core/RunManager';
export { unlockNode } from './src/progression/MetaProgression';`, loader: 'ts',
resolveDir: fileURLToPath(new URL('..', import.meta.url)) }, bundle: true, write: false, format: 'esm', platform: 'node' });
const { SaveManager: saves, RunManager: runs, unlockNode } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
function storage() {
  const data = new Map();
  globalThis.localStorage = { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k) };
  return data;
}

test('migration combines independent unspent balances but counts copied profiles only once', () => {
  const data = storage();
  const a = runs.createEnvelope('a'), b = runs.createEnvelope('b');
  a.profile.availableMetaPoints = 2; a.profile.researchXp = 60;
  b.profile.availableMetaPoints = 3; b.profile.researchXp = 70;
  for (const [slot, envelope] of [a, b, a].entries()) data.set(`mineworld_save_slot_${slot}`, JSON.stringify(envelope));
  const shared = saves.readSlot(0).envelope.profile;
  assert.equal(shared.availableMetaPoints, 6);
  assert.equal(shared.researchXp, 30);
  assert.equal(saves.readSlot(1).envelope.profile.availableMetaPoints, 6);
});

test('old slots merge unlocks once; points, spending and deletion are shared', () => {
  const data = storage();
  const a = runs.createEnvelope('a'), b = runs.createEnvelope('b');
  a.profile.availableMetaPoints = 4;
  b.profile.unlockedNodes.push('arcanist');
  data.set('mineworld_save_slot_0', JSON.stringify(a));
  data.set('mineworld_save_slot_1', JSON.stringify(b));
  const current = saves.readSlot(0).envelope;
  assert.ok(current.profile.unlockedNodes.includes('arcanist'));
  const unlocked = unlockNode(current, 'summoner');
  assert.equal(saves.saveEnvelope(unlocked, 0).ok, true);
  const other = saves.readSlot(1).envelope;
  assert.equal(other.profile.availableMetaPoints, 2);
  assert.ok(other.profile.unlockedNodes.includes('summoner'));
  saves.clear(0);
  assert.equal(saves.readSlot(0).kind, 'empty');
  const fresh = runs.createEnvelope('new');
  saves.attachSharedCamp(fresh);
  assert.equal(saves.saveEnvelope(fresh, 0).ok, true);
  assert.equal(fresh.profile.availableMetaPoints, 2);
  assert.ok(fresh.profile.unlockedNodes.includes('summoner'));
});

test('storage failure cannot partially commit camp points and stale pages cannot overwrite them', () => {
  storage();
  const fresh = runs.createEnvelope('new');
  saves.attachSharedCamp(fresh);
  fresh.profile.availableMetaPoints = 4;
  assert.equal(saves.saveEnvelope(fresh, 0).ok, true);
  const stale = saves.readSlot(0).envelope;
  const changed = unlockNode(saves.readSlot(0).envelope, 'summoner');
  const write = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('quota'); };
  assert.equal(saves.saveEnvelope(changed, 0).ok, false);
  assert.equal(saves.readSlot(0).envelope.profile.availableMetaPoints, 4);
  localStorage.setItem = write;
  assert.equal(saves.saveEnvelope(changed, 0).ok, true);
  assert.equal(saves.saveEnvelope(stale, 0).ok, false);
  assert.equal(saves.readSlot(0).envelope.profile.availableMetaPoints, 2);
});
