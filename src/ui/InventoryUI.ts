import type { EquipmentManager } from '../items/EquipmentManager';
import type { Inventory } from '../items/Inventory';
import type { Item, Rarity, Slot, Stat } from '../types';
import { RARITY_COLORS } from '../data/recipes';
import { SETS, setDisplayName } from '../data/sets';
import { statLabel, formatValue } from '../items/AffixSystem';
import { itemTooltipHTML } from './ItemTooltip';
import { isMobileDevice } from '../utils/mobile';

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
  private backdrop: HTMLDivElement | null = null;
  private tooltip: HTMLDivElement | null = null;
  private equipment: EquipmentManager | null = null;
  private inventory: Inventory | null = null;
  private activeTab = 'bag';
  private bulkRarity: Rarity = 'common';
  private dismissContext: ((event: PointerEvent) => void) | null = null;
  onDetailsOpen: (() => void) | null = null;
  onDetailsClose: (() => void) | null = null;
  open = false;
  attributePoints = 0;
  playerLevel = 1;
  materialText = '';
  onEquip: ((inventoryIndex: number) => void) | null = null;
  onUnequip: ((slot: Slot) => void) | null = null;
  onSalvage: ((inventoryIndex: number) => void) | null = null;
  onUpgrade: ((inventoryIndex: number) => void) | null = null;
  onReforge: ((inventoryIndex: number) => void) | null = null;
  onAllocateClick: (() => void) | null = null;
  onSort: (() => void) | null = null;
  onSalvageAll: ((maxRarity: Rarity) => void) | null = null;
  onClose: (() => void) | null = null;
  private contextMenu: HTMLDivElement | null = null;
  private mobile = isMobileDevice();

  constructor(private root: HTMLElement) {
    window.addEventListener('resize', () => {
      if (this.open && this.equipment && this.inventory) this.show(this.equipment, this.inventory);
    });
  }

  toggle(equipment: EquipmentManager, inventory: Inventory): void {
    if (this.open) this.close();
    else this.show(equipment, inventory);
  }

  show(equipment: EquipmentManager, inventory: Inventory): void {
    this.close(false);
    this.open = true;
    this.inventory = inventory;
    this.equipment = equipment;
    const mobile = this.mobile;
    const mobileLandscape = mobile && window.innerWidth > window.innerHeight;
    if (mobile) {
      this.backdrop = document.createElement('div');
      this.backdrop.className = 'inventory-backdrop';
      this.backdrop.onclick = () => this.close();
      this.root.appendChild(this.backdrop);
    }
    this.panel = document.createElement('div');
    this.panel.className = mobile ? 'panel inventory-panel mobile-inventory' : 'panel inventory-panel';
    this.panel.style.position = 'absolute';
    this.panel.style.left = '50%';
    this.panel.style.top = '50%';
    this.panel.style.transform = 'translate(-50%, -50%)';
    this.panel.style.width = mobileLandscape ? '94vw' : mobile ? '96vw' : 'calc(720px + 0.5cm)';
    this.panel.style.maxWidth = mobileLandscape ? '94vw' : mobile ? '96vw' : '94vw';
    this.panel.style.height = mobile ? 'min(82vh, 720px)' : '540px';
    this.panel.style.maxHeight = mobile ? '82vh' : '90vh';
    this.panel.style.padding = mobile ? '12px 12px calc(12px + env(safe-area-inset-bottom))' : '16px';
    this.panel.style.display = 'grid';
    this.panel.style.gridTemplateColumns = mobileLandscape ? 'minmax(150px, 0.7fr) minmax(0, 1.3fr)' : mobile ? '1fr' : '230px 1fr';
    this.panel.style.gridTemplateRows = mobileLandscape ? 'minmax(0, 1fr)' : mobile ? 'auto 1fr' : 'none';
    this.panel.style.gap = mobileLandscape ? '8px' : mobile ? '10px' : '14px';
    if (mobile) this.panel.style.overflow = 'hidden';
    this.root.appendChild(this.panel);
    if (mobile) {
      this.panel.dataset.tab = this.activeTab;
      const header = document.createElement('div');
      header.className = 'inventory-header';
      const heading = document.createElement('strong');
      heading.textContent = '装备与背包';
      header.appendChild(heading);
      const tabs = document.createElement('div');
      tabs.className = 'inventory-tabs';
      for (const [tab, label] of [['bag', '背包'], ['equipment', '装备 / 属性']]) {
        const button = document.createElement('button');
        button.textContent = label;
        button.setAttribute('aria-pressed', String(this.activeTab === tab));
        button.onclick = () => {
          this.activeTab = tab;
          if (this.panel) this.panel.dataset.tab = tab;
          tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
        };
        tabs.appendChild(button);
      }
      header.appendChild(tabs);
      this.panel.appendChild(header);
      this.addCloseButton(this.panel);
    }

    const equipmentPanel = document.createElement('div');
    equipmentPanel.className = 'inventory-equipment';
    equipmentPanel.style.display = 'grid';
    equipmentPanel.style.gridTemplateColumns = mobileLandscape
      ? 'repeat(2, minmax(48px, 1fr))'
      : mobile
        ? 'repeat(3, minmax(44px, 1fr))'
        : '1fr 1fr';
    equipmentPanel.style.alignContent = 'start';
    equipmentPanel.style.gap = mobileLandscape ? '4px' : '8px';
    if (mobile) {
      equipmentPanel.classList.add('mobile-scroll');
      equipmentPanel.style.minHeight = '0';
      equipmentPanel.style.overflow = 'auto';
      equipmentPanel.style.maxHeight = mobileLandscape ? '100%' : '42vh';
    }
    SLOT_ORDER.forEach((slot) => {
      const item = equipment.get(slot);
      const box = this.makeItemBox(item, `${SLOT_LABELS[slot]}${item ? `\n${item.name}` : ''}`);
      box.dataset.slot = slot;
      if (mobile) {
        box.classList.add('equipment-slot');
        const label = document.createElement('span');
        label.className = 'equipment-slot-label';
        label.textContent = SLOT_LABELS[slot];
        box.appendChild(label);
      }
      box.style.cursor = item ? 'pointer' : 'default';
      if (item) {
        box.onclick = () => this.mobile ? this.openItemDetails(item, null, slot) : this.onUnequip?.(slot);
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
    allocate.className = 'inventory-allocate';
    allocate.textContent = this.attributePoints > 0 ? `局内天赋 · 可用 ${this.attributePoints} 点` : '局内天赋';
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
    right.className = 'inventory-content';
    right.style.display = 'flex';
    right.style.flexDirection = 'column';
    right.style.minWidth = '0';
    right.style.minHeight = '0';
    right.style.overflow = 'hidden';
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
    grid.className = this.mobile ? 'inventory-grid mobile-scroll' : 'inventory-grid';
    grid.style.flex = '1 1 0';
    grid.style.minHeight = '0';
    grid.style.alignContent = 'start';
    grid.style.overflow = 'auto';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = this.mobile ? 'repeat(auto-fill, minmax(48px, 1fr))' : 'repeat(auto-fill, 54px)';
    grid.style.gridAutoRows = this.mobile ? '48px' : '54px';
    grid.style.gap = this.mobile ? '8px' : '6px';
    grid.style.touchAction = this.mobile ? 'pan-y' : 'auto';
    for (let i = 0; i < inventory.capacity; i++) {
      const item = inventory.items[i] ?? null;
      const box = this.makeItemBox(item, item?.name ?? '');
      box.dataset.inventoryIndex = String(i);
      if (item) {
        box.onclick = () => {
          if (this.mobile) this.openItemDetails(item, i);
          else this.onEquip?.(i);
        };
        box.oncontextmenu = (event) => {
          event.preventDefault();
          if (this.mobile) this.openItemDetails(item, i);
          else this.openContextMenu(event, i, item);
        };
        this.attachTooltip(box, item);
      }
      grid.appendChild(box);
    }
    right.appendChild(grid);
    const hint = document.createElement('div');
    hint.textContent = this.mobile
      ? '点击查看详情、穿戴或打造；出售请前往地图商店'
      : '左键穿戴 · 右键分解/升级/重铸 · 出售请前往地图商店';
    hint.style.marginTop = '8px';
    hint.style.fontSize = '12px';
    hint.style.color = '#7f8ca0';
    right.appendChild(hint);

    const bulkSell = document.createElement('div');
    bulkSell.className = 'inventory-bulk';
    bulkSell.style.marginTop = '8px';
    bulkSell.style.display = 'flex';
    bulkSell.style.alignItems = 'center';
    bulkSell.style.gap = '6px';
    const bulkLabel = document.createElement('span');
    bulkLabel.textContent = '批量处理';
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
    raritySelect.setAttribute('aria-label', '批量处理品质');
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
    raritySelect.value = this.bulkRarity;
    raritySelect.onchange = () => { this.bulkRarity = raritySelect.value as Rarity; };

    const sellAllButton = document.createElement('button');
    sellAllButton.textContent = '一键整理';
    sellAllButton.style.background = '#7a5a18';
    sellAllButton.style.color = '#fff';
    sellAllButton.style.border = '1px solid #c58c28';
    sellAllButton.style.borderRadius = '3px';
    sellAllButton.style.padding = '4px 8px';
    sellAllButton.style.cursor = 'pointer';
    sellAllButton.onclick = () => this.onSort?.();
    bulkSell.appendChild(sellAllButton);
    const salvageAllButton = sellAllButton.cloneNode(false) as HTMLButtonElement;
    salvageAllButton.textContent = '一键分解';
    salvageAllButton.style.background = '#24465a';
    salvageAllButton.style.borderColor = '#70b3d6';
    salvageAllButton.onclick = () => this.onSalvageAll?.(raritySelect.value as Rarity);
    bulkSell.appendChild(salvageAllButton);

    right.appendChild(bulkSell);
    this.panel.appendChild(right);
  }

  private openContextMenu(event: MouseEvent, index: number, item: Item): void {
    this.openContextMenuAt(index, item, event.clientX, event.clientY);
  }

  private openContextMenuAt(index: number, item: Item, clientX: number, clientY: number): void {
    this.closeDetails();
    const menu = document.createElement('div');
    menu.className = 'panel context-menu';
    menu.style.position = 'fixed';
    menu.style.zIndex = '1200';
    menu.style.padding = '4px';
    menu.style.minWidth = '160px';
    menu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - 180))}px`;
    menu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - 220))}px`;
    const actions: { label: string; color: string; action: (() => void) | null }[] = [
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
        this.closeDetails();
        entry.action?.();
      };
      menu.appendChild(button);
    });
    document.body.appendChild(menu);
    this.contextMenu = menu;
    this.dismissContext = (event: PointerEvent): void => {
      if (!this.contextMenu?.contains(event.target as Node)) this.closeDetails();
    };
    window.addEventListener('pointerdown', this.dismissContext);
  }

  private openItemDetails(item: Item, index: number | null, slot?: Slot): void {
    this.closeDetails();
    const overlay = document.createElement('div');
    overlay.className = 'item-details-overlay';
    const panel = document.createElement('div');
    panel.className = 'panel item-details mobile-scroll';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '物品详情');
    const info = document.createElement('div');
    info.className = 'item-details-info';
    info.innerHTML = itemTooltipHTML(item, index !== null ? this.comparisonItem(item) : undefined);
    panel.appendChild(info);
    const actions = document.createElement('div');
    actions.className = 'item-details-actions';
    const add = (label: string, action: () => void): HTMLButtonElement => {
      const button = document.createElement('button');
      button.textContent = label;
      button.onclick = () => { this.closeDetails(); action(); };
      actions.appendChild(button);
      return button;
    };
    if (index !== null) {
      const equip = add('穿戴 / 替换', () => this.onEquip?.(index));
      if (item.requiredLevel > this.playerLevel) {
        equip.textContent = `需要 Lv.${item.requiredLevel}`;
        equip.disabled = true;
      }
      add('升级', () => this.onUpgrade?.(index));
      add('重铸', () => this.onReforge?.(index));
      add('分解', () => this.onSalvage?.(index));
    } else if (slot) {
      const unequip = add('卸下装备', () => this.onUnequip?.(slot));
      if (!this.inventory?.hasSpace()) { unequip.textContent = '背包已满'; unequip.disabled = true; }
    }
    add('返回背包', () => {});
    panel.appendChild(actions);
    overlay.appendChild(panel);
    overlay.onclick = (event) => { if (event.target === overlay) this.closeDetails(); };
    this.root.appendChild(overlay);
    this.contextMenu = overlay;
    this.onDetailsOpen?.();
  }

  closeDetails(): void {
    this.contextMenu?.remove();
    this.contextMenu = null;
    if (this.dismissContext) window.removeEventListener('pointerdown', this.dismissContext);
    this.dismissContext = null;
    this.onDetailsClose?.();
  }

  close(notify = true): void {
    this.open = false;
    this.panel?.remove();
    this.panel = null;
    this.backdrop?.remove();
    this.backdrop = null;
    this.tooltip?.remove();
    this.tooltip = null;
    this.closeDetails();
    if (notify) this.onClose?.();
  }

  private addCloseButton(panel: HTMLDivElement): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '✕';
    button.className = 'panel-close-button';
    button.style.position = 'absolute';
    button.style.right = '10px';
    button.style.top = '10px';
    button.style.width = '42px';
    button.style.height = '42px';
    button.style.minWidth = '42px';
    button.style.minHeight = '42px';
    button.style.padding = '0';
    button.style.background = 'rgba(20,28,42,0.86)';
    button.style.color = '#e7e9ee';
    button.style.border = '1px solid #59647a';
    button.style.borderRadius = '6px';
    button.style.fontSize = '18px';
    button.style.fontWeight = 'bold';
    button.style.cursor = 'pointer';
    button.style.touchAction = 'manipulation';
    button.onclick = () => this.close();
    panel.appendChild(button);
  }

  private makeItemBox(item: Item | null, label: string): HTMLDivElement {
    const box = document.createElement('div');
    box.style.width = this.mobile ? '48px' : '54px';
    box.style.height = this.mobile ? '48px' : '54px';
    box.style.background = '#1a2230';
    box.style.border = item ? `2px solid ${RARITY_COLORS[item.rarity]}` : '1px solid #354156';
    box.style.borderRadius = '4px';
    box.style.display = 'flex';
    box.style.alignItems = 'center';
    box.style.justifyContent = 'center';
    box.style.position = 'relative';
    box.style.pointerEvents = 'auto';
    box.style.touchAction = this.mobile ? 'pan-y' : 'auto';
    box.title = label;
    if (item) {
      box.innerHTML = `<span style="font-size:${this.mobile ? 21 : 24}px">${this.iconFor(item.icon)}</span>`;
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

  private comparisonItem(item: Item): Item | null | undefined {
    const slot = item.slot === 'ring' && this.equipment?.get('ring') ? 'ring2' : item.slot;
    return this.equipment?.get(slot);
  }

  private attachTooltip(box: HTMLDivElement, item: Item): void {
    if (this.mobile) return;
    const html = itemTooltipHTML(item, this.comparisonItem(item));
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
