import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const result = buildSync({ stdin: {
  contents: `export {SetRuntime} from './src/items/SetRuntime'; export {P5_SETS} from './src/data/sets';`,
  resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts',
}, bundle: true, write: false, format: 'esm', platform: 'node' });
const { SetRuntime, P5_SETS } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

function fixture(counts, enemies = 1) {
  const targets = Array.from({ length: enemies }, (_, id) => ({
    id: `target-${id}`, dead: false, health: 10000,
    def: { behavior: 'boss', armor: 0 },
    statuses: [
      { type: 'burning', duration: 30, damagePerTick: 20 },
      { type: 'frozen', duration: 30, damagePerTick: 0 },
      { type: 'poisoned', duration: 30, damagePerTick: 2 },
    ],
  }));
  const events = [];
  const host = {
    attackRate: () => 100, maxHealth: () => 1000, maxMana: () => 100,
    targets: () => targets.filter(t => !t.dead),
    damage: (target, amount, element, set) => events.push({ kind: 'damage', target, amount, element, set }),
    status: (target, status, amount) => events.push({ kind: 'status', target, status, amount }),
    slow: (target, seconds) => events.push({ kind: 'slow', target, seconds }),
    shield: amount => events.push({ kind: 'shield', amount }),
    mana: amount => events.push({ kind: 'mana', amount }),
    summon: () => { events.push({ kind: 'summon' }); return true; },
    message: (set, text) => events.push({ kind: 'message', set, text }),
  };
  const runtime = new SetRuntime(host);
  const advance = (seconds, movement = 0, inCombat = true) => {
    const frames = Math.round(seconds * 10);
    for (let i = 0; i < frames; i++) runtime.update(.1, counts, movement, inCombat);
  };
  runtime.update(0, counts, 0, true);
  const total = (kind) => events.filter(e => e.kind === kind).reduce((sum, e) => sum + e.amount, 0);
  return { runtime, targets, events, advance, total, counts, host };
}

const loops = {
  warlord(f) { f.runtime.onHit(f.targets[0], 'physical', 'guard_counter'); f.runtime.onHit(f.targets[0], 'physical', 'seismic_slam'); },
  warbringer(f) { for (let i = 0; i < 3; i++) { f.runtime.onHit(f.targets[0], 'physical', 'melee_attack'); f.advance(.3); } f.runtime.onHit(f.targets[0], 'physical', 'seismic_slam'); f.advance(.3); },
  frost(f) { f.runtime.onHit(f.targets[0], 'frost', 'frost_nova'); f.runtime.onCast('fireball', 20); f.runtime.onHit(f.targets[0], 'fire', 'fireball'); },
  shadow(f) { f.advance(.4, .8); f.runtime.onHit(f.targets[0], 'fire', 'melee_attack'); f.advance(.3); },
  inferno(f) { f.runtime.onHit(f.targets[0], 'fire', 'fireball'); },
  glacier(f) { for (let i = 0; i < 2; i++) { f.runtime.onHit(f.targets[0], 'physical', 'melee_attack'); f.advance(.5); } f.runtime.onHit(f.targets[0], 'frost', 'frost_nova'); f.advance(.4); },
  venom(f) { for (let i = 0; i < 4; i++) { f.runtime.onHit(f.targets[0], 'poison', 'staff_attack'); f.advance(.7); } f.runtime.onSummonHit(f.targets[0], 'warrior', false, true); f.runtime.onTemporaryEnd(f.targets); },
  sanguine(f) { f.runtime.onLeechRecovered(10); f.runtime.onCast('seismic_slam', 10); f.runtime.onLowHealth(); },
  storm(f) { for (let i = 0; i < 3; i++) { f.runtime.onHit(f.targets[0], 'physical', 'melee_attack'); f.advance(.5); } f.runtime.onCast('fireball', 10); },
  soul_banner(f) { for (const role of ['guardian', 'warrior', 'archer']) f.runtime.onSummonHit(f.targets[0], role, true, false); },
  soul_pyre(f) { for (const role of ['warrior', 'guardian', 'archer']) { f.runtime.onSacrifice(role); f.runtime.onCast('raise_company', 20); f.advance(1); } f.runtime.onSummonHit(f.targets[0], 'archer', true, false); },
  embersteel(f) { f.runtime.onCast('fireball', 10); f.runtime.onHit(f.targets[0], 'physical', 'melee_attack'); },
};

