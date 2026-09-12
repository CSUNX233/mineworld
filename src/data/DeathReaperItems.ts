import type { Item, Slot, StatMap } from '../types';

export const DEATH_REAPER_SET = 'death_reaper';
export interface DeathReaperItemDefinition {
  id: string; name: string; slot: Slot; icon: string; baseStats: StatMap; effect: string; flavor: string;
}

/** Nine identities, including two different rings; ordinary base pools never contain these. */
export const DEATH_REAPER_ITEMS: readonly DeathReaperItemDefinition[] = [
  { id: 'death_reaper_scythe', name: '冥河收割镰', slot: 'weapon', icon: 'death_reaper_scythe', baseStats: { attack: 42, attackSpeed: 1.15, critChance: .06 }, effect: '三次有效直接命中释放镰波：对附近至多3名敌人各造成150%攻击的暗影伤害，冷却1.5秒。', flavor: '镰刃不问来处，只问名字是否仍被人记住。' },
  { id: 'death_reaper_crown', name: '渡魂冕', slot: 'helmet', icon: 'death_reaper_crown', baseStats: { maxHealth: 42, armor: 8, maxMana: 24 }, effect: '实际耗蓝施法消耗1魂，返还实付法力的30%（至多最大法力20%），冷却3秒；不从返还法力再次触发。', flavor: '冠冕中的低语，替亡者数完最后一口呼吸。' },
  { id: 'death_reaper_shroud', name: '断命丧衣', slot: 'chest', icon: 'death_reaper_shroud', baseStats: { maxHealth: 70, armor: 14, lifeRegen: 1.5 }, effect: '实际受伤后获得最大生命15%的护盾并释放100%攻击的近身魂波，至多3目标，冷却8秒。', flavor: '葬衣已被刀锋穿透，穿衣者却仍在行走。' },
  { id: 'death_reaper_bindings', name: '祭骨缚腿', slot: 'legs', icon: 'death_reaper_bindings', baseStats: { maxHealth: 48, armor: 10, strength: 8 }, effect: '战斗中静止1.2秒蓄势，下一次直接命中追加200%攻击的暗影伤害并减速1.2秒，蓄势冷却3秒。', flavor: '跪下的是过去，站起的是尚未完成的葬仪。' },
  { id: 'death_reaper_steps', name: '越冥靴', slot: 'boots', icon: 'death_reaper_steps', baseStats: { maxHealth: 30, armor: 6, moveSpeed: .12 }, effect: '战斗中实际移动4米积满越冥，下一次直接命中追击并对附近至多3目标各造成90%攻击的暗影伤害，冷却2秒。', flavor: '每一步都跨过一块尚未刻字的墓碑。' },
  { id: 'death_reaper_harvest_ring', name: '摄魂指环·戒指1', slot: 'ring', icon: 'death_reaper_harvest_ring', baseStats: { attack: 10, lifeSteal: .035, critChance: .04 }, effect: '直接命中生命不高于20%的敌人时追加160%攻击的收割斩，冷却1.5秒；Boss同样有效。', flavor: '指环没有内侧，握住的永远是下一位死者。' },
  { id: 'death_reaper_echo_ring', name: '回葬指环·戒指2', slot: 'ring2', icon: 'death_reaper_echo_ring', baseStats: { attack: 10, critDamage: .25, maxMana: 20 }, effect: '直接命中留下0.35秒后重击的残响，造成该次实际伤害70%（至多300%攻击），冷却2秒；残响不再触发装备连锁。', flavor: '第一声钟响送人远去，第二声召回未尽的誓言。' },
  { id: 'death_reaper_hourglass', name: '终息沙漏', slot: 'necklace', icon: 'death_reaper_hourglass', baseStats: { maxHealth: 38, cooldown: .1, manaRegen: 2 }, effect: '实际耗蓝施法消耗2魂，向附近至多4目标各释放220%攻击的魂爆，冷却4秒。', flavor: '沙漏向上流动，唯有终息仍在坠落。' },
  { id: 'death_reaper_lantern', name: '引魂灯', slot: 'offhand', icon: 'death_reaper_lantern', baseStats: { maxHealth: 50, armor: 11, intelligence: 10 }, effect: '有敌人时每3秒消耗1魂，魂灯自动对一名敌人造成160%攻击的暗影伤害；真实召唤命中也可每秒积1魂。', flavor: '灯中没有火，只有一道愿意为你引路的名字。' },
];

export function deathReaperDefinition(id: string | undefined): DeathReaperItemDefinition | undefined {
  return DEATH_REAPER_ITEMS.find(item => item.id === id);
}

export function deathReaperIdentities(items: readonly Item[]): Set<string> {
  return new Set(items.filter(item => item.setId === DEATH_REAPER_SET && item.rarity === 'mythic'
    && deathReaperDefinition(item.contentId)?.slot === item.slot).map(item => item.contentId!));
}
