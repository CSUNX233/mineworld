import type { ElementType, Item, StatMap } from '../types';

export interface BossWeaponDefinition {
  id: string; bossId: string; bossName: string; name: string; setId: string; setName: string;
  icon: string; slot: 'weapon'; element: ElementType; baseStats: StatMap; effect: string; flavor: string;
}
/** Exclusive identities. Never add these to ordinary equipment or shop base pools. */
export const BOSS_WEAPONS: readonly BossWeaponDefinition[] = [
  { id:'boss_oath', bossId:'oath_gatekeeper', bossName:'断誓门卫', name:'断誓·门扉大剑', setId:'relic_oath', setName:'门前最后的誓言', icon:'oath', slot:'weapon', element:'physical', baseStats:{attack:42,attackSpeed:1.1,defense:5}, effect:'直接命中蓄积3次破誓（每0.25秒至多1次），释放180%攻击的重击并减速主目标1.2秒；获得最大生命8%的护盾。冷却3秒。', flavor:'门后早已空无一人，他却仍不肯放下剑。' },
  { id:'boss_furnace', bossId:'furnace_regent', bossName:'铸炉执政官', name:'赤炉·执政战锤', setId:'relic_furnace', setName:'永不熄灭的总炉', icon:'furnace', slot:'weapon', element:'fire', baseStats:{attack:44,attackSpeed:1.05,strength:6}, effect:'实际耗蓝施法后蓄满炉压，下一次直接命中对目标周围至多3名敌人各造成90%攻击的火焰爆震。冷却3秒；离开战斗失去炉压。', flavor:'最后一位铸工化作炉灰时，开工的钟声又响了。' },
  { id:'boss_bell', bossId:'bellkeeper', bossName:'末代司钟人', name:'回葬·司钟法杖', setId:'relic_bell', setName:'迟来的第二声钟', icon:'bell', slot:'weapon', element:'frost', baseStats:{attack:40,attackSpeed:1.15,maxMana:24}, effect:'直接命中留下葬钟回响，0.65秒后对仍在附近的原目标追加180%攻击的冰霜伤害，并减速1.5秒。冷却3秒；不追击已死亡或离开房间的目标。', flavor:'若你听见第二声钟，请不要回头确认第一声为谁而鸣。' },
  { id:'boss_abyss', bossId:'boss', bossName:'深渊领主', name:'深瞳·领主法杖', setId:'relic_abyss', setName:'深渊的三次凝视', icon:'abyss', slot:'weapon', element:'shadow', baseStats:{attack:40,attackSpeed:1.15,critChance:.06}, effect:'直接命中后向原目标发出三次暗影追击，间隔0.18秒，每次60%攻击；目标死亡时转向同房间附近敌人。冷却3秒；追击不会触发装备连锁。', flavor:'它闭上了一只眼，余下的黑暗便有了形状。' },
  { id:'boss_warden', bossId:'ruins_warden', bossName:'遗迹监守者', name:'封界·监守长钺', setId:'relic_warden', setName:'无人获准离去', icon:'warden', slot:'weapon', element:'physical', baseStats:{attack:42,attackSpeed:1.1,armor:10}, effect:'战斗中实际移动4米蓄满镇印，下一次直接命中对附近至多3名敌人各造成90%攻击的镇压波并减速1秒。冷却3秒；离开战斗清空镇印。', flavor:'废墟不再需要守卫，守卫却仍需要一个囚徒。' },
];
export const bossWeaponDefinition = (id: string | undefined): BossWeaponDefinition | undefined => BOSS_WEAPONS.find(w=>w.id===id);
export const bossWeaponForBoss = (id: string): BossWeaponDefinition | undefined => BOSS_WEAPONS.find(w=>w.bossId===id);
export function equippedBossWeapon(items: readonly Item[]): BossWeaponDefinition | undefined {
  const item=items.find(i=>i.slot==='weapon');
  const def=bossWeaponDefinition(item?.contentId);
  return item?.rarity==='mythic' && item.setId===def?.setId ? def : undefined;
}
