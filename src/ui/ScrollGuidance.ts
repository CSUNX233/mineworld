/** Native scrolling and native range inputs retain keyboard, touch and accessibility behavior. */
export function installScrollGuidance(root: HTMLElement): void {
  const storageKey = 'mineworld_scroll_guidance_v1';
  let learned = new Set<string>();
  try { const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]'); if (Array.isArray(saved)) learned = new Set(saved.filter(value=>typeof value==='string')); } catch { /* Storage is optional. */ }
  const remember = (key: string) => {
    learned.add(key);
    try { localStorage.setItem(storageKey, JSON.stringify([...learned])); } catch { /* Keep session preference. */ }
  };
  const selector = '.mobile-scroll,.inventory-grid,.inventory-equipment,.meta-tree-viewport,.sunlit-skill-list,.controls-guide-body,.item-details-info,.inventory-set-dialog-body';
  const entries = new Map<HTMLElement, HTMLElement>();
  const ranges = new WeakSet<HTMLInputElement>();
  const confirmationKey = 'scroll-down-confirmed';
  let dialog: HTMLDialogElement | null = null;
  let dialogTarget: HTMLElement | null = null;
  const showScrollDialog = (target: HTMLElement) => {
    if (dialog || learned.has(confirmationKey)) return;
    dialogTarget = target;
    dialog = document.createElement('dialog');
    dialog.className = 'scroll-intro-dialog';
    dialog.setAttribute('aria-labelledby', 'scroll-intro-title');
    dialog.setAttribute('aria-describedby', 'scroll-intro-description');
    const title = document.createElement('h3'); title.id = 'scroll-intro-title'; title.textContent = '下方还有内容';
    const description = document.createElement('p'); description.id = 'scroll-intro-description';
    description.textContent = '向下滑动可以查看更多内容。电脑端也可以使用鼠标滚轮或拖动右侧滚动条。';
    const confirm = document.createElement('button'); confirm.type = 'button'; confirm.textContent = '确定';
    confirm.addEventListener('click', () => {
      remember(confirmationKey);
      dialog?.close(); dialog?.remove(); dialog = null; dialogTarget = null;
      schedule();
    });
    dialog.addEventListener('cancel', event => event.preventDefault());
    for (const name of ['pointerdown', 'pointerup', 'keydown', 'keyup', 'wheel'])
      dialog.addEventListener(name, event => event.stopPropagation());
    dialog.append(title, description, confirm); document.body.appendChild(dialog);
    dialog.showModal(); confirm.focus();
  };
  let pending = false, sequence = 0;
  const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(refresh); } };
  const resize = new ResizeObserver(schedule);
  const refresh = () => {
    pending = false;
    if (dialogTarget && (!dialogTarget.isConnected || !dialogTarget.getClientRects().length)) {
      dialog?.close(); dialog?.remove(); dialog = null; dialogTarget = null;
    }
    for (const [element, hint] of entries) {
      if (!element.isConnected) { hint.remove(); resize.unobserve(element); entries.delete(element); }
    }
    for (const element of root.querySelectorAll<HTMLElement>(selector)) {
      if (entries.has(element)) continue;
      const hint = document.createElement('button'); hint.type = 'button'; hint.className = 'scroll-guidance'; hint.hidden = true;
      hint.addEventListener('click',()=>{ remember(hint.dataset.lesson!); schedule(); });
      hint.id = `scroll-guidance-${++sequence}`;
      element.before(hint); entries.set(element, hint); resize.observe(element);
      element.setAttribute('aria-describedby', [element.getAttribute('aria-describedby'),hint.id].filter(Boolean).join(' '));
    }
    for (const [element, hint] of entries) {
      const style = getComputedStyle(element);
      const vertical = /auto|scroll/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 2;
      const horizontal = /auto|scroll/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 2;
      const more = element.scrollTop + element.clientHeight < element.scrollHeight - 3;
      if (vertical && more && element.clientHeight > 0 && element.getClientRects().length) showScrollDialog(element);
      const lesson = horizontal ? 'scroll-horizontal' : 'scroll-vertical';
      hint.dataset.lesson = lesson;
      hint.hidden = !horizontal || learned.has(lesson) || !element.getClientRects().length;
      if (hint.hidden) continue;
      hint.style.setProperty('--scroll-accent',style.getPropertyValue('--scroll-accent'));
      const text = horizontal ? '↔ 可左右移动 · 拖动或滚动查看完整内容' : more ? '↓ 下方还有内容 · 上下滑动 / 鼠标滚轮' : '↑ 已到底部 · 向上滑动查看前面的内容';
      if (hint.textContent !== `${text} · 知道了`) hint.textContent = `${text} · 知道了`;
    }
    for (const input of root.querySelectorAll<HTMLInputElement>('input[type=range]')) {
      if (ranges.has(input)) continue;
      ranges.add(input);
      const hint=document.createElement('span'); hint.className='scroll-guidance range-guidance';
      hint.hidden=learned.has('range') || Boolean(root.querySelector('.range-guidance:not([hidden])'));
      hint.id=`range-guidance-${++sequence}`; input.after(hint);
      input.setAttribute('aria-describedby',[input.getAttribute('aria-describedby'),hint.id].filter(Boolean).join(' '));
      const update=()=>{
        const min=Number(input.min||0),max=Number(input.max||100),value=Number(input.value);
        const percent=Math.round((value-min)/Math.max(.00001,max-min)*100);
        input.style.setProperty('--range-fill',`${percent}%`);
        hint.textContent=`← 减小 · 拖动滑块 · 增大 →　${percent}%`;
      };
      input.addEventListener('input',()=>{ update(); remember('range'); root.querySelectorAll<HTMLElement>('.range-guidance').forEach(el=>el.hidden=true); }); update();
    }
  };
  new MutationObserver(records=>{
    if(records.some(record=>record.target instanceof Element && !record.target.closest('.scroll-guidance')
      && (record.target.closest(selector) || [...record.addedNodes].some(node=>node instanceof Element && (node.matches(`${selector},input[type=range]`) || node.querySelector(`${selector},input[type=range]`)))
        || [...record.removedNodes].some(node=>node instanceof Element && (node.matches(selector) || node.querySelector(selector)))))) schedule();
  }).observe(root,{childList:true,subtree:true});
  let interaction: Element | null = null;
  for (const event of ['pointerdown','wheel','keydown']) root.addEventListener(event,e=>{
    interaction=e.target instanceof Element ? e.target.closest(selector) : null;
  },{capture:true,passive:true});
  root.addEventListener('scroll',event=>{
    if (event.target===interaction && event.target instanceof HTMLElement) {
      const hint=entries.get(event.target); if(hint?.dataset.lesson === 'scroll-horizontal')remember(hint.dataset.lesson);
    }
    schedule();
  },true);
  window.addEventListener('resize',schedule);
  schedule();
}
