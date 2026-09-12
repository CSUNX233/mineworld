import { BOSS_WEAPONS } from './BossWeapons';
import type { StatMap, StatValueModes } from '../types';

export interface SetBonusDef {
  stats: StatMap;
  valueModes?: StatValueModes;
  special?: string;
  description?: string;
}

export interface SetDefinition {
  id: string;
  name: string;
  bonuses: Record<number, SetBonusDef>;
  tags?: string[];
  lore?: string;
}

export const SETS: Record<string, SetDefinition> = {
  warlord: {
    id: 'warlord',
    name: '战争领主',
    bonuses: {
      2: { stats: { attack: 8, maxHealth: 24 } },
      4: { stats: { armor: 10, critDamage: 0.2 }, valueModes: { critDamage: 'increased' } },
    },
  },
  frost: {
    id: 'frost',
    name: '霜语者',
    bonuses: {
      2: { stats: { maxHealth: 20, armor: 5 } },
      3: { stats: { attackSpeed: 0.08 }, valueModes: { attackSpeed: 'increased' } },
    },
  },
  shadow: {
    id: 'shadow',
    name: '暗影行者',
    bonuses: {
      2: {
        stats: { critChance: 0.35, moveSpeed: 0.05 },
        valueModes: { critChance: 'increased', moveSpeed: 'increased' },
      },
    },
  },
  warbringer: {
    id: 'warbringer',
    name: '破军',
    bonuses: {
      2: { stats: { critChance: 0.25, attack: 6 }, valueModes: { critChance: 'increased' } },
      4: {
        stats: { critDamage: 0.35, attackSpeed: 0.05 },
        valueModes: { critDamage: 'increased', attackSpeed: 'increased' },
      },
      6: {
        stats: { attack: 14, critChance: 0.3 },
        valueModes: { critChance: 'increased' },
        special: 'executeFullHealth',
      },
    },
  },
  inferno: {
    id: 'inferno',
    name: '炼狱',
    bonuses: {
      2: { stats: { attack: 5 }, special: 'burnMastery' },
      4: { stats: { maxMana: 18, manaRegen: 1.2 } },
      6: { stats: { attack: 12 }, special: 'fireTrail' },
    },
  },
  glacier: {
    id: 'glacier',
    name: '永冻',
    bonuses: {
      2: { stats: { maxHealth: 18, armor: 4 } },
      4: { stats: { moveSpeed: 0.04 }, valueModes: { moveSpeed: 'increased' }, special: 'freezeMastery' },
      6: { stats: { maxMana: 20, manaRegen: 1.5 }, special: 'glacialNova' },
    },
  },
  venom: {
    id: 'venom',
    name: '疫毒',
    bonuses: {
      2: { stats: { attack: 4 }, special: 'poisonMastery' },
      4: { stats: { killHeal: 2, maxHealth: 16 } },
      6: { stats: { attack: 10 }, special: 'summonSkeletonOnKill' },
    },
  },
  sanguine: {
    id: 'sanguine',
    name: '血裔',
    bonuses: {
      2: { stats: { lifeSteal: 0.03, maxHealth: 14 }, valueModes: { lifeSteal: 'flat' } },
      4: { stats: { armor: 8, killHeal: 3 } },
      6: { stats: { lifeSteal: 0.05 }, valueModes: { lifeSteal: 'flat' }, special: 'lowHealthShield' },
    },
  },
  storm: {
    id: 'storm',
    name: '风暴',
    bonuses: {
      2: {
        stats: { attackSpeed: 0.05, moveSpeed: 0.03 },
        valueModes: { attackSpeed: 'increased', moveSpeed: 'increased' },
      },
      4: { stats: { critChance: 0.3 }, valueModes: { critChance: 'increased' }, special: 'shockMastery' },
      6: {
        stats: { attack: 8, attackSpeed: 0.07 },
        valueModes: { attackSpeed: 'increased' },
        special: 'chainLightning',
      },
    },
  },
};

