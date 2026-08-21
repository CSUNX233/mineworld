import type { EquipmentManager } from '../items/EquipmentManager';
import type { Inventory } from '../items/Inventory';
import type { Item, Rarity, Slot, Stat } from '../types';
import { RARITY_COLORS } from '../data/recipes';
import { SETS, setDisplayName } from '../data/sets';
import { statLabel, formatValue } from '../items/AffixSystem';
import { itemTooltipHTML } from './ItemTooltip';

const SLOT_ORDER: Slot[] = ['weapon', 'helmet', 'chest', 'legs', 'boots', 'ring', 'ring2', 'necklace', 'offhand'];
const SLOT_LABELS: Record<Slot, string> = {
  weapon: '武器',
  helmet: '头盔',
  chest: '胸甲',
  legs: '护腿',
  boots: '靴子',
  ring: '戒指',
  ring2: '戒指 II',
  necklace: '项链',
  offhand: '副手',
};

export class InventoryUI {
  private panel: HTMLDivElement | null = null;
  private tooltip: HTMLDivElement | null = null;
  private equipment: EquipmentManager | null = null;
  open = false;
  attributePoints = 0;
  materialText = '';
  onEquip: ((inventoryIndex: number) => void) | null = null;
  onUnequip: ((slot: Slot) => void) | null = null;
  onSell: ((inventoryIndex: number) => void) | null = null;
  onSalvage: ((inventoryIndex: number) => void) | null = null;
  onUpgrade: ((inventoryIndex: number) => void) | null = null;
  onReforge: ((inventoryIndex: number) => void) | null = null;
  onAllocateClick: (() => void) | null = null;
  onSellAll: ((maxRarity: Rarity) => void) | null = null;
  private contextMenu: HTMLDivElement | null = null;

  constructor(private root: HTMLElement) {}

  toggle(equipment: EquipmentManager, inventory: Inventory): void {
    if (this.open) this.close();
    else this.show(equipment, inventory);
  }