test('all twelve sets start at two pieces and their four-piece loops work against a living boss', () => {
  assert.equal(Object.keys(P5_SETS).length, 12);
  assert.deepEqual(Object.keys(loops).sort(), Object.keys(P5_SETS).sort());
  for (const [id, trigger] of Object.entries(loops)) {
    const entry = fixture({ [id]: 2 });
    entry.advance(3);
    trigger(entry);
    assert.ok(entry.total('damage') + entry.total('status') > 0, `${id} did not start at two pieces`);
    const f = fixture({ [id]: 4 });
    f.advance(3);
    trigger(f);
    assert.ok(f.total('damage') + f.total('status') > 0, `${id} did not produce combat damage`);
    if (['warlord', 'sanguine', 'soul_banner', 'soul_pyre'].includes(id)) assert.ok(f.total('shield') > 0, `${id} did not provide earned protection`);
    if (id === 'frost') assert.ok(f.total('mana') > 0 && f.events.some(e => e.kind === 'slow'));
    if (id === 'venom') assert.equal(f.events.filter(e => e.kind === 'summon').length, 1);
    if (id === 'embersteel') assert.ok(f.targets[0].statuses[0].duration < 30, 'transferred burn must be removed');
  }
});

test('mixed recovery loops cannot multiply the shared shield and mana allowances', () => {
  const f = fixture({ frost: 4, sanguine: 4 });
  for (let frame = 0; frame < 60; frame++) {
    f.advance(.1);
    for (let burst = 0; burst < 8; burst++) {
      f.runtime.onHit(f.targets[0], 'frost', 'frost_nova');
      f.runtime.onLeechRecovered(100);
      f.runtime.onCast('fireball', 100);
      f.runtime.onLowHealth();
    }
  }
  assert.ok(f.total('shield') > 0 && f.total('shield') <= 36 + 1e-8, 'shared shields earn at most 0.6% of max health per combat second');
  assert.ok(f.total('mana') > 0 && f.total('mana') <= 4.8 + 1e-8, 'shared mana earns at most 0.8% of max mana per combat second');
});

test('sacrifice support waits for a successful refill with actual mana payment', () => {
  const f = fixture({ soul_pyre: 4 });
  f.advance(3);
  f.runtime.onSacrifice('archer');
  assert.equal(f.runtime.snapshot().meters['soul_pyre-cycle'] ?? 0, 0, 'sacrifice alone must not advance paid refill roles');
  f.runtime.onCast('raise_company', 0);
  assert.equal(f.total('damage') + f.total('shield') + f.total('mana'), 0, 'unpaid refill must not claim sacrifice support');
  assert.equal(f.runtime.snapshot().meters['soul_pyre-cycle'] ?? 0, 0, 'unpaid refill must not advance the role cycle');
  f.runtime.onCast('raise_company', 20);
  assert.ok(f.total('damage') > 0 && f.total('mana') > 0, 'unpaid refill must retain the recorded sacrifice for a paid refill');
  assert.equal(f.runtime.snapshot().meters['soul_pyre-cycle'], 4);
  f.runtime.onCast('raise_company', 20);
  assert.equal(f.runtime.snapshot().meters['soul_pyre-cycle'], 4, 'repeat refill cannot count the same sacrifice twice');
  for (const role of ['warrior', 'guardian']) {
    f.runtime.onSacrifice(role);
    f.runtime.onCast('raise_company', 20);
  }
  assert.equal(f.runtime.snapshot().meters['soul_pyre-cycle'], 0);
  assert.equal(f.runtime.snapshot().meters['soul_pyre-fire'], 3, 'only three distinct paid sacrifice/refill pairs complete a soul-fire cycle');
});

test('poison killing hits hatch a full meter and rejected capacity retains charges without burning cooldown', () => {
  const f = fixture({ venom: 2 });
  let capacityAvailable = false, attempts = 0;
  f.host.summon = () => { attempts++; return capacityAvailable; };
  for (let i = 0; i < 4; i++) f.runtime.onKillingHit('poison', 'staff_attack');
  assert.equal(attempts, 1);
  assert.equal(f.runtime.snapshot().meters.venom, 4);
  assert.equal(f.runtime.snapshot().cooldowns.venom, undefined);
  capacityAvailable = true;
  f.runtime.onKillingHit('poison', 'staff_attack');
  assert.equal(attempts, 2);
  assert.equal(f.runtime.snapshot().meters.venom, 0);
  const cooldown = f.runtime.snapshot().cooldowns.venom;
  for (let i = 0; i < 4; i++) f.runtime.onKillingHit('poison', 'staff_attack');
  assert.equal(attempts, 2, 'successful hatch cooldown is still enforced');
  f.advance(6.1);
  f.runtime.onHit(f.targets[0], 'poison', 'staff_attack');
  assert.equal(attempts, 3, 'full retained charge can hatch on the next eligible hit');
  assert.ok(f.runtime.snapshot().cooldowns.venom > cooldown);
});

