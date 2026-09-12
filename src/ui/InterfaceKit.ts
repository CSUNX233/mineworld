/** Small, shared presentation layer. Effects never intercept game input. */
export const kitUrl = (path: string): string => `${import.meta.env.BASE_URL}assets/ui/sunlit/interface-kit/${path}.webp`;

export function playUiFeedback(kind: 'click' | 'equip' | 'unlock', target?: Element | null): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) return;
  const rect = target?.getBoundingClientRect();
  const effect = document.createElement('span');
  effect.className = 'kit-feedback';
  effect.setAttribute('aria-hidden', 'true');
  effect.style.backgroundImage = `url("${kitUrl(`feedback/${kind}-strip`)}")`;
  effect.style.left = `${rect ? rect.left + rect.width / 2 : innerWidth / 2}px`;
  effect.style.top = `${rect ? rect.top + rect.height / 2 : innerHeight / 2}px`;
  document.body.append(effect);
  setTimeout(() => effect.remove(), 340);
}

// Exact action labels keep decorative icons away from combat controls and item slots.
const navigation: Record<string, string> = {
  '角色属性': 'attributes', '查看属性': 'attributes', '套装属性': 'equipment-set', '套装': 'equipment-set',
  '营地天赋树': 'talent-tree', '天赋树': 'talent-tree', '局内天赋': 'talent-tree',
  '技能配置': 'skill-loadout', '技能栏配置': 'skill-loadout', '商店': 'shop', '购买': 'shop',
  '打造': 'crafting', '重铸': 'crafting', '定向重铸': 'crafting', '一键整理': 'sort', '一键分解': 'dismantle',
};

export function installInterfaceKit(root: HTMLElement): void {
  for (const kind of ['click', 'equip', 'unlock', 'selection']) {
    const image = new Image();
    image.fetchPriority = 'low';
    image.src = kitUrl(`feedback/${kind}-strip`);
  }
  const decorate = (element: Element) => {
    const candidates = [element, ...element.querySelectorAll('button, h2, h3')];
    for (const node of candidates) {
      if (!node.matches('button, h2, h3') || node.classList.contains('kit-navigation')) continue;
      const id = navigation[node.textContent?.trim() ?? ''];
      if (!id || node.querySelector('.sunlit-icon')) continue;
      node.classList.add('kit-navigation');
      (node as HTMLElement).style.setProperty('--kit-navigation', `url("${kitUrl(`navigation/${id}`)}")`);
    }
  };
  decorate(root);
  // Only newly attached UI subtrees; no per-frame scan or attribute observation.
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes)
      if (node instanceof Element) decorate(node);
  }).observe(root, { childList: true, subtree: true });
  root.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('.panel button, .merchant-panel button');
    if (button && !button.disabled && !button.matches('.meta-tree-node, .inventory-item-slot, .equipment-slot'))
      playUiFeedback('click', button);
  }, true);
}
