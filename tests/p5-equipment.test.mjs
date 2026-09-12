import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const result = buildSync({ stdin: {
  contents: `export {SETS,P5_SETS,setDefinition} from './src/data/sets';
    export {P5_SET_ITEMS} from './src/items/SetItems';
    export {EquipmentManager} from './src/items/EquipmentManager';
    export {AffixSystem} from './src/items/AffixSystem';
    export {ItemGenerator} from './src/items/ItemGenerator';
    export {P5_SET_PREFERENCE_POOLS,p5PreferredCandidates} from './src/items/RewardPreference';
    export {RNG} from './src/utils/RNG';`,
  resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts',
}, bundle: true, write: false, format: 'esm', platform: 'node' });
const { SETS, P5_SETS, setDefinition, P5_SET_ITEMS, EquipmentManager, AffixSystem, ItemGenerator,
  P5_SET_PREFERENCE_POOLS, p5PreferredCandidates, RNG } =
  await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

function item(setId, slot, version = 2) {
  const base = P5_SET_ITEMS.find(base => base.setId === setId && base.slot === slot);
  return { ...base, id: `${setId}_${slot}_${version}`, equipmentRulesVersion: version,
    rarity: 'common', itemLevel: 1, requiredLevel: 1, sellPrice: 1, affixes: [] };
}

test('new scaling affixes act on base values and do not compound flat affixes', () => {
  const equipment = new EquipmentManager();
  const weapon = item('warlord', 'weapon');
  equipment.equip(weapon);
  const base = equipment.getDerivedStats().attack;
  equipment.equipment = { weapon: { ...weapon, affixes: [
    { id: 'tempered', name: '淬炼的', tier: 1, values: { attack: .16 }, valueModes: { attack: 'increased' } },
    { id: 'sharp', name: '锐利的', tier: 1, values: { attack: 10 }, valueModes: { attack: 'flat' } },
  ] } };
  assert.equal(equipment.getDerivedStats().attack, base * 1.16 + 10);
  const preview = AffixSystem.candidatePreview('weapon', 'rare', 1).find(def => def.id === 'tempered');
  assert.equal(preview.mode, 'increased');
  assert.equal(preview.min, .08);
  assert.equal(preview.max, .16);
  for (const id of ['deep_reserve', 'layered', 'enduring']) {
    assert.ok(['helmet', 'chest', 'necklace'].some(slot => AffixSystem.candidates(slot).some(def => def.id === id && def.mode === 'increased')));
  }
});

test('all 12 P5 sets cover eight base slots and expose two distinct mechanism thresholds', () => {
  const slots = ['boots', 'chest', 'helmet', 'legs', 'necklace', 'offhand', 'ring', 'weapon'];
  assert.equal(Object.keys(P5_SETS).length, 12);
  assert.equal(new Set(P5_SET_ITEMS.map(base => base.id)).size, 96);
  for (const [id, set] of Object.entries(P5_SETS)) {
    assert.deepEqual(P5_SET_ITEMS.filter(base => base.setId === id).map(base => base.slot).sort(), slots);
    assert.deepEqual(Object.keys(set.bonuses), ['2', '4']);
    for (const threshold of [2, 4]) {
      assert.equal(set.bonuses[threshold].special, `p5_${id}_${threshold}`);
      assert.ok(set.bonuses[threshold].description.length > 15);
      assert.deepEqual(set.bonuses[threshold].stats, {});
    }
  }
  for (const slot of slots) {
    const bases = P5_SET_ITEMS.filter(base => base.slot === slot);
    for (const base of bases) assert.deepEqual(base.baseStats, bases[0].baseStats);
  }
});

test('every pair can equip actual 4+4 and activate mechanics without stat bonuses', () => {
  const ids = Object.keys(P5_SETS);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const equipment = new EquipmentManager();
    for (const slot of ['weapon', 'helmet', 'chest', 'legs']) equipment.equip(item(ids[i], slot));
    for (const slot of ['boots', 'ring', 'necklace', 'offhand']) equipment.equip(item(ids[j], slot));
    assert.deepEqual(equipment.getP5SetCounts(), { [ids[i]]: 4, [ids[j]]: 4 });
    assert.equal(equipment.getActiveSetBonuses().length, 2);
    for (const id of [ids[i], ids[j]]) for (const threshold of [2, 4]) {
      assert.equal(equipment.getSpecialCount(`p5_${id}_${threshold}`), 1);
    }
  }
});

test('same ring base legitimately occupies both ring slots for 2+2+2+2+1', () => {
  const equipment = new EquipmentManager();
  for (const [id, slots] of [
    ['warlord', ['weapon', 'helmet']], ['inferno', ['chest', 'legs']],
    ['frost', ['boots', 'offhand']], ['soul_banner', ['ring', 'ring']],
  ]) for (const slot of slots) equipment.equip(item(id, slot));
  equipment.equip(item('shadow', 'necklace'));
  assert.equal(equipment.getEquippedItems().length, 9);
  assert.equal(equipment.get('ring').setId, 'soul_banner');
  assert.equal(equipment.get('ring2').setId, 'soul_banner');
  assert.equal(equipment.getActiveSetSpecials().length, 4);
});

test('legacy thresholds and attributes remain separate from new items with the same set id', () => {
  assert.equal(setDefinition('warlord'), SETS.warlord);
  assert.equal(setDefinition('warlord', 2), P5_SETS.warlord);
  assert.equal(setDefinition('soul_banner'), undefined);
  const equipment = new EquipmentManager();
  equipment.equip(item('warlord', 'weapon', 1));
  equipment.equip(item('warlord', 'helmet', 2));
  assert.deepEqual(equipment.getP5SetCounts(), { warlord: 1 });
  assert.equal(equipment.hasSpecial('p5_warlord_2'), false);
  assert.equal(equipment.getActiveSetBonuses().length, 0);
  equipment.equip(item('warlord', 'chest', 1));
  assert.deepEqual(equipment.getActiveSetBonuses()[0].effects, { attack: 8, maxHealth: 24 });
  equipment.equip(item('warlord', 'legs', 2));
  assert.equal(equipment.hasSpecial('p5_warlord_2'), true);
  assert.equal(equipment.getActiveSetBonuses().length, 2);
});

test('P5 generation uses stable content ids, fixed preference pools, and legacy defaults', () => {
  const legacy = ItemGenerator.generate(1, new RNG(19), 1, 'common');
  assert.equal(legacy.equipmentRulesVersion, undefined);
  assert.equal(legacy.contentId, undefined);
  assert.equal(legacy.id.startsWith('p5_'), false);
  for (const preference of ['vanguard', 'arcanist', 'summoner']) {
    for (const slot of ['weapon', 'helmet', 'chest', 'legs', 'boots', 'ring', 'ring2', 'necklace', 'offhand']) {
      const generated = ItemGenerator.generate(1, new RNG(19), 1, 'common', slot, 0, preference, true, 2);
      assert.equal(generated.equipmentRulesVersion, 2);
      assert.ok(P5_SET_PREFERENCE_POOLS[preference].includes(generated.setId));
      assert.equal(generated.contentId, `p5_${generated.setId}_${generated.slot}`);
      assert.equal(generated.slot, slot === 'ring2' ? 'ring' : slot);
    }
  }
  assert.deepEqual([...new Set(p5PreferredCandidates(P5_SET_ITEMS, 'arcanist', 'frost').map(base => base.setId))].sort(), ['frost', 'glacier']);
});