  show(equipment: EquipmentManager, inventory: Inventory): void {
    this.close();
    this.open = true;
    this.equipment = equipment;
    this.panel = document.createElement('div');
    this.panel.className = 'panel';
    this.panel.style.position = 'absolute';
    this.panel.style.left = '50%';
    this.panel.style.top = '50%';
    this.panel.style.transform = 'translate(-50%, -50%)';
    this.panel.style.width = 'calc(720px + 0.5cm)';
    this.panel.style.maxWidth = '94vw';
    this.panel.style.height = '540px';
    this.panel.style.maxHeight = '90vh';
    this.panel.style.padding = '16px';
    this.panel.style.display = 'grid';
    this.panel.style.gridTemplateColumns = '230px 1fr';
    this.panel.style.gap = '14px';
    this.root.appendChild(this.panel);

    const equipmentPanel = document.createElement('div');
    equipmentPanel.style.display = 'grid';
    equipmentPanel.style.gridTemplateColumns = '1fr 1fr';
    equipmentPanel.style.alignContent = 'start';
    equipmentPanel.style.gap = '8px';
    SLOT_ORDER.forEach((slot) => {
      const item = equipment.get(slot);
      const box = this.makeItemBox(item, `${SLOT_LABELS[slot]}${item ? `\n${item.name}` : ''}`);
      box.dataset.slot = slot;
      box.style.cursor = item ? 'pointer' : 'default';
      if (item) {
        box.onclick = () => this.onUnequip?.(slot);
        this.attachTooltip(box, item);
      }
      equipmentPanel.appendChild(box);
    });
    const stats = equipment.getDerivedStats();
    const summary = document.createElement('div');
    summary.style.gridColumn = '1 / -1';
    summary.style.marginTop = '8px';
    summary.style.paddingTop = '8px';
    summary.style.borderTop = '1px solid #354156';
    summary.style.fontSize = '12px';
    summary.style.lineHeight = '1.55';
    summary.style.color = '#a9c8ff';
    summary.innerHTML = [
      `攻击 ${Math.round(stats.attack)}`,
      `攻速 ${(stats.baseAttackSpeed * (1 + stats.attackSpeedBonus)).toFixed(2)}/s`,
      `生命 ${Math.round(stats.maxHealth)}`,
      `护甲 ${Math.round(stats.armor)}`,
      `暴击 ${(stats.critChance * 100).toFixed(1)}%`,
      `暴伤 ${(stats.critDamage * 100).toFixed(0)}%`,
      `移速 ${stats.moveSpeed.toFixed(2)}`,
      `回蓝 ${stats.manaRegen.toFixed(1)}/s`,
      `回血 ${stats.lifeRegen.toFixed(1)}/s`,
    ].join(' · ');
    equipmentPanel.appendChild(summary);
    const activeSets = equipment.getActiveSetBonuses();
    if (activeSets.length > 0) {
      const setPanel = document.createElement('div');
      setPanel.style.gridColumn = '1 / -1';
      setPanel.style.marginTop = '6px';
      setPanel.style.padding = '7px 8px';
      setPanel.style.background = '#151d2b';
      setPanel.style.border = '1px solid #3d4a63';
      setPanel.style.borderRadius = '4px';
      setPanel.style.fontSize = '11px';
      setPanel.style.lineHeight = '1.45';

      activeSets.forEach((set) => {
        const title = document.createElement('div');
        title.style.color = '#ffd76a';
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '2px';
        title.textContent = `${setDisplayName(set.setId)} x${set.count}`;
        setPanel.appendChild(title);

        const setDef = SETS[set.setId];
        if (!setDef) return;
        Object.keys(setDef.bonuses)
          .map(Number)
          .sort((a, b) => a - b)
          .forEach((threshold) => {
            const bonus = setDef.bonuses[threshold];
            const active = set.count >= threshold;
            const statsText = Object.entries(bonus.stats)
              .map(([stat, value]) => `${statLabel(stat as Stat)} +${formatValue(stat as Stat, value)}`)
              .join(' · ');
            const specialText = bonus.special ? ` · ${this.specialLabel(bonus.special)}` : '';
            const line = document.createElement('div');
            line.style.color = active ? '#c8e1ff' : '#5f6b7a';
            line.style.textDecoration = active ? 'none' : 'line-through';
            line.textContent = `${threshold}件：${statsText}${specialText}`;
            setPanel.appendChild(line);
          });
      });
      equipmentPanel.appendChild(setPanel);
    }
    const allocate = document.createElement('button');
    allocate.textContent = this.attributePoints > 0 ? `角色加点 · 属性点 ${this.attributePoints}` : '角色加点 / 天赋';
    allocate.style.gridColumn = '1 / -1';
    allocate.style.marginTop = '4px';
    allocate.style.padding = '8px';
    allocate.style.background = '#2c5f8a';
    allocate.style.color = '#fff';
    allocate.style.border = '1px solid #6fa9d8';
    allocate.style.borderRadius = '4px';
    allocate.style.cursor = 'pointer';
    allocate.onclick = () => this.onAllocateClick?.();
    equipmentPanel.appendChild(allocate);
    this.panel.appendChild(equipmentPanel);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.flexDirection = 'column';
    const title = document.createElement('div');
    title.textContent = `背包 ${inventory.items.length}/${inventory.capacity}`;
    title.style.marginBottom = '8px';
    right.appendChild(title);
    if (this.materialText) {
      const materials = document.createElement('div');
      materials.textContent = this.materialText;
      materials.style.marginBottom = '8px';
      materials.style.fontSize = '12px';
      materials.style.color = '#9fd0ff';
      right.appendChild(materials);
    }
    const grid = document.createElement('div');
    grid.style.flex = '1';
    grid.style.overflow = 'auto';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(8, 54px)';
    grid.style.gridAutoRows = '54px';
    grid.style.gap = '6px';
    for (let i = 0; i < inventory.capacity; i++) {
      const item = inventory.items[i] ?? null;
      const box = this.makeItemBox(item, item?.name ?? '');
      box.dataset.inventoryIndex = String(i);
      if (item) {
        box.onclick = () => this.onEquip?.(i);
        box.oncontextmenu = (event) => {
          event.preventDefault();
          this.openContextMenu(event, i, item);
        };
        this.attachTooltip(box, item);
      }
      grid.appendChild(box);
    }
    right.appendChild(grid);
    const hint = document.createElement('div');
    hint.textContent = '左键穿戴/替换 · 右键出售/分解/升级/重铸 · 装备栏点击卸下';
    hint.style.marginTop = '8px';
    hint.style.fontSize = '12px';
    hint.style.color = '#7f8ca0';
    right.appendChild(hint);

    const bulkSell = document.createElement('div');
    bulkSell.style.marginTop = '8px';
    bulkSell.style.display = 'flex';
    bulkSell.style.alignItems = 'center';
    bulkSell.style.gap = '6px';
    const bulkLabel = document.createElement('span');
    bulkLabel.textContent = '一键出售';
    bulkLabel.style.fontSize = '12px';
    bulkLabel.style.color = '#ffd76a';
    bulkSell.appendChild(bulkLabel);

    const rarityOptions: { value: Rarity; label: string }[] = [
      { value: 'common', label: '普通' },
      { value: 'magic', label: '魔法' },
      { value: 'rare', label: '稀有' },
      { value: 'epic', label: '史诗' },
      { value: 'legendary', label: '传说' },
    ];
    const raritySelect = document.createElement('select');
    raritySelect.style.background = '#1a2230';
    raritySelect.style.color = '#ffd76a';
    raritySelect.style.border = '1px solid #43516a';
    raritySelect.style.borderRadius = '3px';
    raritySelect.style.padding = '4px 6px';
    rarityOptions.forEach((option) => {
      const item = document.createElement('option');
      item.value = option.value;
      item.textContent = `${option.label}及以下`;
      raritySelect.appendChild(item);
    });
    bulkSell.appendChild(raritySelect);

    const sellAllButton = document.createElement('button');
    sellAllButton.textContent = '出售';
    sellAllButton.style.background = '#7a5a18';
    sellAllButton.style.color = '#fff';
    sellAllButton.style.border = '1px solid #c58c28';
    sellAllButton.style.borderRadius = '3px';
    sellAllButton.style.padding = '4px 8px';
    sellAllButton.style.cursor = 'pointer';
    sellAllButton.onclick = () => this.onSellAll?.(raritySelect.value as Rarity);
    bulkSell.appendChild(sellAllButton);

    right.appendChild(bulkSell);
    this.panel.appendChild(right);
  }

