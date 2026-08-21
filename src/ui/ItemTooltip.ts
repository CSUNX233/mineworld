import type { Item, Stat } from '../types';
import { RARITY_COLORS } from '../data/recipes';
import { setDisplayName } from '../data/sets';
import { statLabel, formatValue, AffixSystem } from '../items/AffixSystem';

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
    const color = diff > 0 ? '#6eff7a' : diff < 0 ? '#ff6b6b' : '#8a95a8';
    const sign = diff > 0 ? '+' : '';
    rows.push(
      `<div>${statLabel(stat as Stat)} <span style="color:${color}">${sign}${formatValue(stat as Stat, current)}</span> <span style="color:#5f6b7a">/ ${formatValue(stat as Stat, previous)}</span></div>`,
    );
  });
  return `<div style="margin-top:8px;padding-top:6px;border-top:1px solid #3c475c">与当前装备对比</div>${rows.join('')}`;
}

export function itemTooltipHTML(item: Item, equipped?: Item | null): string {
  const color = RARITY_COLORS[item.rarity];
  const baseStats = Object.entries(item.baseStats)
    .map(([stat, value]) => `<div>${statLabel(stat as never)} <span style="color:#a9d3ff">+${formatValue(stat as never, value)}</span></div>`)
    .join('');
  const affixes = item.affixes
    .map((affix) => `<div style="color:${color}">${affix.name} · ${AffixSystem.describe(affix)}</div>`)
    .join('');
  const comparison = equipped ? compareHTML(item, equipped) : '';
  return `
    <div style="color:${color};font-weight:bold;font-size:15px">${item.name}</div>
    <div style="color:#8a95a8;font-size:12px;margin:2px 0 6px">等级需求 ${item.requiredLevel}</div>
    ${item.setId ? `<div style="color:#ffd76a;font-size:12px">套装：${setDisplayName(item.setId)}</div>` : ''}
    ${baseStats}
    ${affixes}
    ${item.flavor ? `<div style="margin-top:6px;color:#ff8a1e;font-style:italic;font-size:12px">「${item.flavor}」</div>` : ''}
    ${comparison}
    <div style="margin-top:6px;color:#ffd76a">售价 ${item.sellPrice} 金币</div>
  `;
}
