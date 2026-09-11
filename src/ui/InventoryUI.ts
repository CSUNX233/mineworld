import { pixelText, setPixelText } from './PixelNumbers';
import type { EquipmentManager, DerivedStats } from '../items/EquipmentManager';
import type { Inventory } from '../items/Inventory';
import type { Item, Rarity, Slot, Stat } from '../types';
import { SETS, setDisplayName } from '../data/sets';
import { statLabel, formatModifier } from '../items/AffixSystem';
import { itemTooltipHTML } from './ItemTooltip';
import { isMobileDevice } from '../utils/mobile';
import { createItemIcon, createUiIcon, UI_RARITY_COLORS } from './UiAssets';

const SLOT_ORDER: Slot[] = ['weapon', 'helmet', 'offhand', 'ring', 'chest', 'ring2', 'necklace', 'legs', 'boots'];
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

const SLOT_ICONS: Record<Slot, string> = {
  weapon: 'sword',
  helmet: 'helmet',
  chest: 'chest',
  legs: 'legs',
  boots: 'boots',
  ring: 'ring',
  ring2: 'ring',
  necklace: 'necklace',
  offhand: 'shield',
};

// Inventory frames use a brighter game-readable ladder without changing item rarity data.
const INVENTORY_RARITY_COLORS = UI_RARITY_COLORS;

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
  getCurrentStats: (() => DerivedStats) | null = null;
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
    this.panel.className = mobile ? 'panel inventory-panel sunlit-inventory mobile-inventory' : 'panel inventory-panel sunlit-inventory';
    this.panel.style.position = 'absolute';
    this.panel.style.left = '50%';
    this.panel.style.top = '50%';
    this.panel.style.transform = 'translate(-50%, -50%)';
    this.panel.style.width = mobileLandscape ? '94vw' : mobile ? '96vw' : 'min(860px, calc(100vw - 24px))';
    this.panel.style.maxWidth = mobileLandscape ? '94vw' : mobile ? '96vw' : '94vw';
    this.panel.style.height = mobile ? 'min(82vh, 720px)' : 'min(570px, calc(100vh - 24px))';
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
    }
    this.addCloseButton(this.panel);

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
    const equipmentTitle = document.createElement('div');
    equipmentTitle.className = 'inventory-section-title inventory-equipment-title';
    equipmentTitle.append(createUiIcon('sword', 'inventory-section-icon'), document.createTextNode('冒险装备'));
    equipmentPanel.appendChild(equipmentTitle);
    SLOT_ORDER.forEach((slot) => {
      const item = equipment.get(slot);
      const box = this.makeItemBox(item, `${SLOT_LABELS[slot]}${item ? `\n${item.name}` : ''}`, SLOT_ICONS[slot]);
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
    const stats = this.getCurrentStats?.() ?? equipment.getDerivedStats();
    const summary = document.createElement('div');
    summary.className = 'inventory-stat-summary';
    summary.style.gridColumn = '1 / -1';
    summary.style.marginTop = '8px';
    summary.style.paddingTop = '8px';
    summary.style.fontSize = '12px';
    summary.style.lineHeight = '1.55';
    summary.innerHTML = [
      `攻击 ${Math.round(stats.attack)}`,
      `攻速 ${(stats.baseAttackSpeed * (1 + stats.attackSpeedBonus)).toFixed(2)}/s`,
      `生命 ${Math.round(stats.maxHealth)}`,
      `护甲护盾 ${Math.round(stats.armor)}`,
      `防御力 ${Math.round(stats.defense)}`,
      `护盾恢复等待 ${stats.shieldRechargeDelay.toFixed(1)}s`,
      `暴击 ${(stats.critChance * 100).toFixed(1)}%`,
      `暴伤 ${(stats.critDamage * 100).toFixed(0)}%`,
      `闪避 ${(stats.dodgeChance * 100).toFixed(1)}%`,
      `吸血 ${(stats.lifeSteal * 100).toFixed(1)}%`,
      `移速 ${stats.moveSpeed.toFixed(2)}`,
      `回蓝 ${stats.manaRegen.toFixed(1)}/s`,
      `回血 ${stats.lifeRegen.toFixed(1)}/s`,
      `幸运 ${Number(stats.luck.toFixed(1))}`,
    ].join(' · ');
    summary.title = '护甲护盾决定装备提供的可回复护盾容量；受击后基础等待 5 秒才开始自然恢复，护盾恢复启动速度可将等待缩短至最低 2.5 秒。';
    equipmentPanel.appendChild(summary);
    const shieldRule = document.createElement('div');
    shieldRule.style.gridColumn = '1 / -1';
    shieldRule.style.fontSize = '11px';
    shieldRule.style.opacity = '0.72';
    shieldRule.textContent = '护甲护盾决定可回复容量；受击后基础等待 5 秒，启动速度可缩短至最低 2.5 秒。';
    equipmentPanel.appendChild(shieldRule);
    const setSummary = document.createElement('div');
    setSummary.className = 'inventory-set-summary';
    const activeSets = equipment.getActiveSetBonuses();
    for (const set of activeSets) {
      const line = document.createElement('div');
      line.textContent = this.setSummary(set.setId, set.count);
      line.title = line.textContent;
      setSummary.appendChild(line);
    }
    if (!activeSets.length) setSummary.textContent = '尚未装备套装';
    equipmentPanel.appendChild(setSummary);
    const setButton = document.createElement('button');
    setButton.className = 'inventory-set-button';
    setButton.textContent = '套装属性';
    setButton.onclick = () => this.openSetDetails(setButton);
    equipmentPanel.appendChild(setButton);
    const allocate = document.createElement('button');
    allocate.className = 'inventory-allocate';
    allocate.textContent = this.attributePoints > 0 ? `局内天赋 · 可用 ${this.attributePoints} 点` : '局内天赋';
    allocate.style.gridColumn = '1 / -1';
    allocate.style.marginTop = '4px';
    allocate.style.padding = '8px';
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
    title.className = 'inventory-section-title inventory-bag-title';
    title.append(createUiIcon('bag', 'inventory-section-icon'), pixelText(`背包 ${inventory.items.length}/${inventory.capacity}`));
    title.style.marginBottom = '8px';
    right.appendChild(title);
    if (this.materialText) {
      const materials = document.createElement('div');
      materials.className = 'inventory-materials';
      setPixelText(materials, this.materialText);
      materials.style.marginBottom = '8px';
      materials.style.fontSize = '12px';
      right.appendChild(materials);
    }
    const grid = document.createElement('div');
    grid.className = this.mobile ? 'inventory-grid sunlit-inset mobile-scroll' : 'inventory-grid sunlit-inset';
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
    hint.className = 'inventory-hint';
    hint.textContent = this.mobile
      ? '点击查看详情、穿戴或打造；出售请前往地图商店'
      : '左键穿戴 · 右键分解/升级/重铸 · 出售请前往地图商店';
    hint.style.marginTop = '8px';
    hint.style.fontSize = '12px';
    right.appendChild(hint);

    const bulkSell = document.createElement('div');
    bulkSell.className = 'inventory-bulk';
    bulkSell.style.marginTop = '8px';
    bulkSell.style.display = 'flex';
    bulkSell.style.alignItems = 'center';
    bulkSell.style.gap = '6px';
    const bulkLabel = document.createElement('span');
    bulkLabel.className = 'inventory-bulk-label';
    bulkLabel.textContent = '批量处理';
    bulkLabel.style.fontSize = '12px';
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
    raritySelect.className = 'inventory-rarity-select';
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
    sellAllButton.className = 'inventory-bulk-action';
    sellAllButton.style.padding = '4px 8px';
    sellAllButton.style.cursor = 'pointer';
    sellAllButton.onclick = () => this.onSort?.();
    bulkSell.appendChild(sellAllButton);
    const salvageAllButton = sellAllButton.cloneNode(false) as HTMLButtonElement;
    salvageAllButton.className = 'inventory-bulk-action inventory-salvage-all';
    salvageAllButton.textContent = '一键分解';
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
    menu.className = 'panel context-menu sunlit-context-menu';
    menu.style.position = 'fixed';
    menu.style.zIndex = '1200';
    menu.style.padding = '4px';
    menu.style.minWidth = '160px';
    menu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - 180))}px`;
    menu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - 220))}px`;
    const actions: { label: string; variant: string; action: (() => void) | null }[] = [
      { label: '分解', variant: 'salvage', action: this.onSalvage ? () => this.onSalvage?.(index) : null },
      { label: '升级', variant: 'upgrade', action: this.onUpgrade ? () => this.onUpgrade?.(index) : null },
      { label: '重铸', variant: 'reforge', action: this.onReforge ? () => this.onReforge?.(index) : null },
    ];
    actions.forEach((entry) => {
      if (!entry.action) return;
      const button = document.createElement('button');
      button.className = `context-action context-action-${entry.variant}`;
      button.textContent = entry.label;
      button.style.display = 'block';
      button.style.width = '100%';
      button.style.padding = '7px 10px';
      button.style.margin = '2px 0';
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

  private setSummary(id: string, count: number): string {
    const thresholds = Object.keys(SETS[id]?.bonuses ?? {}).map(Number);
    return setDisplayName(id) + ' ' + count + '/' + Math.max(1, ...thresholds);
  }

  private openSetDetails(trigger: HTMLButtonElement): void {
    this.closeDetails();
    this.tooltip?.remove();
    this.tooltip = null;
    const overlay = document.createElement('div');
    overlay.className = 'inventory-set-overlay';
    const panel = document.createElement('div');
    panel.className = 'panel inventory-set-dialog';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', '套装属性');
    const header = document.createElement('div');
    header.className = 'inventory-set-dialog-header';
    const heading = document.createElement('strong');
    heading.textContent = '套装属性';
    const close = document.createElement('button');
    close.className = 'panel-close-button';
    close.textContent = '×';
    close.setAttribute('aria-label', '关闭套装属性');
    close.onclick = () => { this.closeDetails(); trigger.focus(); };
    header.append(heading, close);
    const setPanel = document.createElement('div');
    setPanel.className = 'inventory-set-dialog-body mobile-scroll';
    const activeSets = this.equipment?.getActiveSetBonuses() ?? [];
    if (!activeSets.length) setPanel.textContent = '尚未装备套装。穿戴套装装备后，可在这里查看件数和全部套装效果。';
      activeSets.forEach((set) => {
        const title = document.createElement('div');
        title.className = 'inventory-set-title';
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '2px';
        setPixelText(title, this.setSummary(set.setId, set.count));
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
              .map(([stat, value]) => {
                const typedStat = stat as Stat;
                return `${statLabel(typedStat)} ${formatModifier(typedStat, value, bonus.valueModes?.[typedStat] ?? 'flat')}`;
              })
              .join(' · ');
            const specialText = bonus.special ? ` · ${this.specialLabel(bonus.special)}` : '';
            const line = document.createElement('div');
            line.className = active ? 'inventory-set-bonus is-active' : 'inventory-set-bonus';
            line.dataset.active = String(active);
            line.textContent = `${active ? '已激活' : '未激活'} · ${threshold}件：${statsText}${specialText}${bonus.description ? ' · ' + bonus.description : ''}`;
            setPanel.appendChild(line);
          });
      });

    panel.append(header, setPanel);
    overlay.appendChild(panel);
    overlay.onclick = event => { if (event.target === overlay) close.click(); };
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.click(); }
      if (event.key === 'Tab') { event.preventDefault(); close.focus(); }
    });
    this.root.appendChild(overlay);
    this.contextMenu = overlay;
    this.onDetailsOpen?.();
    close.focus();
  }

  private openItemDetails(item: Item, index: number | null, slot?: Slot): void {
    this.closeDetails();
    const overlay = document.createElement('div');
    overlay.className = 'item-details-overlay';
    const panel = document.createElement('div');
    panel.className = 'panel item-details sunlit-item-details mobile-scroll';
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
    button.setAttribute('aria-label', '关闭');
    button.textContent = '×';
    button.className = 'panel-close-button';
    button.style.position = 'absolute';
    button.style.right = '10px';
    button.style.top = '10px';
    button.style.width = '42px';
    button.style.height = '42px';
    button.style.minWidth = '42px';
    button.style.minHeight = '42px';
    button.style.padding = '0';
    button.style.fontSize = '18px';
    button.style.fontWeight = 'bold';
    button.style.cursor = 'pointer';
    button.style.touchAction = 'manipulation';
    button.onclick = () => this.close();
    panel.appendChild(button);
  }

  private makeItemBox(item: Item | null, label: string, emptyIcon?: string): HTMLDivElement {
    const box = document.createElement('div');
    box.className = item ? `inventory-item-slot sunlit-inset rarity-${item.rarity}` : 'inventory-item-slot sunlit-inset is-empty';
    box.style.width = this.mobile ? '48px' : '54px';
    box.style.height = this.mobile ? '48px' : '54px';
    if (item) box.style.setProperty('--item-rarity', INVENTORY_RARITY_COLORS[item.rarity]);
    box.style.display = 'flex';
    box.style.alignItems = 'center';
    box.style.justifyContent = 'center';
    box.style.position = 'relative';
    box.style.pointerEvents = 'auto';
    box.style.touchAction = this.mobile ? 'pan-y' : 'auto';
    box.title = label;
    if (item) {
      box.appendChild(createItemIcon(item, 'inventory-item-icon'));
      if (item.affixes.length > 0) {
        const dot = document.createElement('span');
        dot.className = 'inventory-affix-mark';
        dot.style.position = 'absolute';
        dot.style.top = '3px';
        dot.style.right = '3px';
        dot.style.width = '6px';
        dot.style.height = '6px';
        box.appendChild(dot);
      }
    } else if (emptyIcon) {
      box.appendChild(createItemIcon({ icon: emptyIcon }, 'inventory-item-icon inventory-empty-icon'));
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
        this.tooltip.className = 'panel tooltip sunlit-item-tooltip';
        this.tooltip.style.zIndex = '1000';
        this.tooltip.innerHTML = html;
        document.body.appendChild(this.tooltip);
      }
      const margin = 16;
      const viewportPadding = 8;
      this.tooltip.style.maxWidth = `${Math.max(80, Math.min(320, window.innerWidth - viewportPadding * 2))}px`;
      this.tooltip.style.maxHeight = `${Math.max(80, window.innerHeight - viewportPadding * 2)}px`;
      this.tooltip.style.overflowY = 'auto';
      const bounds = this.tooltip.getBoundingClientRect();
      const right = event.clientX + margin;
      const below = event.clientY + margin;
      const preferredLeft = right + bounds.width <= window.innerWidth - viewportPadding
        ? right
        : event.clientX - margin - bounds.width;
      const preferredTop = below + bounds.height <= window.innerHeight - viewportPadding
        ? below
        : event.clientY - margin - bounds.height;
      const maxLeft = Math.max(viewportPadding, window.innerWidth - viewportPadding - bounds.width);
      const maxTop = Math.max(viewportPadding, window.innerHeight - viewportPadding - bounds.height);
      const left = Math.max(viewportPadding, Math.min(preferredLeft, maxLeft));
      const top = Math.max(viewportPadding, Math.min(preferredTop, maxTop));
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

  private specialLabel(special: string): string {
    const labels: Record<string, string> = {
      chainLightning: '普攻命中时有 15% 概率触发连锁闪电（近战与法杖均可）',
      explosiveKill: '击杀时产生爆炸',
      aegisWalk: '每个来源增加最大生命 20% 的可回复护盾容量；脱战移动时每秒恢复最大生命 1% 的护盾',
      meteorOnAttack: '普攻命中时有 18% 概率召唤陨石',
      summonSkeletonOnKill: '击杀时召唤骷髅',
      executeFullHealth: '满血时命中伤害提高 25%（不含持续伤害）',
      dashInvincibility: '冲刺后短暂无敌',
      fireTrail: '移动留下火焰路径',
      lowHealthShield: '生命低于 30% 时获得最大生命 35% 的额外护盾，冷却 12 秒',
      burnMastery: '燃烧伤害提高 25%',
      freezeMastery: '冰霜异常触发率提高 50%，持续时间提高 20%',
      poisonMastery: '中毒伤害提高 35%，持续时间提高 25%',
      shockMastery: '闪电异常触发率提高 50%，并解锁闪电链',
      glacialNova: '解锁冰霜新星：半径和伤害提高 20%，并必定施加冰霜减速',
    };
    return labels[special] ?? special;
  }
}
