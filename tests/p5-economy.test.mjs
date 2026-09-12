import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const built = buildSync({ stdin: {
  contents: `export {CraftingSystem} from './src/items/CraftingSystem'; export {ShopSystem} from './src/items/ShopSystem';
    export {ItemGenerator} from './src/items/ItemGenerator'; export {missingSetCommission} from './src/items/EquipmentProgression';
    export {RNG} from './src/utils/RNG';`,
  resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts',
}, bundle: true, write: false, format: 'esm', platform: 'node' });
const { CraftingSystem, ShopSystem, ItemGenerator, missingSetCommission, RNG } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

test('repeated upgrades have the same linear resale value as newly generated equipment', () => {
  for (const rarity of ['common', 'magic', 'rare', 'epic', 'legendary']) {
    let item = ItemGenerator.generate(1, new RNG(3), 1, rarity, 'weapon', 0, undefined, false, 2);
    const reference = ItemGenerator.generate(item.itemLevel + 1, new RNG(5), 100, rarity);
    const increment = 2 * (['common', 'magic', 'rare', 'epic', 'legendary'].indexOf(rarity) + 1) ** 2;
    for (let step = 0; step < 25; step++) {
      const before = item;
      item = CraftingSystem.upgradeItem(before);
      assert.equal(item.sellPrice - before.sellPrice, increment);
      assert.ok(item.sellPrice - before.sellPrice < CraftingSystem.upgradeCost(before).gold);
      if (item.itemLevel === reference.itemLevel) assert.equal(item.sellPrice, reference.sellPrice);
    }
    const inflated = CraftingSystem.upgradeItem({ ...item, sellPrice: 1e9 });
    assert.equal(inflated.sellPrice - item.sellPrice, increment, 'legacy inflated prices must not propagate into new upgrades');
  }
});

test('buying merchant equipment then upgrading and selling or salvaging never recovers the spent value', () => {
  for (const floor of [1, 10, 25]) for (const entry of ShopSystem.generateStock(floor, 25, 4, new RNG(13), 'vanguard', 2)) {
    let item = entry.item, spent = entry.price;
    assert.notEqual(item.rarity, 'legendary');
    for (let step = 0; step < 25; step++) {
      assert.ok(ShopSystem.recoveryValue(item, floor) < spent, `floor ${floor} bought/upgraded item can be liquidated for profit`);
      const cost = CraftingSystem.upgradeCost(item);
      spent += cost.gold + cost.materials.reduce((sum, part) => sum + part.amount * ShopSystem.materialPrice(part.materialId, floor), 0);
      item = CraftingSystem.upgradeItem(item);
    }
  }
});

test('missing-set commissions count both rings, prefer partial sets and override conflicting reward preference', () => {
  const piece = (setId, slot, version = 2) => ({ setId, slot, equipmentRulesVersion: version });
  assert.equal(missingSetCommission([piece('warlord', 'weapon', 1)]), undefined);
  const worn = [piece('warlord', 'legs'), piece('storm', 'weapon'), piece('storm', 'ring'), piece('storm', 'ring2')];
  const commission = missingSetCommission(worn);
  assert.equal(commission.id, 'storm');
  assert.ok(!commission.slots.includes('weapon') && !commission.slots.includes('ring'));
  assert.ok(commission.slots.includes('helmet'));
  for (const seed of [1, 2, 3]) {
    const item = ShopSystem.gamble(5, 5, 'helmet', new RNG(seed), 'vanguard', 2, 'melee', commission.id);
    assert.equal(item.setId, 'storm');
    assert.equal(item.slot, 'helmet');
    assert.ok(['magic', 'rare', 'epic'].includes(item.rarity));
  }
  const finished = [...worn, piece('storm', 'helmet')];
  assert.equal(missingSetCommission(finished).id, 'warlord', 'completed four-piece set must not take another partial set commission');
  const stock = ShopSystem.generateStock(5, 5, 4, new RNG(1), 'vanguard', 2, 'melee', 'storm');
  assert.ok(stock.every(entry => entry.item.setId === 'storm' && entry.item.rarity !== 'legendary'));
});
