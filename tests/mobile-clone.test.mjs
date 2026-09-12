import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const output = buildSync({ stdin: { contents: "export { cloneData } from './src/utils/cloneData'; export { RunManager } from './src/core/RunManager'; export { SaveManager } from './src/core/SaveManager';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node' });
const { cloneData, RunManager, SaveManager } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);

test('older mobile browsers can create, persist and reload all five slots without structuredClone', () => {
  const native = globalThis.structuredClone;
  const storage = globalThis.localStorage;
  const records = new Map();
  globalThis.structuredClone = undefined;
  globalThis.localStorage = { getItem: k => records.get(k) ?? null, setItem: (k,v) => records.set(k,String(v)), removeItem: k => records.delete(k) };
  try {
    for (let slot = 0; slot < 5; slot++) {
      const envelope = RunManager.createEnvelope(`mobile-${slot}`);
      SaveManager.attachSharedCamp(envelope);
      const active = RunManager.startRun(envelope, `run-${slot}`, 123, 'vanguard', 1000);
      assert.equal(envelope.activeRun, null);
      assert.equal(SaveManager.saveEnvelope(active, slot).ok, true);
      const loaded = SaveManager.readSlot(slot);
      assert.equal(loaded.kind, 'ready');
    }
    assert.equal(SaveManager.listSlots().filter(slot => slot.exists).length, 5);
    const source = { optional: undefined, value: Infinity, items: [{ level: 1 }] };
    source.self = source;
    const copy = cloneData(source);
    copy.items[0].level = 2;
    assert.equal(source.items[0].level, 1);
    assert.equal(copy.self, copy);
    assert.equal(copy.value, Infinity);
    assert.ok(Object.hasOwn(copy, 'optional'));
  } finally {
    globalThis.structuredClone = native;
    if (storage === undefined) delete globalThis.localStorage; else globalThis.localStorage = storage;
  }
});