test('delayed four-piece hits are forfeited immediately on removal or downgrade and never restored on re-equip', () => {
  for (const remainingPieces of [0, 2]) {
    const f = fixture({ shadow: 4 });
    f.advance(3);
    f.advance(.4, .8);
    f.runtime.onHit(f.targets[0], 'physical', 'melee_attack');
    assert.equal(f.total('damage'), 0);
    f.runtime.update(0, { shadow: remainingPieces }, 0, true);
    f.runtime.update(0, { shadow: 4 }, 0, true);
    f.advance(.3);
    assert.equal(f.total('damage'), 0, `reserved four-piece afterimage survived downgrade to ${remainingPieces}`);
  }
});

test('four-piece tail, sacrifice cycle, soul fire and heat wave states do not survive downgrading to two pieces', () => {
  const f = fixture({ frost: 4, soul_pyre: 4, embersteel: 4 });
  f.advance(3);
  f.runtime.onHit(f.targets[0], 'frost', 'frost_nova');
  f.runtime.onCast('fireball', 20);
  for (const role of ['warrior', 'guardian', 'archer']) {
    f.runtime.onSacrifice(role);
    f.runtime.onCast('raise_company', 20);
  }
  assert.equal(f.runtime.snapshot().meters['frost-tail'], 1);
  assert.equal(f.runtime.snapshot().meters['soul_pyre-fire'], 3);
  assert.equal(f.runtime.snapshot().meters['embersteel-fire'], 1);
  f.runtime.update(0, { frost: 2, soul_pyre: 2, embersteel: 2 }, 0, true);
  f.runtime.onSacrifice('guardian');
  f.runtime.onCast('raise_company', 20);
  f.runtime.onCast('fireball', 20);
  f.runtime.update(0, f.counts, 0, true);
  for (const key of ['frost-tail', 'soul_pyre-cycle', 'soul_pyre-fire', 'embersteel-fire']) {
    assert.equal(f.runtime.snapshot().meters[key], 0, `${key} survived its four-piece source removal`);
  }
});

test('crowd size does not multiply a discharge budget and excess bank time is capped', () => {
  const results = [];
  for (const population of [1, 12]) {
    const f = fixture({ storm: 4 }, population);
    f.advance(8);
    loops.storm(f);
    const damage = f.total('damage');
    assert.ok(damage > 0 && damage <= 36 + 1e-8, 'four pieces bank at most three seconds of 12% reference DPS');
    results.push(damage);
  }
  assert.ok(Math.abs(results[0] - results[1]) < 1e-8);
});

test('inferno trails stay at their landing point, expire in three seconds, remain capped and share the damage budget', () => {
  const f = fixture({ inferno: 4 }, 2);
  const player = { x: 0, y: 0, z: 0 };
  const emissions = [];
  let entered = false;
  f.host.position = () => player;
  f.host.trail = (position, life) => emissions.push({ position, life, time: f.runtime.snapshot().time });
  f.host.targetsAt = (position, range) => entered && Math.abs(position.x) <= range ? [f.targets[0]] : [];
  f.advance(3);
  f.advance(.1, .1);
  assert.equal(emissions.length, 1);
  assert.equal(emissions[0].life, 3);
  player.x = 20;
  entered = true;
  f.advance(.6);
  assert.ok(f.events.some(event => event.kind === 'status' && event.target === f.targets[0]), 'enemy entering the old point burns after the player leaves');
  assert.ok(!f.events.some(event => event.kind === 'status' && event.target === f.targets[1]), 'targets excluded by node line-of-sight are never ignited');
  assert.equal(emissions[0].position.x, 0, 'node position is copied rather than following the player');
  f.advance(3);
  const expiredDamage = f.total('status');
  f.advance(1);
  assert.equal(f.total('status'), expiredDamage, 'expired nodes cannot ignite more enemies');

  for (let i = 0; i < 120; i++) {
    player.x = i;
    f.advance(.1, .1);
    const time = f.runtime.snapshot().time;
    assert.ok(emissions.filter(node => time - node.time < node.life - 1e-8).length <= 3);
  }
  for (let i = 1; i < emissions.length; i++) assert.ok(emissions[i].time - emissions[i - 1].time >= 1.5 - 1e-8);
  assert.ok(f.total('status') <= f.runtime.snapshot().time * 12 + 1e-8, 'trail nodes do not create extra damage allowances');

  // Each boundary clears nodes without resetting the landing cooldown or restoring victims.
  for (const clear of [
    () => { f.runtime.update(0, { inferno: 2 }, 0, true); f.runtime.update(0, f.counts, 0, true); },
    () => f.runtime.clearTargets(),
    () => { const saved = f.runtime.snapshot(); f.runtime.restore(saved); f.runtime.update(0, f.counts, 0, true); },
  ]) {
    let queries = 0;
    f.host.targetsAt = () => { queries++; return []; };
    player.x = 0;
    f.advance(1.6, .1);
    clear();
    queries = 0;
    f.advance(.6);
    assert.equal(queries, 0, 'removed, floor-cleared or restored nodes must not query victims');
  }
});