/** New runs use these mechanisms; legacy items continue resolving against SETS. */
export const P5_SETS: Record<string, SetDefinition> = {
  death_reaper: {
    id: 'death_reaper', name: '死亡收割', tags: ['melee', 'shadow', 'summon', 'resource'],
    lore: '九件葬仪遗物分散在亡者手中。镰、冕、衣、缚、靴、双戒、沙漏与魂灯重聚时，佩戴者成为死者名册上的最后一行。',
    bonuses: {
      2: { stats: { attack: .2, maxHealth: .15 }, valueModes: { attack: 'increased', maxHealth: 'increased' }, special: 'death_reaper_2', description: '两件不同遗物：攻击提高20%、生命提高15%；魂上限12，击杀积魂提高，直接命中也能在纯Boss战积魂。' },
      4: { stats: { armor: 16, cooldown: .1 }, special: 'death_reaper_4', description: '四件不同遗物：每3次直接命中积2魂；镰波、魂波、追击与魂爆最多目标数增加2。' },
      6: { stats: { attackSpeed: .2, moveSpeed: .1 }, valueModes: { attackSpeed: 'increased', moveSpeed: 'increased' }, special: 'death_reaper_6', description: '六件不同遗物：所有遗物追加伤害提高30%；击杀额外积1魂，收割斩生命门槛提高至25%。' },
      9: { stats: { attack: .45, maxHealth: .3, critDamage: .3 }, valueModes: { attack: 'increased', maxHealth: 'increased', critDamage: 'increased' }, special: 'death_reaper_9', description: '九件不同遗物：积满9魂自动消耗并化身死神6秒（冷却20秒）；每秒向至多6敌人挥出250%攻击的大镰波，期间遗物伤害再提高50%，收割斩门槛提高至35%。' },
    },
  },
  warlord: {
    id: 'warlord', name: '战争领主', tags: ['melee', 'defense'],
    lore: '旧王已死，守门者仍未后退。每一道挡下刀锋的裂痕，都在甲胄深处积成沉默的怒意，等待下一记重击将它归还。',
    bonuses: {
      2: { stats: {}, special: 'p5_warlord_2', description: '需「战意」天赋授予架势反击：成功反击命中积累壁垒，下一次有效近战命中消耗壁垒追加伤害；空放不积累。' },
      4: { stats: {}, special: 'p5_warlord_4', description: '需旋风斩、裂地终结或余烬斩等重击技能：重击消耗壁垒时同时获得短时护盾；壁垒只能消耗一次。' },
    },
  },
  warbringer: {
    id: 'warbringer', name: '破军', tags: ['melee'],
    lore: '这副战甲曾踏过十二座城门。它记得每一次凿击，也记得城墙倾塌前的寂静；当最后一击落下，大地会替亡者再叩一次门。',
    bonuses: {
      2: { stats: {}, special: 'p5_warbringer_2', description: '需旋风斩等重击技能，或「战意」天赋授予裂地终结：有效近战命中积累破阵，三层后的重击消耗破阵追加伤害与短暂压制；打空气不能攒层。' },
      4: { stats: {}, special: 'p5_warbringer_4', description: '消耗破阵的重击带延迟范围余震；群体分摊总伤害预算，余震不触发装备连锁。' },
    },
  },
  frost: {
    id: 'frost', name: '霜语者', tags: ['frost', 'resource'],
    lore: '北境的祈祷早已无人回应，只有霜仍在低语。聆听者将寒息藏进胸腔，以冰霜续写咒文，让下一道法术从将熄的灵火中醒来。',
    bonuses: {
      2: { stats: {}, special: 'p5_frost_2', description: '装备授予冰霜新星，卸下不足两件时移除装备来源。冰霜直接命中追加伤害与减速并积累寒息；下一次耗蓝主动技能消耗寒息返还部分实付法力。' },
      4: { stats: {}, special: 'p5_frost_4', description: '消耗寒息后，下一次非冰霜直接命中附带附近短暂减速，鼓励交替施法；返还法力不能再次返还。' },
    },
  },
  shadow: {
    id: 'shadow', name: '暗影行者', tags: ['melee'],
    lore: '行刑者找到了足迹，却从未找到它的主人。穿上这身遗衣的人不在原地停留；刀锋掠过之后，留在黑暗中的影子还会再杀一次。',
    bonuses: {
      2: { stats: {}, special: 'p5_shadow_2', description: '战斗中累计移动三米获得一次掠影，下一次直接攻击命中消耗掠影追加同元素伤害；原地静止不能积累。' },
      4: { stats: {}, special: 'p5_shadow_4', description: '掠影命中留下延迟残影攻击，继承该次元素；残影不触发新一轮装备连锁。' },
    },
  },
  inferno: {
    id: 'inferno', name: '炼狱', tags: ['fire'],
    lore: '火刑架烧尽了信徒，却没能烧尽他们的诅咒。余火沿伤口寻找下一具躯壳，穿戴者走过的石阶，也会记住炼狱的温度。',
    bonuses: {
      2: { stats: {}, special: 'p5_inferno_2', description: '直接攻击命中燃烧目标时，按冷却向附近敌人传播预算内燃烧；没有邻近敌人时作用于原目标，首领也能启动。' },
      4: { stats: {}, special: 'p5_inferno_4', description: '战斗中移动触发近身火径，按冷却点燃最近敌人；传播可覆盖更多目标，群体分摊总伤害预算。' },
    },
  },
  glacier: {
    id: 'glacier', name: '永冻', tags: ['frost', 'defense'],
    lore: '冰原之下封着一场尚未结束的战争。每一道寒伤都让古老冰层更深一分，直到咒印碎裂，将迟来的毁灭倾入敌人的血肉。',
    bonuses: {
      2: { stats: {}, special: 'p5_glacier_2', description: '装备授予冰霜新星，卸下不足两件时移除装备来源。直接命中受寒冷影响的敌人积累碎冰，主动冰霜命中消耗碎冰形成延迟碎片伤害。' },
      4: { stats: {}, special: 'p5_glacier_4', description: '碎冰消耗扩大为延迟范围破裂，群体分摊伤害；首领使用寒冷减速窗口，不能永久冻结。' },
    },
  },
  venom: {
    id: 'venom', name: '疫毒', tags: ['poison', 'summon'],
    lore: '瘟疫医师最后留下的药方，写在一具仍会行走的尸体上。毒液孕育疫骸，疫骸归于腐雾；死亡只是病灶换了一副面孔。',
    bonuses: {
      2: { stats: {}, special: 'p5_venom_2', description: '毒元素直接命中或攻击中毒目标推进孵化，并附带预算内毒伤；达到阈值产生短命疫骸，首领也能靠攻击启动。' },
      4: { stats: {}, special: 'p5_venom_4', description: '疫骸占共同召唤容量并参与有限毒传播；死亡或到期释放有上限的毒雾，毒雾不能孵化下一代。' },
    },
  },
  sanguine: {
    id: 'sanguine', name: '血裔', tags: ['melee', 'defense'],
    lore: '血裔从不向神祈求第二次呼吸。他们夺回流失的鲜血，将血契缝进伤口；当心跳渐弱，那层猩红的庇护便收紧如棺。',
    bonuses: {
      2: { stats: {}, special: 'p5_sanguine_2', description: '实际吸血恢复积累血契，下一次主动技能消耗血契获得短时护盾与近身伤害；满血空吸不积累。' },
      4: { stats: {}, special: 'p5_sanguine_4', description: '低血时触发有冷却的紧急护盾；血契伤害可分摊给附近多个敌人，护盾与恢复受共享预算限制。' },
    },
  },
  storm: {
    id: 'storm', name: '风暴', tags: ['lightning'],
    lore: '被绞死的观星者将雷声锁进了铁环。每一次击中都唤醒一缕躁动的电光，直到咒令落下，所有欠下的轰鸣一同索命。',
    bonuses: {
      2: { stats: {}, special: 'p5_storm_2', description: '装备授予闪电链，卸下不足两件时移除装备来源。直接命中积累电荷，三层后的主动技能消耗电荷释放有限放电；持续伤害、装备连锁与召唤不充电。' },
      4: { stats: {}, special: 'p5_storm_4', description: '少目标时集中放电，多目标时分配电荷；单体总伤害封顶，放电不触发装备连锁。' },
    },
  },
  soul_banner: {
    id: 'soul_banner', name: '魂旗军团', tags: ['summon', 'defense'],
    lore: '军旗腐朽之后，点名仍在继续。白骨执刃，亡魂引弓，沉默的护卫补上缺口；只要旗帜未倒，死者便不被准许溃散。',
    bonuses: {
      2: { stats: {}, special: 'p5_soul_banner_2', description: '需「魂契」天赋授予亡者编队：指令集火标记后，战士与射手交替实际命中推进协同，达成时追加伤害；重复标记不领奖。' },
      4: { stats: {}, special: 'p5_soul_banner_4', description: '需「魂契」天赋与含护卫的编队：护卫也参与该轮协同时提供短时掩护护盾，帮助维持编队；不免费增加单位。' },
    },
  },
  soul_pyre: {
    id: 'soul_pyre', name: '烬祭', tags: ['summon', 'fire', 'resource'],
    lore: '祭司将战士、守卫与射手的名字逐一投入灵火。献祭者借余烬重整亡者的行列，却再也分不清旗下降临的是故人，还是饥饿的火。',
    bonuses: {
      2: { stats: {}, special: 'p5_soul_pyre_2', description: '需「魂契」天赋授予灵魂献祭与亡者编队：主动献祭记录消耗角色，下一次真实耗蓝补编得到对应一次伤害、护盾或法力支援；清理、换层与到期不算献祭。' },
      4: { stats: {}, special: 'p5_soul_pyre_4', description: '需亡者编队中三类单位：完成战士、护卫、射手三种献祭并补编后，接下来的编队命中获得有限魂火伤害；支援不无限返还资源。' },
    },
  },
  embersteel: {
    id: 'embersteel', name: '烬钢', tags: ['melee', 'fire'],
    lore: '铸匠以刑场余烬淬刃，将未尽的火咒锻进钢中。刀锋撕开灼伤时，潜藏的烈焰骤然迸裂；咒火与近身斩击由此共用一道伤口。',
    bonuses: {
      2: { stats: {}, special: 'p5_embersteel_2', description: '有效近战命中燃烧目标时，按冷却消耗部分现有燃烧转为立即火焰爆发；被转移的燃烧伤害只结算一次。' },
      4: { stats: {}, special: 'p5_embersteel_4', description: '需火球术、燃烧裂隙或焚火引爆等主动火焰技能：施放火焰后近战命中燃烧目标，释放有限范围热刃波；热刃波不触发装备连锁。' },
    },
  },
};


