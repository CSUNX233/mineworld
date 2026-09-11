import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';

const output = buildSync({ stdin: {
  contents: `export {EquipmentManager} from './src/items/EquipmentManager';
    export {AffixSystem} from './src/items/AffixSystem';
    export {RNG} from './src/utils/RNG';
    export {Player} from './src/player/Player';
    export {CombatSystem} from './src/player/CombatSystem';`,
  resolveDir: process.cwd(), loader: 'ts',
}, bundle: true, write: false, format: 'esm', platform: 'node' });
const { EquipmentManager, Player, CombatSystem, AffixSystem, RNG } = await import(
  `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
function fixedRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try { fn(); } finally { Math.random = original; }
}
function weapon(baseStats, affixes = []) {
  return { id: 'audit', name: '验证剑', slot: 'weapon', rarity: 'rare', baseStats, affixes,
    requiredLevel: 1, icon: 'sword', itemLevel: 1, sellPrice: 0 };
}

test('weapon base attack speed is not counted twice', () => {
  const equipment = new EquipmentManager();
  equipment.equip(weapon({ attackSpeed: 1.35 }));
  const stats = equipment.getDerivedStats();
  near(stats.baseAttackSpeed * (1 + stats.attackSpeedBonus), 1.35);
});

test('relative critical chance scales its base while explicit absolute chance adds afterward', () => {
  const equipment = new EquipmentManager();
  equipment.equip(weapon({ critChance: 0.05 }, [
    { id: 'relative', name: '', tier: 1, values: { critChance: 1 }, valueModes: { critChance: 'increased' } },
    { id: 'absolute', name: '', tier: 1, values: { critChance: 0.03 }, valueModes: { critChance: 'flat' } },
  ]));
  near(equipment.getDerivedStats().critChance, 0.23);
});

test('relative attack speed bonuses add together and use the weapon base', () => {
  const equipment = new EquipmentManager();
  equipment.equip(weapon({ attackSpeed: 1.2 }, [
    { id: 'a', name: '', tier: 1, values: { attackSpeed: 0.2 }, valueModes: { attackSpeed: 'increased' } },
    { id: 'b', name: '', tier: 1, values: { attackSpeed: 0.3 }, valueModes: { attackSpeed: 'increased' } },
  ]));
  const stats = equipment.getDerivedStats();
  near(stats.baseAttackSpeed * (1 + stats.attackSpeedBonus), 1.8);
});

test('old percentage affixes retain values and use relative semantics without metadata', () => {
  const equipment = new EquipmentManager();
  equipment.equip(weapon({ critChance: 0.05 }, [
    { id: 'precise_old', name: '', tier: 1, values: { critChance: 0.1 } },
  ]));
  near(equipment.getDerivedStats().critChance, 0.11);
});

test('relative attack, health and armor affixes preserve fractional rolls', () => {
  for (const slot of ['weapon', 'helmet']) {
    const affixes = AffixSystem.generateAffixes(slot, 'rare', 1, new RNG(7), 99);
    const relative = affixes.filter(a => ['attack', 'maxHealth', 'armor'].some(stat => a.valueModes?.[stat] === 'increased'));
    assert.ok(relative.length > 0);
    for (const affix of relative) for (const value of Object.values(affix.values)) assert.ok(value > 0 && value < 1);
  }
});

test('agility improves baseline dodge with bounded diminishing returns', () => {
  const equipment = new EquipmentManager();
  near(equipment.getDerivedStats().dodgeChance, 0.05);
  const a = equipment.getDerivedStats({ agility: 30 }).dodgeChance;
  const b = equipment.getDerivedStats({ agility: 60 }).dodgeChance;
  assert.ok(a > 0.05 && b > a && b - a < a - 0.05);
  assert.ok(equipment.getDerivedStats({ agility: 1e9 }).dodgeChance <= 0.45);
});

test('dodge blocks a whole direct hit including shield loss but not damage over time', () => {
  const player = new Player();
  player.dodgeChance = 0.45;
  player.shield = 20;
  fixedRandom(0, () => {
    player.takeDamage(30);
    assert.equal(player.lastHitDodged, true);
    near(player.health, 100);
    near(player.shield, 20);
    player.takeDamage(30, false);
    near(player.shield, 0);
    near(player.health, 90);
  });
});

test('defense reduces direct damage before shield absorption', () => {
  const player = new Player();
  player.defense = 100;
  player.dodgeChance = 0;
  player.shield = 10;
  fixedRandom(0.9, () => player.takeDamage(40));
  near(player.health, 90);
  near(player.shield, 0);
});

test('shield waits five seconds then restores gradually and attacks restart the wait', () => {
  const player = new Player();
  player.dodgeChance = 0;
  player.setShieldCapacity(100);
  player.update(5, 5);
  near(player.shield, 0);
  player.update(0.5, 5.5);
  near(player.shield, 10);
  fixedRandom(0.9, () => player.takeDamage(5));
  near(player.shield, 5);
  player.update(5, 10.5);
  near(player.shield, 5);
  player.update(0.5, 11);
  near(player.shield, 15);
});

test('dodged attacks and damage over time also interrupt shield recovery', () => {
  const player = new Player();
  player.setShieldCapacity(100);
  player.shieldRechargeElapsed = 10;
  fixedRandom(0, () => player.takeDamage(20));
  near(player.shieldRechargeElapsed, 0);
  player.shieldRechargeElapsed = 10;
  player.takeDamage(1, false);
  near(player.shieldRechargeElapsed, 0);
});

test('shield from armor adds to granted shield without regenerating temporary excess', () => {
  const player = new Player();
  player.dodgeChance = 0;
  player.setShieldCapacity(50);
  player.update(10, 10);
  near(player.shield, 50);
  player.grantShield(20, 20);
  near(player.shield, 70);
  fixedRandom(0.9, () => player.takeDamage(60));
  player.update(10, 20);
  near(player.shield, 50);
});

test('swapping shield equipment cannot refill the shield instantly', () => {
  const player = new Player();
  player.setShieldCapacity(100);
  player.shield = 30;
  player.setShieldCapacity(0);
  player.setShieldCapacity(100);
  near(player.shield, 0);
});

test('armor affixes add shield capacity independently of defense affixes', () => {
  const equipment = new EquipmentManager();
  equipment.equip(weapon({}, [
    { id: 'shield', name: '', tier: 1, values: { armor: 25 } },
    { id: 'defense', name: '', tier: 1, values: { defense: 6 } },
  ]));
  near(equipment.getDerivedStats().armor, 25);
  near(equipment.getDerivedStats().defense, 6);
});

test('shield recovery speed shortens only recharge delay and respects its floor', () => {
  const equipment = new EquipmentManager();
  near(equipment.getDerivedStats().shieldRechargeDelay, 5);
  equipment.equip(weapon({}, [
    { id: 'recovery', name: '', tier: 1, values: { shieldRecoveryRate: 0.25 }, valueModes: { shieldRecoveryRate: 'increased' } },
  ]));
  near(equipment.getDerivedStats().shieldRechargeDelay, 4);
  near(equipment.getDerivedStats().cooldownReduction, 0);
  near(equipment.getDerivedStats({ shieldRecoveryRate: 100 }).shieldRechargeDelay, 2.5);
});

test('leech recovers over time with a rate cap and can be cleared on run change', () => {
  const player = new Player();
  player.health = 50;
  player.leech(99999);
  player.update(1, 1);
  near(player.health, 55);
  player.clearRecovery();
  player.update(1, 2);
  near(player.health, 55);
});

test('zero crit remains zero and excessive crit cannot bypass the shared cap', () => {
  fixedRandom(0.01, () => assert.equal(CombatSystem.rollDamage(10, 0, 2, 0, 1).crit, false));
  fixedRandom(0.7, () => assert.equal(CombatSystem.rollDamage(10, 99, 2, 0, 1).crit, false));
});
