import type { Item, MaterialId } from '../types';
import { MATERIALS } from '../data/materials';
import { RARITY_AFFIX_COUNT } from '../data/recipes';
import { AffixSystem, formatModifier, statLabel } from '../items/AffixSystem';
import { CraftingSystem, MAX_REFORGES, type ReforgeOptions } from '../items/CraftingSystem';
import { craftingTagDefinition, type CraftingTag } from '../items/CraftingTags';
import { defaultAffixValueMode } from '../items/StatRules';
import './p5.css';

export function createReforgePanel(
  item: Item,
  wallet: { gold: number; materials: Partial<Record<MaterialId, number>> },
  onConfirm: (options: ReforgeOptions) => void,
  onCancel: () => void,
): HTMLElement {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = document.createElement('div');
  overlay.className = 'p5-reforge-overlay';
  const panel = document.createElement('section');
  panel.className = 'panel p5-reforge-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', '定向重铸');
  const header = document.createElement('div');
  header.className = 'p5-reforge-header';
  const title = document.createElement('h2');
  title.className = 'p5-reforge-title';
  title.textContent = '定向重铸';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'p5-reforge-close';
  close.textContent = '×';
  close.setAttribute('aria-label', '返回背包');
  header.append(title, close);
  const body = document.createElement('div');
  body.className = 'p5-reforge-body mobile-scroll';
  const itemName = document.createElement('div');
  itemName.className = 'p5-reforge-item';
  itemName.textContent = `${item.name} · 装备等级 ${item.itemLevel}`;
  const remaining = document.createElement('p');
  remaining.className = 'p5-reforge-help';
  remaining.textContent = `剩余重铸 ${CraftingSystem.remainingReforges(item)}/${MAX_REFORGES} 次；每次普通、定向或保留重铸均消耗一次额度。`;
  const makeSelect = (label: string): { field: HTMLLabelElement; select: HTMLSelectElement } => {
    const field = document.createElement('label');
    field.className = 'p5-reforge-field';
    const caption = document.createElement('span');
    caption.textContent = label;
    const select = document.createElement('select');
    field.append(caption, select);
    return { field, select };
  };
  const option = (select: HTMLSelectElement, value: string, label: string): void => {
    const entry = document.createElement('option');
    entry.value = value;
    entry.textContent = label;
    select.appendChild(entry);
  };
  const direction = makeSelect('机制方向');
  const lock = makeSelect('保留一个普通词条');
  option(lock.select, '', '不保留');
  item.affixes.forEach(affix => {
    if (!affix.special) option(lock.select, affix.id, `${affix.name} · ${AffixSystem.describe(affix)}`);
  });
  const help = document.createElement('p');
  help.className = 'p5-reforge-help';
  const protectedEffects = document.createElement('p');
  protectedEffects.className = 'p5-reforge-help';
  protectedEffects.textContent = '保留词条的数值不变；特殊机制全部原样保留，不进入普通重抽池。品质与装备基础属性不变。';
  const surcharges = document.createElement('p');
  surcharges.className = 'p5-reforge-help';
  surcharges.textContent = '定向：金币 +25%、元素碎片 +1；保留：金币 +50%、元素碎片 +1。合用时金币 +75%、元素碎片 +2，下方已计入总费用。';
  const result = document.createElement('p');
  result.className = 'p5-reforge-help';
  const candidateTitle = document.createElement('strong');
  const candidates = document.createElement('ul');
  candidates.className = 'p5-reforge-candidates';
  const cost = document.createElement('div');
  cost.className = 'p5-reforge-cost';
  const status = document.createElement('p');
  status.className = 'p5-reforge-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  body.append(itemName, remaining, direction.field, help, lock.field, protectedEffects, surcharges, result, candidateTitle, candidates, cost, status);
  const actions = document.createElement('div');
  actions.className = 'p5-reforge-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = '返回背包';
  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.textContent = '确认重铸';
  actions.append(cancel, confirm);
  panel.append(header, body, actions);
  overlay.appendChild(panel);
  let settled = false;
  const finish = (callback: () => void): void => {
    if (settled) return;
    settled = true;
    overlay.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
    callback();
  };
  const cancelPanel = (): void => finish(onCancel);
  close.onclick = cancelPanel;
  cancel.onclick = cancelPanel;
  overlay.onclick = event => { if (event.target === overlay) cancelPanel(); };
  const options = (): ReforgeOptions => ({
    ...(direction.select.value ? { tag: direction.select.value as CraftingTag } : {}),
    ...(lock.select.value ? { lockedAffixId: lock.select.value } : {}),
  });
  const lockedDefinition = (): string | undefined => {
    const locked = item.affixes.find(affix => affix.id === lock.select.value && !affix.special);
    return locked ? AffixSystem.definitionId(locked) : undefined;
  };
  const populateDirections = (): void => {
    const selected = direction.select.value;
    direction.select.replaceChildren();
    option(direction.select, '', '普通重铸 · 不定向');
    const excluded = lockedDefinition();
    for (const tag of AffixSystem.availableTags(item.slot)) {
      if (AffixSystem.candidatesForTag(item.slot, tag.id).some(def => def.id !== excluded)) {
        option(direction.select, tag.id, tag.name);
      }
    }
    if ([...direction.select.options].some(entry => entry.value === selected)) direction.select.value = selected;
  };
  const update = (): void => {
    const selection = options();
    const tag = selection.tag && craftingTagDefinition(selection.tag);
    help.textContent = tag ? `${tag.description} 至少重抽出 1 个此方向的普通词条，其余候选权重提高至 3 倍；不保证最高数值。红装的专属机制和基础属性保持不变。` : '从本底材普通词条池重抽，不保证结果更强。';
    const ordinaryCount = item.affixes.filter(affix => !affix.special).length || RARITY_AFFIX_COUNT[item.rarity][0];
    result.textContent = `结果保留 ${selection.lockedAffixId ? 1 : 0} 个普通词条，重抽 ${Math.max(0, ordinaryCount - (selection.lockedAffixId ? 1 : 0))} 个；特殊机制保持原样。`;
    candidateTitle.textContent = tag ? '提高权重的真实候选与数值范围' : '本底材真实候选与数值范围';
    candidates.replaceChildren();
    const excluded = lockedDefinition();
    for (const def of AffixSystem.candidatePreview(item.slot, item.rarity, item.itemLevel, selection.tag)) {
      if (def.id === excluded) continue;
      const line = document.createElement('li');
      const mode = def.mode ?? defaultAffixValueMode(def.stat);
      line.textContent = `${def.name} · ${statLabel(def.stat)} ${formatModifier(def.stat, def.min, mode)} 至 ${formatModifier(def.stat, def.max, mode)}`;
      candidates.appendChild(line);
    }
    cost.replaceChildren();
    confirm.disabled = true;
    if (!CraftingSystem.canReforge(item, selection)) {
      status.textContent = CraftingSystem.reforgeUnavailableReason(item, selection) ?? '当前无法重铸';
      cost.textContent = '当前选择无法重铸，无需支付。';
      return;
    }
    const price = CraftingSystem.reforgeCost(item, selection);
    const addCost = (label: string, needed: number, available: number): boolean => {
      const enough = Number.isFinite(available) && available >= needed;
      const line = document.createElement('div');
      line.textContent = `${label}：需要 ${needed} · 持有 ${available}`;
      if (!enough) line.className = 'is-missing';
      cost.appendChild(line);
      return enough;
    };
    let affordable = addCost('金币', price.gold, wallet.gold);
    for (const material of price.materials) {
      const enough = addCost(MATERIALS[material.materialId].name, material.amount, wallet.materials[material.materialId] ?? 0);
      affordable = affordable && enough;
    }
    confirm.disabled = !affordable;
    status.textContent = affordable ? `支付上述费用后消耗 1 次额度，剩余 ${Math.max(0, CraftingSystem.remainingReforges(item) - 1)} 次。` : '金币或材料不足。';
  };
  direction.select.onchange = update;
  lock.select.onchange = () => { populateDirections(); update(); };
  confirm.onclick = () => {
    update();
    if (!confirm.disabled) finish(() => onConfirm(options()));
  };
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelPanel();
    } else if (event.key === 'Tab') {
      const controls = [...panel.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button, select')].filter(control => !control.disabled);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  populateDirections();
  update();
  requestAnimationFrame(() => { if (overlay.isConnected) close.focus(); });
  return overlay;
}