/** All twelve complete sets receive the same stat and secondary-damage allowance.
 * Their trigger shapes differ; the shared support allowance never scales with target count. */
export const P5_NINE_DESCRIPTIONS: Record<string, string> = {
  warlord: '完整九件：攻击、生命提高8%；有效反击储存两次壁垒，后续两次近战产生范围反震，重击仍提供共享预算内护盾。',
  warbringer: '完整九件：攻击、生命提高8%；破阵重击释放三段范围余震，覆盖六个目标；三段共同分摊一次伤害预算。',
  frost: '完整九件：攻击、生命提高8%；寒息上限六层，实付法力返还上限提高至30%；耗蓝消耗寒息后，接下来三次非冰霜直接命中产生范围寒尾伤害与减速。',
  shadow: '完整九件：攻击、生命提高8%；战斗移动2.5米准备掠影，命中留下两道继承元素的范围残影；两道共同分摊一次伤害预算。',
  inferno: '完整九件：攻击、生命提高8%；火径最多六处、持续4.5秒、生成冷却0.75秒，扩大灼烧范围；所有火径与传播共用伤害预算。',
  glacier: '完整九件：攻击、生命提高8%；碎冰上限六层，消耗形成三段大范围冰裂，覆盖六个目标；寒冷窗口与伤害预算限制仍生效。',
  venom: '完整九件：攻击、生命提高8%；一次孵化最多三具疫骸，逐只检查共同容量，有限毒雾可覆盖六个目标；孵化失败不消耗冷却。',
  sanguine: '完整九件：攻击、生命提高8%；血契技能形成两段近身血潮，并准备三次实际吸血转盾；满血空吸不触发，护盾仍受共享预算限制。',
  storm: '完整九件：攻击、生命提高8%；电荷上限九层，主动技能消耗已积电荷释放三段远距放电，覆盖六个目标；三段总伤害共用预算。',
  soul_banner: '完整九件：攻击、生命提高8%；战士、射手、护卫三类实际集火命中齐备时释放两轮范围齐射与掩护护盾；重复角色不能替代缺失角色。',
  soul_pyre: '完整九件：攻击、生命提高8%；可分别保留三类主动献祭，耗蓝补编每次消耗一类；完整三类循环奖励六次范围魂火，资源支援仍有共享上限。',
  embersteel: '完整九件：攻击、生命提高8%；近战可转移最多1.2秒现有燃烧，主动火焰准备三次双段范围热刃波；被转移伤害只结算一次。',
};
for (const [id, description] of Object.entries(P5_NINE_DESCRIPTIONS)) {
  P5_SETS[id].bonuses[9] = { stats: { attack: .08, maxHealth: .08 }, valueModes: { attack: 'increased', maxHealth: 'increased' }, special: `p5_${id}_9`, description };
}

for (const weapon of BOSS_WEAPONS) {
  P5_SETS[weapon.setId]={id:weapon.setId,name:weapon.setName,lore:weapon.flavor,tags:['boss-relic'],
    bonuses:{1:{stats:{},description:weapon.effect}}};
}

export function setDefinition(id: string, equipmentRulesVersion = 1): SetDefinition | undefined {
  return (equipmentRulesVersion >= 2 ? P5_SETS : SETS)[id];
}

export function setDisplayName(id: string): string {
  return P5_SETS[id]?.name ?? SETS[id]?.name ?? id;
}
