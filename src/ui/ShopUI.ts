import type { Item, MaterialId, Rarity, ShopStockEntry, Slot } from '../types';
import { RARITY_COLORS, RARITY_ORDER } from '../data/recipes';
import { MATERIALS, MATERIAL_ORDER } from '../data/materials';
import { SHOP_SLOTS, ShopSystem } from '../items/ShopSystem';
import { itemTooltipHTML } from './ItemTooltip';

export interface ShopView {
  floor: number; gold: number; stock: ShopStockEntry[]; inventory: Item[];
  materials: Partial<Record<MaterialId, number>>; full: boolean; refreshes: number;
  gambles: number; heals: number; needsHealing: boolean; message: string;
  buy(uid: string): void; refresh(): void; gamble(slot: Slot): void; heal(): void;
  sell(index: number): void; sellAll(rarity: Rarity): void; sellMaterial(id: MaterialId): void;
}

/** Presentation only: all transactions and persistence stay with the host. */
export function buildShopView(view: ShopView): HTMLElement {
  const section = document.createElement('section');
  section.className = 'shop-view';
  const message = document.createElement('p');
  message.className = 'shop-message';
  message.setAttribute('role', 'status');
  message.textContent = view.message || '货架售完即止；可付费换货。随机委托和恢复次数不随换货重置。';
  section.appendChild(message);
  const tabs = document.createElement('div');
  tabs.className = 'shop-tabs';
  tabs.setAttribute('role', 'tablist');
  const content = document.createElement('div');
  const buyPanel = document.createElement('div');
  const sellPanel = document.createElement('div');
  for (const [label, panel] of [['购买与服务', buyPanel], ['出售装备与材料', sellPanel]] as const) {
    const tab = document.createElement('button');
    tab.textContent = label;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(panel === buyPanel));
    tab.onclick = () => {
      buyPanel.hidden = panel !== buyPanel;
      sellPanel.hidden = panel !== sellPanel;
      tabs.querySelectorAll('button').forEach(button => button.setAttribute('aria-selected', String(button === tab)));
    };
    tabs.appendChild(tab);
  }
  sellPanel.hidden = true;
  section.append(tabs, content);
  content.append(buyPanel, sellPanel);
  const heading = (parent: HTMLElement, text: string) => {
    const h = document.createElement('h3'); h.textContent = text; parent.appendChild(h);
  };
  const action = (parent: HTMLElement, text: string, run: () => void, disabled = false) => {
    const button = document.createElement('button'); button.textContent = text;
    button.disabled = disabled; button.onclick = run; parent.appendChild(button); return button;
  };
  const card = (parent: HTMLElement, item: Item) => {
    const row = document.createElement('article'); row.className = 'shop-item';
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.style.color = RARITY_COLORS[item.rarity];
    summary.textContent = `${item.name} · Lv.${item.itemLevel}`;
    const description = document.createElement('div');
    description.className = 'shop-item-details'; description.innerHTML = itemTooltipHTML(item);
    details.append(summary, description); row.appendChild(details); parent.appendChild(row); return row;
  };
  heading(buyPanel, `本层货架 · 剩余 ${view.stock.length} 件`);
  for (const entry of view.stock) {
    action(card(buyPanel, entry.item), `购买 · ${entry.price} 金币`, () => view.buy(entry.uid), view.full || view.gold < entry.price);
  }
  if (!view.stock.length) {
    const empty = document.createElement('p'); empty.textContent = '货架已售罄，可付费换货或继续探索。'; buyPanel.appendChild(empty);
  }
  const refreshCost = ShopSystem.refreshPrice(view.floor, view.refreshes);
  action(buyPanel, view.refreshes >= 3 ? '本层换货次数已用完' : `换一批 · ${refreshCost} 金币（${3 - view.refreshes}/3）`, view.refresh,
    view.refreshes >= 3 || view.gold < refreshCost);
  heading(buyPanel, '定向随机委托');
  const odds = document.createElement('p');
  odds.textContent = `先选部位，再随机品质与词条；${view.floor < 5 ? '魔法 75% / 稀有 25%' : '魔法 72% / 稀有 25% / 史诗 3%'}。不产出传说。`;
  buyPanel.appendChild(odds);
  const request = document.createElement('div'); request.className = 'shop-actions'; buyPanel.appendChild(request);
  const slot = document.createElement('select'); slot.setAttribute('aria-label', '委托装备部位');
  for (const option of SHOP_SLOTS) {
    const element = document.createElement('option'); element.value = option.slot; element.textContent = option.label; slot.appendChild(element);
  }
  request.appendChild(slot);
  const gamble = action(request, '', () => view.gamble(slot.value as Slot));
  const update = () => {
    const cost = ShopSystem.gamblePrice(view.floor, slot.value as Slot);
    gamble.textContent = view.gambles >= 3 ? '本层委托次数已用完' : `委托 · ${cost} 金币（${3 - view.gambles}/3）`;
    gamble.disabled = view.gambles >= 3 || view.full || view.gold < cost;
  };
  slot.onchange = update; update();
  heading(buyPanel, '旅途补给');
  const healCost = ShopSystem.healPrice(view.floor);
  action(buyPanel, `恢复 40% 生命与法力 · ${healCost} 金币（${2 - view.heals}/2）`, view.heal,
    view.heals >= 2 || !view.needsHealing || view.gold < healCost);

  heading(sellPanel, '背包装备 · 已穿戴装备不在此列');
  const bulk = document.createElement('div'); bulk.className = 'shop-actions'; sellPanel.appendChild(bulk);
  const quality = document.createElement('select'); quality.setAttribute('aria-label', '商店出售品质');
  RARITY_ORDER.forEach((rarity, i) => {
    const option = document.createElement('option'); option.value = rarity;
    option.textContent = `${['普通','魔法','稀有','史诗','传说'][i]}及以下`; quality.appendChild(option);
  });
  bulk.appendChild(quality);
  action(bulk, '一键出售', () => view.sellAll(quality.value as Rarity), !view.inventory.length);
  view.inventory.forEach((item, index) => action(card(sellPanel, item), `出售 · +${item.sellPrice} 金币`, () => view.sell(index)));
  heading(sellPanel, '出售材料');
  for (const id of MATERIAL_ORDER) {
    const count = view.materials[id] ?? 0;
    if (!count) continue;
    action(sellPanel, `${MATERIALS[id].name} ×${count} · 出售 1 个 +${ShopSystem.materialPrice(id, view.floor)} 金币`, () => view.sellMaterial(id));
  }
  return section;
}
