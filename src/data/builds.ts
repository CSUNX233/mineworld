export const BUILDS = [
  { id: 'vanguard', name: '破阵剑术', description: '每第三次近战命中释放前方震荡斩；专精等级提高震荡伤害与护盾。', color: '#ffcd7f' },
  { id: 'arcanist', name: '余烬法术', description: '火球命中后爆燃，灼烧周围敌人；专精等级提高爆燃伤害并缩短火球冷却。', color: '#ff9976' },
  { id: 'summoner', name: '亡者契约', description: '击杀召唤骷髅协战；专精等级提高召唤上限与击杀回蓝。', color: '#b2a0ff' },
] as const;
export type BuildId = typeof BUILDS[number]['id'];
