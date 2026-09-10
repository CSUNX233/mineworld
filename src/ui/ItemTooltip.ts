import type { Item, Stat } from '../types';
import { UI_RARITY_COLORS as RARITY_COLORS } from './UiAssets';
import { setDisplayName } from '../data/sets';
import { statLabel, formatValue, AffixSystem } from '../items/AffixSystem';
import { iconHTML, itemIconHTML } from './UiAssets';

function itemTotals(item: Item): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const [stat, value] of Object.entries(item.baseStats)) {
    totals[stat] = (totals[stat] ?? 0) + value;
  }
  item.affixes.forEach((affix) => {
    for (const [stat, value] of Object.entries(affix.values)) {
      totals[stat] = (totals[stat] ?? 0) + value;
    }
  });
  return totals;
}

function compareHTML(item: Item, equipped: Item): string {
  if (item.id === equipped.id) return '';
  const itemStats = itemTotals(item);
  const equippedStats = itemTotals(equipped);
  const keys = new Set([...Object.keys(itemStats), ...Object.keys(equippedStats)]);
  const rows: string[] = [];
  keys.forEach((stat) => {
    const current = itemStats[stat] ?? 0;
    const previous = equippedStats[stat] ?? 0;
    const diff = current - previous;
    const state = diff > 0 ? 'is-better' : diff < 0 ? 'is-worse' : 'is-even';
    const sign = diff > 0 ? '+' : '';
    rows.push(
      `<div class="item-tooltip-compare-row">${statLabel(stat as Stat)} <span class="item-tooltip-delta ${state}">${sign}${formatValue(stat as Stat, current)}</span> <span class="item-tooltip-previous">/ ${formatValue(stat as Stat, previous)}</span></div>`,
    );
  });
  return `<div class="item-tooltip-compare-title">与当前装备对比</div>${rows.join('')}`;
}

export function itemTooltipHTML(item: Item, equipped?: Item | null): string {
  const color = RARITY_COLORS[item.rarity];
  const baseStats = Object.entries(item.baseStats)
    .map(([stat, value]) => `<div>${statLabel(stat as never)} <span class="item-tooltip-stat">+${formatValue(stat as never, value)}</span></div>`)
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
