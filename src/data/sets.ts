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
  runtimeHint?: string;
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
  warlord: {
    id: 'warlord', name: '战争领主', tags: ['melee', 'defense'],
    bonuses: {
      2: { stats: {}, special: 'p5_warlord_2', description: '需「战意」天赋授予架势反击：成功反击命中积累壁垒，下一次有效近战命中消耗壁垒追加伤害；空放不积累。' },
      4: { stats: {}, special: 'p5_warlord_4', description: '需旋风斩、裂地终结或余烬斩等重击技能：重击消耗壁垒时同时获得短时护盾；壁垒只能消耗一次。' },
    },
  },
  warbringer: {
    id: 'warbringer', name: '破军', tags: ['melee'],
    bonuses: {
      2: { stats: {}, special: 'p5_warbringer_2', description: '需旋风斩等重击技能，或「战意」天赋授予裂地终结：有效近战命中积累破阵，三层后的重击消耗破阵追加伤害与短暂压制；打空气不能攒层。' },
      4: { stats: {}, special: 'p5_warbringer_4', description: '消耗破阵的重击带延迟范围余震；群体分摊总伤害预算，余震不触发装备连锁。' },
    },
  },
  frost: {
    id: 'frost', name: '霜语者', tags: ['frost', 'resource'],
    bonuses: {
      2: { stats: {}, special: 'p5_frost_2', description: '装备授予冰霜新星，卸下不足两件时移除装备来源。冰霜直接命中追加伤害与减速并积累寒息；下一次耗蓝主动技能消耗寒息返还部分实付法力。' },
      4: { stats: {}, special: 'p5_frost_4', description: '消耗寒息后，下一次非冰霜直接命中附带附近短暂减速，鼓励交替施法；返还法力不能再次返还。' },
    },
  },
  shadow: {
    id: 'shadow', name: '暗影行者', tags: ['melee'],
    bonuses: {
      2: { stats: {}, special: 'p5_shadow_2', description: '战斗中累计移动三米获得一次掠影，下一次直接攻击命中消耗掠影追加同元素伤害；原地静止不能积累。' },
      4: { stats: {}, special: 'p5_shadow_4', description: '掠影命中留下延迟残影攻击，继承该次元素；残影不触发新一轮装备连锁。' },
    },
  },
  inferno: {
    id: 'inferno', name: '炼狱', tags: ['fire'],
    bonuses: {
      2: { stats: {}, special: 'p5_inferno_2', description: '直接攻击命中燃烧目标时，按冷却向附近敌人传播预算内燃烧；没有邻近敌人时作用于原目标，首领也能启动。' },
      4: { stats: {}, special: 'p5_inferno_4', description: '战斗中移动触发近身火径，按冷却点燃最近敌人；传播可覆盖更多目标，群体分摊总伤害预算。' },
    },
  },
  glacier: {
    id: 'glacier', name: '永冻', tags: ['frost', 'defense'],
    bonuses: {
      2: { stats: {}, special: 'p5_glacier_2', description: '装备授予冰霜新星，卸下不足两件时移除装备来源。直接命中受寒冷影响的敌人积累碎冰，主动冰霜命中消耗碎冰形成延迟碎片伤害。' },
      4: { stats: {}, special: 'p5_glacier_4', description: '碎冰消耗扩大为延迟范围破裂，群体分摊伤害；首领使用寒冷减速窗口，不能永久冻结。' },
    },
  },
  venom: {
    id: 'venom', name: '疫毒', tags: ['poison', 'summon'],
    bonuses: {
      2: { stats: {}, special: 'p5_venom_2', description: '毒元素直接命中或攻击中毒目标推进孵化，并附带预算内毒伤；达到阈值产生短命疫骸，首领也能靠攻击启动。' },
      4: { stats: {}, special: 'p5_venom_4', description: '疫骸占共同召唤容量并参与有限毒传播；死亡或到期释放有上限的毒雾，毒雾不能孵化下一代。' },
    },
  },
  sanguine: {
    id: 'sanguine', name: '血裔', tags: ['melee', 'defense'],
    bonuses: {
      2: { stats: {}, special: 'p5_sanguine_2', description: '实际吸血恢复积累血契，下一次主动技能消耗血契获得短时护盾与近身伤害；满血空吸不积累。' },
      4: { stats: {}, special: 'p5_sanguine_4', description: '低血时触发有冷却的紧急护盾；血契伤害可分摊给附近多个敌人，护盾与恢复受共享预算限制。' },
    },
  },
  storm: {
    id: 'storm', name: '风暴', tags: ['lightning'],
    bonuses: {
      2: { stats: {}, special: 'p5_storm_2', description: '装备授予闪电链，卸下不足两件时移除装备来源。直接命中积累电荷，三层后的主动技能消耗电荷释放有限放电；持续伤害、装备连锁与召唤不充电。' },
      4: { stats: {}, special: 'p5_storm_4', description: '少目标时集中放电，多目标时分配电荷；单体总伤害封顶，放电不触发装备连锁。' },
    },
  },
  soul_banner: {
    id: 'soul_banner', name: '魂旗军团', tags: ['summon', 'defense'],
    bonuses: {
      2: { stats: {}, special: 'p5_soul_banner_2', description: '需「魂契」天赋授予亡者编队：指令集火标记后，战士与射手交替实际命中推进协同，达成时追加伤害；重复标记不领奖。' },
      4: { stats: {}, special: 'p5_soul_banner_4', description: '需「魂契」天赋与含护卫的编队：护卫也参与该轮协同时提供短时掩护护盾，帮助维持编队；不免费增加单位。' },
    },
  },
  soul_pyre: {
    id: 'soul_pyre', name: '烬祭', tags: ['summon', 'fire', 'resource'],
    bonuses: {
      2: { stats: {}, special: 'p5_soul_pyre_2', description: '需「魂契」天赋授予灵魂献祭与亡者编队：主动献祭记录消耗角色，下一次真实耗蓝补编得到对应一次伤害、护盾或法力支援；清理、换层与到期不算献祭。' },
      4: { stats: {}, special: 'p5_soul_pyre_4', description: '需亡者编队中三类单位：完成战士、护卫、射手三种献祭并补编后，接下来的编队命中获得有限魂火伤害；支援不无限返还资源。' },
    },
  },
  embersteel: {
    id: 'embersteel', name: '烬钢', tags: ['melee', 'fire'],
    bonuses: {
      2: { stats: {}, special: 'p5_embersteel_2', description: '有效近战命中燃烧目标时，按冷却消耗部分现有燃烧转为立即火焰爆发；被转移的燃烧伤害只结算一次。' },
      4: { stats: {}, special: 'p5_embersteel_4', description: '需火球术、燃烧裂隙或焚火引爆等主动火焰技能：施放火焰后近战命中燃烧目标，释放有限范围热刃波；热刃波不触发装备连锁。' },
    },
  },
};

export const P5_SET_RUNTIME_HINT = '每套额外伤害预算：2件每秒最多参考普攻伤害的6%，4件12%；战斗中最多积攒3秒，群体效果分摊总预算。护盾与法力支援分别使用全套装共享的恢复预算。';
Object.values(P5_SETS).forEach(set => { set.runtimeHint = P5_SET_RUNTIME_HINT; });

export function setDefinition(id: string, equipmentRulesVersion = 1): SetDefinition | undefined {
  return (equipmentRulesVersion >= 2 ? P5_SETS : SETS)[id];
}

export function setDisplayName(id: string): string {
  return P5_SETS[id]?.name ?? SETS[id]?.name ?? id;
}