test('rapid mixed set hits and temporary effects share earned budgets instead of multiplying damage', () => {
  const f = fixture({ inferno: 4, venom: 4 }, 12);
  for (let frame = 0; frame < 60; frame++) {
    f.advance(.1, .1);
    for (let burst = 0; burst < 12; burst++) {
      const target = f.targets[burst];
      f.runtime.onHit(target, 'poison', 'staff_attack');
      f.runtime.onSummonHit(target, 'warrior', false, true);
      f.runtime.onTemporaryEnd(f.targets);
      const temporaryDamage = f.runtime.temporaryDamage();
      if (temporaryDamage > 0) f.events.push({ kind: 'damage', amount: temporaryDamage });
    }
  }
  const damage = f.total('damage') + f.total('status');
  assert.ok(damage > 0);
  assert.ok(damage <= 144 + 1e-8, 'eight pieces earn at most 24% reference DPS for six seconds across every target and source');
});

test('removing and restoring equipment cannot refill spent damage or bypass emergency cooldown', () => {
  const f = fixture({ sanguine: 4 });
  f.advance(3);
  f.runtime.onLeechRecovered(10);
  f.runtime.onCast('seismic_slam', 10);
  f.runtime.onLowHealth();
  const shield = f.total('shield'), damage = f.total('damage');
  f.runtime.update(0, {}, 0, true);
  f.runtime.update(0, { sanguine: 4 }, 0, true);
  f.runtime.onLeechRecovered(10);
  f.runtime.onCast('seismic_slam', 10);
  f.runtime.onLowHealth();
  assert.equal(f.total('shield'), shield);
  assert.equal(f.total('damage'), damage);
  f.advance(1);
  f.runtime.onLowHealth();
  assert.equal(f.total('shield'), shield, 'new support budget does not bypass the twelve-second cooldown');
});

test('save restoration discards reserved victim hits without refunding or resetting spent cooldowns', () => {
  const f = fixture({ shadow: 4 });
  f.advance(3);
  f.advance(.4, .8);
  f.runtime.onHit(f.targets[0], 'fire', 'melee_attack');
  assert.equal(f.total('damage'), 0, 'four-piece afterimage is delayed');
  const saved = JSON.parse(JSON.stringify(f.runtime.snapshot()));
  const restored = fixture({ shadow: 4 });
  restored.runtime.restore(saved);
  restored.runtime.update(0, restored.counts, 0, true);
  restored.advance(.4, .8);
  restored.runtime.onHit(restored.targets[0], 'fire', 'melee_attack');
  restored.advance(.4);
  assert.equal(restored.total('damage'), 0, 'loading must not deliver old target references or refund the old trigger cooldown');
  restored.advance(1.5);
  restored.runtime.onHit(restored.targets[0], 'fire', 'melee_attack');
  restored.advance(.3);
  assert.ok(restored.total('damage') > 0 && restored.total('damage') < 36, 'later trigger uses only damage earned after loading');
});

test('secondary afterimages never act as new primary hits that recharge other sets', () => {
  const f = fixture({ shadow: 4, storm: 4 });
  f.advance(3);
  f.advance(.4, .8);
  let primaryCalls = 0;
  const primary = f.runtime.onHit.bind(f.runtime);
  f.runtime.onHit = (...args) => { primaryCalls++; return primary(...args); };
  f.runtime.onHit(f.targets[0], 'fire', 'melee_attack');
  f.advance(.5);
  assert.ok(f.events.some(e => e.kind === 'damage' && e.set === 'shadow'));
  assert.equal(primaryCalls, 1);
  const charge = f.runtime.snapshot().meters.storm;
  for (const source of ['p5_shadow', 'poison_tick', 'flame_rift_tick', 'chainLightning', 'temporary_summon']) {
    f.runtime.onHit(f.targets[0], 'fire', source);
  }
  assert.equal(f.runtime.snapshot().meters.storm, charge, 'secondary source labels are excluded from direct-hit charging');
  f.runtime.onCast('fireball', 10);
  assert.ok(!f.events.some(e => e.kind === 'damage' && e.set === 'storm'), 'one primary plus an afterimage cannot satisfy three direct-hit charges');
});
