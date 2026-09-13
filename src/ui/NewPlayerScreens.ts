export function newPlayerScreen(kind: 'view' | 'mercy', choose: (firstPerson: boolean) => void): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.className = `sunlit-menu-overlay newcomer-overlay newcomer-${kind}`;
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
  const panel = document.createElement('section'); panel.className = 'newcomer-panel';
  const heading = document.createElement('h2'); heading.id = 'newcomer-heading';
  heading.textContent = kind === 'view' ? '用你的方式，踏入深渊' : '来自作者的善意ovo';
  overlay.setAttribute('aria-labelledby', heading.id);
  const text = document.createElement('p');
  text.textContent = kind === 'view' ? '选择初始视角。用视角按钮随时切换。' : '第一次跌倒，不算输。这次免费复活，装备和进度都留着。下一次，可要小心啦。';
  const buttons = document.createElement('div'); buttons.className = 'newcomer-actions';
  for (const [label, first] of (kind === 'view' ? [['第一人称 · 身临其境', true], ['第三人称 · 纵观战局', false]] : [['接受善意，满状态复活', false]]) as [string, boolean][]) {
    const button = document.createElement('button'); button.className = 'sunlit-menu-button';
    button.textContent = label; button.onclick = () => { button.disabled = true; choose(first); };
    buttons.append(button);
  }
  panel.append(heading, text, buttons); overlay.append(panel);
  // Trap keyboard focus within the mandatory choice without blocking browser shortcuts.
  overlay.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const items = [...buttons.querySelectorAll('button')];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    event.preventDefault(); items[(index + (event.shiftKey ? items.length - 1 : 1)) % items.length]?.focus();
  });
  queueMicrotask(() => buttons.querySelector('button')?.focus());
  return overlay;
}
