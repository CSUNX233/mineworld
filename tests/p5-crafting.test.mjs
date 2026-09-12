import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const result = buildSync({ stdin: {
  contents: `export {CraftingSystem} from './src/items/CraftingSystem';
    export {AffixSystem} from './src/items/AffixSystem';
    export {CRAFTING_TAGS} from './src/items/CraftingTags';
    export {RNG} from './src/utils/RNG';`,
  resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts',
}, bundle: true, write: false, format: 'esm', platform: 'node' });
const { CraftingSystem, AffixSystem, CRAFTING_TAGS, RNG } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

function gear(overrides = {}) {
  return {
    id: 'sword_instance_1', contentId: 'sword', name: '锐利的长剑', slot: 'weapon', rarity: 'rare',
    baseStats: { attack: 12, attackSpeed: 1 },
    affixes: [
      { id: 'sharp_5_0', name: '锐利的', tier: 1, values: { attack: 7 }, valueModes: { attack: 'flat' } },
      { id: 'fierce_5_1', name: '狂暴的', tier: 1, values: { attackSpeed: 0.12 }, valueModes: { attackSpeed: 'increased' } },
    ],
    requiredLevel: 5, icon: 'sword', itemLevel: 5, sellPrice: 30,
    ...overrides,
  };
}

test('locked ordinary affix and special mechanisms survive seeded reforge unchanged', () => {
  const item = gear({ rarity: 'legendary' });
  item.affixes.push({ id: 'wildfire_5', name: '燎原的', tier: 1, values: {}, special: 'fireTrail' });
  const before = JSON.stringify(item);
  const options = { tag: 'melee', lockedAffixId: 'sharp_5_0' };
  const forged = CraftingSystem.reforgeItem(item, new RNG(13), options);
  assert.deepEqual(forged, CraftingSystem.reforgeItem(item, new RNG(13), options));
  assert.equal(forged.id, item.id);
  assert.equal(forged.contentId, item.contentId);
  assert.deepEqual(forged.affixes[0], item.affixes[0]);
  assert.notEqual(forged.affixes[0].values, item.affixes[0].values);
  assert.deepEqual(forged.affixes.filter(a => a.special), item.affixes.filter(a => a.special));
  assert.equal(forged.affixes.filter(a => !a.special).length, 2);
  assert.equal(forged.affixes.filter(a => AffixSystem.definitionId(a) === 'sharp').length, 1);
  assert.equal(JSON.stringify(item), before);
});

test('three attempts persist through upgrading and a JSON save roundtrip', () => {
  let item = gear();
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.equal(CraftingSystem.remainingReforges(item), 3 - attempt);
    item = CraftingSystem.reforgeItem(item, new RNG(attempt));
    item = CraftingSystem.upgradeItem(JSON.parse(JSON.stringify(item)));
    assert.equal(item.id, 'sword_instance_1');
    assert.equal(item.contentId, 'sword');
    assert.equal(item.reforgeCount, attempt + 1);
  }
  assert.equal(CraftingSystem.remainingReforges(item), 0);
  assert.equal(CraftingSystem.canReforge(item), false);
  assert.throws(() => CraftingSystem.reforgeItem(item, new RNG(0)));
});

test('unavailable directions, invalid locks and empty ordinary gear fail before using RNG', () => {
  const rng = { int() { throw new Error('RNG used'); }, weighted() { throw new Error('RNG used'); } };
  for (const [item, options] of [
    [gear(), { tag: 'nonexistent' }],
    [gear(), { tag: 'fire' }],
    [gear(), { lockedAffixId: 'missing' }],
    [gear(), { lockedAffixId: ['sharp_5_0', 'fierce_5_1'] }],
    [gear(), { other: 1 }],
    [gear(), null],
    [gear({ rarity: 'common', affixes: [] }), {}],
    [gear({ reforgeCount: NaN }), {}],
    [gear({ affixes: gear().affixes.slice(0, 1) }), { lockedAffixId: 'sharp_5_0' }],
    [gear({ affixes: [{ id: 'special', name: '特殊', tier: 1, values: {}, special: 'fireTrail' }] }), { lockedAffixId: 'special' }],
  ]) {
    const before = JSON.stringify(item);
    assert.equal(CraftingSystem.canReforge(item, options), false);
    assert.throws(() => CraftingSystem.reforgeItem(item, rng, options), error => !error.message.includes('RNG used'));
    assert.throws(() => CraftingSystem.reforgeCost(item, options));
    assert.equal(JSON.stringify(item), before);
  }
});

test('tag previews expose actual supporting stats and weighted direction allows other outcomes', () => {
  for (const tag of CRAFTING_TAGS) {
    for (const def of AffixSystem.candidatesForTag('ring', tag.id)) assert.ok(tag.stats.includes(def.stat));
  }
  assert.ok(!AffixSystem.availableTags('weapon').some(tag => tag.id === 'fire'));
  assert.deepEqual(AffixSystem.candidatesForTag('ring2', 'fire'), AffixSystem.candidatesForTag('ring', 'fire'));
  assert.equal(AffixSystem.definitionId({ id: 'arcane_reservoir_5_0' }), 'arcane_reservoir');
  const preview = AffixSystem.candidatePreview('ring', 'rare', 5, 'fire');
  assert.ok(preview.length > 0 && preview.every(def => def.min <= def.max));
  const renewing = AffixSystem.candidatePreview('ring', 'rare', 5).find(def => def.id === 'renewing');
  assert.equal(renewing.min, 0.7);
  assert.equal(renewing.max, 1.9);
  let directed = 0, ordinary = 0, missed = 0;
  // Small deterministic rule check, not a player simulation or balance estimate.
  for (let seed = 0; seed < 32; seed++) {
    const target = AffixSystem.generateAffixes('ring', 'magic', 5, new RNG(seed), 1, { tag: 'fire' });
    const normal = AffixSystem.generateAffixes('ring', 'magic', 5, new RNG(seed), 1);
    const ids = new Set(preview.map(def => def.id));
    const hit = ids.has(AffixSystem.definitionId(target[0]));
    directed += Number(hit);
    missed += Number(!hit);
    ordinary += Number(ids.has(AffixSystem.definitionId(normal[0])));
  }
  assert.ok(directed > ordinary);
  assert.ok(missed > 0);
});

test('costs show additive direction and lock surcharges using existing materials', () => {
  const item = gear({ slot: 'ring' });
  const base = CraftingSystem.reforgeCost(item);
  const directed = CraftingSystem.reforgeCost(item, { tag: 'fire' });
  const locked = CraftingSystem.reforgeCost(item, { lockedAffixId: 'sharp_5_0' });
  const both = CraftingSystem.reforgeCost(item, { tag: 'fire', lockedAffixId: 'sharp_5_0' });
  assert.ok(directed.gold > base.gold && locked.gold > directed.gold && both.gold > locked.gold);
  assert.equal(both.materials[0].amount, base.materials[0].amount + 2);
  assert.equal(both.materials[0].materialId, 'element_shard');
});