  private openContextMenu(event: MouseEvent, index: number, item: Item): void {
    this.contextMenu?.remove();
    const menu = document.createElement('div');
    menu.className = 'panel';
    menu.style.position = 'fixed';
    menu.style.zIndex = '1200';
    menu.style.padding = '4px';
    menu.style.minWidth = '160px';
    menu.style.left = `${Math.min(event.clientX, window.innerWidth - 180)}px`;
    menu.style.top = `${Math.min(event.clientY, window.innerHeight - 220)}px`;
    const actions: { label: string; color: string; action: (() => void) | null }[] = [
      { label: '出售', color: '#ffd76a', action: this.onSell ? () => this.onSell?.(index) : null },
      { label: '分解', color: '#9fd0ff', action: this.onSalvage ? () => this.onSalvage?.(index) : null },
      { label: '升级', color: '#7ee8a2', action: this.onUpgrade ? () => this.onUpgrade?.(index) : null },
      { label: '重铸', color: '#d49bff', action: this.onReforge ? () => this.onReforge?.(index) : null },
    ];
    actions.forEach((entry) => {
      if (!entry.action) return;
      const button = document.createElement('button');
      button.textContent = entry.label;
      button.style.display = 'block';
      button.style.width = '100%';
      button.style.padding = '7px 10px';
      button.style.margin = '2px 0';
      button.style.background = '#1a2230';
      button.style.color = entry.color;
      button.style.border = '1px solid #354156';
      button.style.borderRadius = '3px';
      button.style.cursor = 'pointer';
      button.onclick = () => {
        this.contextMenu?.remove();
        this.contextMenu = null;
        entry.action?.();
      };
      menu.appendChild(button);
    });
    document.body.appendChild(menu);
    this.contextMenu = menu;
    const close = (event: MouseEvent): void => {
      if (this.contextMenu?.contains(event.target as Node)) return;
      this.contextMenu?.remove();
      this.contextMenu = null;
      window.removeEventListener('mousedown', close);
    };
    window.setTimeout(() => window.addEventListener('mousedown', close), 0);
  }

