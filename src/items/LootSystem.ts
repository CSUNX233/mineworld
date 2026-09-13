import { bossWeaponForBoss } from '../data/BossWeapons';
import { RNG } from '../utils/RNG';
import { monsterLootWeights, monsterItemChance, deathReaperBossChance } from '../data/MonsterLoot';
import type { EquipmentMechanismTag } from './RewardPreference';
import type { Item, MonsterDefinition, Rarity, MaterialId } from '../types';
import { materialPool } from './MaterialEconomy';
import type { ArchetypeId } from '../progression/types';
import { ItemGenerator } from './ItemGenerator';

export type LootDrop =
  | { kind: 'gold'; amount: number }
  | { kind: 'health'; amount: number }
  | { kind: 'mana'; amount: number }
  | { kind: 'reforgeTicket'; amount: number }
  | { kind: 'material'; materialId: MaterialId; amount: number }
  | { kind: 'item'; item: Item };

export class LootSystem {
  static rollLoot(
    monster: MonsterDefinition,
    floor: number,
    luck: number,
    isBoss = false,
    playerLevel: number = floor,
    rewardPreference?: ArchetypeId,
    equipmentRulesVersion = 1,
    mechanism?: EquipmentMechanismTag,
    rng = new RNG((Math.random() * 0xffffffff) >>> 0),
    difficulty: 'normal' | 'hard' = 'normal',
  ): LootDrop[] {
    const drops: LootDrop[] = [];
    drops.push({ kind: 'gold', amount: Math.round((3 + floor * 2 + rng.float() * floor * 4) * (1 + luck / 100)) });

    const healthChance = 0.08 + floor * 0.002;
    const manaChance = 0.06 + floor * 0.002;
    const itemChance = monsterItemChance(floor);

    if (rng.chance(healthChance)) drops.push({ kind: 'health', amount: 20 + floor * 3 });
    if (rng.chance(manaChance)) drops.push({ kind: 'mana', amount: 12 + floor * 2 });
    if (isBoss || rng.chance(0.03)) drops.push({ kind: 'reforgeTicket', amount: isBoss ? 3 : 1 });
    if (isBoss || rng.chance(0.08)) drops.push({kind:'material',materialId:rng.weighted(materialPool(floor)).id,amount:isBoss ? 2 : 1});
    const equipment = (minimum: Rarity) => {
      const rarity = rng.weighted(monsterLootWeights(floor, luck, minimum)).rarity;
      drops.push({ kind: 'item', item: ItemGenerator.generate(floor, rng, playerLevel, rarity, undefined, luck, rewardPreference, false, equipmentRulesVersion, mechanism) });
    };
    if (isBoss) {
      const count = 1 + Math.floor(rng.float() * 3);
      let ordinaryCount = count;
      // One independent roll per boss kill; ordinary luck cannot bypass this exclusive source.
      if (rng.chance(deathReaperBossChance(floor))) {
        ordinaryCount--;
        // One shared pool: half the successful rolls choose this Boss's own weapon.
        const exclusive=bossWeaponForBoss(monster.id) && rng.chance(.5);
        drops.push({kind:'item',item:exclusive ? ItemGenerator.generateBossWeapon(monster.id,floor,rng,playerLevel)
          : ItemGenerator.generateDeathReaper(floor,rng,playerLevel)});
      }
      for (let index = 0; index < ordinaryCount; index++) equipment(floor >= 10 && index > 0 ? 'epic' : 'rare');
    } else {
      if (rng.chance(itemChance)) equipment('common');
      if (difficulty === 'hard' && rng.chance(.005)) {
        const relic: LootDrop = {kind:'item',item:ItemGenerator.generateDeathReaper(floor,rng,playerLevel)};
        const ordinary = drops.findIndex(drop => drop.kind === 'item');
        if (ordinary >= 0) drops[ordinary] = relic;
        else drops.push(relic);
      }
    }
    return drops;
  }
}
