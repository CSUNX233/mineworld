import type { Item, Stat, StatMap } from '../types';
import { UI_RARITY_COLORS as RARITY_COLORS } from './UiAssets';
import { setDisplayName } from '../data/sets';
import { statLabel, formatValue, AffixSystem } from '../items/AffixSystem';
import { baseDefenseFromArmor, defaultAffixValueMode, statValueMode } from '../items/StatRules';
import { iconHTML, itemIconHTML } from './UiAssets';

interface ItemContributions {
  baseAttackSpeed: number | null;
  base: StatMap;
  flat: StatMap;
  increased: StatMap;
}

const RATE_STATS: Stat[] = ['attackSpeed', 'critChance', 'critDamage', 'moveSpeed', 'lifeSteal', 'cooldown', 'shieldRecoveryRate'];

function displayedBaseStats(item: Item): StatMap {
  const stats = { ...item.baseStats };
  if (stats.defense === undefined && (stats.armor ?? 0) > 0) {
    stats.defense = baseDefenseFromArmor(stats.armor);
  }
  return stats;
}

function itemContributions(item: Item): ItemContributions {
  const result: ItemContributions = { baseAttackSpeed: null, base: {}, flat: {}, increased: {} };
  const add = (mode: 'base' | 'flat' | 'increased', stat: Stat, value: number): void => {
    result[mode][stat] = (result[mode][stat] ?? 0) + value;
  };
  for (const [rawStat, value] of Object.entries(displayedBaseStats(item))) {
    const stat = rawStat as Stat;
    if (stat === 'attackSpeed' && item.slot === 'weapon') result.baseAttackSpeed = value;
    else add(stat === 'attackSpeed' ? 'increased' : 'base', stat, value);
  }
  item.affixes.forEach((affix) => {
    for (const [rawStat, value] of Object.entries(affix.values)) {
      const stat = rawStat as Stat;
      add(statValueMode(stat, affix.valueModes, defaultAffixValueMode(stat)), stat, value);
    }
  });
  return result;
}

function compareHTML(item: Item, equipped: Item): string {
  if (item.id === equipped.id) return '';
  const itemStats = itemContributions(item);
  const equippedStats = itemContributions(equipped);
  const rows: string[] = [];
  const attackSpeedDiff = (itemStats.baseAttackSpeed ?? 1) - (equippedStats.baseAttackSpeed ?? 1);
  if (item.slot === 'weapon' && Math.abs(attackSpeedDiff) > 0.0001) {
    const state = attackSpeedDiff > 0 ? 'is-better' : 'is-worse';
    rows.push(`<div class="item-tooltip-compare-row">基础攻速 <span class="item-tooltip-delta ${state}">${attackSpeedDiff > 0 ? '+' : ''}${attackSpeedDiff.toFixed(2)}/s</span></div>`);
  }
  for (const mode of ['base', 'flat', 'increased'] as const) {
    const keys = new Set<Stat>([
      ...(Object.keys(itemStats[mode]) as Stat[]),
      ...(Object.keys(equippedStats[mode]) as Stat[]),
    ]);
    keys.forEach((stat) => {
      const diff = (itemStats[mode][stat] ?? 0) - (equippedStats[mode][stat] ?? 0);
      if (Math.abs(diff) <= 0.0001) return;
      const state = diff > 0 ? 'is-better' : 'is-worse';
      const label = mode === 'base' ? '装备基础' : mode === 'increased' ? '提高词条' : RATE_STATS.includes(stat) ? '绝对词条' : '固定词条';
      const formatted = mode === 'increased' ? `${Math.round(diff * 100)}%` : formatValue(stat, diff);
      rows.push(`<div class="item-tooltip-compare-row">${statLabel(stat)}（${label}） <span class="item-tooltip-delta ${state}">${diff > 0 ? '+' : ''}${formatted}</span></div>`);
    });
  }
  return `<div class="item-tooltip-compare-title">与当前装备的词条量对比</div>${rows.join('') || '<div class="item-tooltip-compare-row">同类词条量相同</div>'}`;
}

function baseStatHTML(item: Item, stat: Stat, value: number): string {
  if (stat === 'attackSpeed' && item.slot === 'weapon') {
    return `<div>基础攻速 <span class="item-tooltip-stat">${value.toFixed(2)}/s</span></div>`;
  }
  if (stat === 'attackSpeed') {
    return `<div>${statLabel(stat)} <span class="item-tooltip-stat">提高 ${Math.round(value * 100)}%</span></div>`;
  }
  const suffix = RATE_STATS.includes(stat) ? '（绝对）' : '';
  return `<div>基础${statLabel(stat)} <span class="item-tooltip-stat">+${formatValue(stat, value)}${suffix}</span></div>`;
}

export function itemTooltipHTML(item: Item, equipped?: Item | null): string {
  const color = RARITY_COLORS[item.rarity];
  const baseStats = Object.entries(displayedBaseStats(item))
    .map(([stat, value]) => baseStatHTML(item, stat as Stat, value))
    .join('');
  const affixes = item.affixes
    .map((affix) => `<div style="color:${color}">${affix.name} · ${AffixSystem.describe(affix)}</div>`)
    .join('');
  const comparison = equipped ? compareHTML(item, equipped) : '';
  return `
    <div class="item-tooltip-card">
      <div class="item-tooltip-heading">
        <span class="item-tooltip-icon-frame">${itemIconHTML(item, 'item-tooltip-icon')}</span>
        <div>
          <div class="item-tooltip-name" style="color:${color}">${item.name}</div>
          <div class="item-tooltip-level">等级需求 ${item.requiredLevel}</div>
        </div>
      </div>
      ${item.setId ? `<div class="item-tooltip-set">套装：${setDisplayName(item.setId)}</div>` : ''}
      <div class="item-tooltip-stats">${baseStats}${affixes}</div>
      ${item.flavor ? `<div class="item-tooltip-flavor">「${item.flavor}」</div>` : ''}
      ${comparison}
      <div class="item-tooltip-price">${iconHTML('coin', 'item-tooltip-coin')}<span>售价 ${item.sellPrice} 金币</span></div>
    </div>
  `;
}
