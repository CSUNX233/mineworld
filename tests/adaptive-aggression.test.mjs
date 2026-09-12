import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const output = buildSync({ entryPoints: ['src/core/AdaptiveAggression.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { AdaptiveAggression, validAggression } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
function fight(ai, seconds, health) { for (let i = 0; i < seconds * 4; i++) ai.sample(.25, health); }

test('default normal; full health and fast clears raise only the NEXT floor', () => {
  for (const [seconds, health] of [[20, 1], [8, .65]]) {
    const ai = new AdaptiveAggression(); ai.encounter(5, false, false);
    fight(ai, seconds, health); assert.equal(ai.multiplier, 1);
    ai.advance(); assert.equal(ai.multiplier, 1.2);
    assert.equal(ai.snapshot().combatSeconds, 0);
  }
});
test('slow struggling play lowers appetite; normal play returns normal rather than stacking', () => {
  const ai = new AdaptiveAggression(); ai.encounter(5, false, false);
  fight(ai, 40, .4); ai.advance(); assert.equal(ai.multiplier, .8);
  ai.encounter(5, false, false); fight(ai, 20, .7); ai.advance(); assert.equal(ai.multiplier, 1);
});
test('save/reload retains measurements and tier; invalid snapshots cannot inject multipliers', () => {
  const ai = new AdaptiveAggression(); ai.encounter(5, false, false); fight(ai, 10, 1);
  const copy = new AdaptiveAggression(); copy.restore(ai.snapshot());
  fight(ai, 10, 1); fight(copy, 10, 1); ai.advance(); copy.advance();
  assert.deepEqual(copy.snapshot(), ai.snapshot());
  assert.equal(validAggression({ ...ai.snapshot(), tier: 2 }), false);
  assert.equal(validAggression({ ...ai.snapshot(), combatSeconds: NaN }), false);
  const saved = copy.snapshot(); saved.tier = .8; assert.equal(copy.multiplier, 1.2);
});
test('no combat samples do not raise difficulty and a suspended frame is capped', () => {
  const ai = new AdaptiveAggression(); ai.advance(); assert.equal(ai.multiplier, 1);
  ai.encounter(5, false, false); ai.sample(60, .5);
  assert.equal(ai.snapshot().combatSeconds, .25);
});

test('extra population requires an easy floor already at 1.2, persists, and resets when pressure settles', () => {
  const ai = new AdaptiveAggression();
  ai.encounter(5,false,false); fight(ai,8,.8); ai.advance();
  assert.equal(ai.multiplier,1.2); assert.equal(ai.crowded,false);
  ai.encounter(5,false,false); fight(ai,8,.8); ai.advance();
  assert.equal(ai.crowded,true);
  const resumed = new AdaptiveAggression(); resumed.restore(ai.snapshot()); assert.equal(resumed.crowded,true);
  resumed.encounter(5,false,false); fight(resumed,20,.7); resumed.advance();
  assert.equal(resumed.crowded,false); assert.equal(resumed.multiplier,1);
});