  close(): void {
    this.open = false;
    this.panel?.remove();
    this.panel = null;
    this.tooltip?.remove();
    this.tooltip = null;
    this.contextMenu?.remove();
    this.contextMenu = null;
  }

  private makeItemBox(item: Item | null, label: string): HTMLDivElement {
    const box = document.createElement('div');
    box.style.width = '54px';
    box.style.height = '54px';
    box.style.background = '#1a2230';
    box.style.border = item ? `2px solid ${RARITY_COLORS[item.rarity]}` : '1px solid #354156';
    box.style.borderRadius = '4px';
    box.style.display = 'flex';
    box.style.alignItems = 'center';
    box.style.justifyContent = 'center';
    box.style.position = 'relative';
    box.style.pointerEvents = 'auto';
    box.title = label;
    if (item) {
      box.innerHTML = `<span style="font-size:24px">${this.iconFor(item.icon)}</span>`;
      if (item.affixes.length > 0) {
        const dot = document.createElement('span');
        dot.style.position = 'absolute';
        dot.style.top = '3px';
        dot.style.right = '3px';
        dot.style.width = '6px';
        dot.style.height = '6px';
        dot.style.background = '#fff';
        dot.style.borderRadius = '50%';
        box.appendChild(dot);
      }
    }
    return box;
  }

  private attachTooltip(box: HTMLDivElement, item: Item): void {
    const html = itemTooltipHTML(item, this.equipment?.get(item.slot) ?? null);
    const show = (event: MouseEvent): void => {
      if (!this.tooltip) {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'panel tooltip';
        this.tooltip.style.zIndex = '1000';
        document.body.appendChild(this.tooltip);
      }
      this.tooltip.innerHTML = html;
      const margin = 16;
      const left = Math.min(window.innerWidth - 300, event.clientX + margin);
      const top = Math.min(window.innerHeight - 220, event.clientY + margin);
      this.tooltip.style.left = `${left}px`;
      this.tooltip.style.top = `${top}px`;
    };
    box.onmouseenter = show;
    box.onmousemove = show;
    box.onmouseleave = () => {
      this.tooltip?.remove();
      this.tooltip = null;
    };
  }

  private iconFor(icon: string): string {
    const map: Record<string, string> = {
      sword: '⚔',
      axe: '🪓',
      hammer: '🔨',
      helmet: '🪖',
      chest: '🛡',
      legs: '👖',
      boots: '👢',
      ring: '💍',
      necklace: '📿',
      shield: '🛡',
    };
    return map[icon] ?? '✦';
  }

  private specialLabel(special: string): string {
    const labels: Record<string, string> = {
      chainLightning: '攻击有概率触发连锁闪电',
      explosiveKill: '击杀时产生爆炸',
      aegisWalk: '移动时缓慢获得护盾',
      meteorOnAttack: '攻击有概率召唤陨石',
      summonSkeletonOnKill: '击杀时召唤骷髅',
      executeFullHealth: '满血时额外伤害',
      dashInvincibility: '冲刺后短暂无敌',
      fireTrail: '移动留下火焰路径',
      lowHealthShield: '低血量时获得护盾',
      burnMastery: '火焰异常强化',
      freezeMastery: '冰霜异常强化',
      poisonMastery: '毒素异常强化',
      shockMastery: '闪电异常强化',
      glacialNova: '冰霜新星强化',
    };
    return labels[special] ?? special;
  }
}
