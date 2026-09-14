export interface LayoutControl { id: string; label: string; element: HTMLElement }
type Positions = Record<string, { x: number; y: number }>;
const KEY = 'mineworld_touch_layout_v1';
const orientation = () => innerWidth > innerHeight ? 'landscape' : 'portrait';
function read(): Record<string, Positions> {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
function bounds() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.append(probe); const s = getComputedStyle(probe);
  const b = { l: (parseFloat(s.paddingLeft) || 0) + 8, r: innerWidth - (parseFloat(s.paddingRight) || 0) - 8,
    t: (parseFloat(s.paddingTop) || 0) + 8, b: innerHeight - (parseFloat(s.paddingBottom) || 0) - 8 };
  probe.remove(); return b;
}
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Called only on layout changes, never in the game frame loop. */
export function applyTouchPositions(controls: LayoutControl[]): void {
  const positions = read()[orientation()] ?? {}, b = bounds();
  controls[0]?.element.parentElement?.querySelector<HTMLElement>('.touch-move-zone')?.removeAttribute('style');
  for (const { id, element } of controls) {
    element.style.translate = 'none';
    const p = positions[id];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const r = element.getBoundingClientRect();
    const x = clamp(p.x * innerWidth, b.l + r.width / 2, b.r - r.width / 2);
    const y = clamp(p.y * innerHeight, b.t + r.height / 2, b.b - r.height / 2);
    element.style.translate = `${x - r.left - r.width / 2}px ${y - r.top - r.height / 2}px`;
    if (id === 'move') {
      const zone = element.parentElement?.querySelector<HTMLElement>('.touch-move-zone');
      if (zone) {
        const w = Math.min(innerWidth, r.width * 1.65), h = Math.min(innerHeight, r.height * 1.65);
        zone.style.cssText = `left:${clamp(x - w / 2, 0, innerWidth - w)}px;top:${clamp(y - h / 2, 0, innerHeight - h)}px;bottom:auto;width:${w}px;height:${h}px`;
      }
    }
  }
}

/** Edits inert copies while gameplay remains paused; cancel never touches saved positions. */
export function openTouchLayoutEditor(controls: LayoutControl[], onClose: () => void): () => void {
  const mode = orientation(), b = bounds();
  const overlay = document.createElement('div'); overlay.className = 'touch-controls touch-layout-editor';
  overlay.style.pointerEvents = 'auto';
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-label', '自定义按键位置');
  const bar = document.createElement('div'); bar.className = 'touch-layout-toolbar';
  const hint = document.createElement('span'); hint.textContent = '拖动按键调整位置 · 横竖屏分别保存';
  bar.append(hint); overlay.append(bar);
  const draft: Positions = {};
  for (const { id, label, element } of controls) {
    const r = element.getBoundingClientRect();
    const ghost = element.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('id'); ghost.removeAttribute('aria-disabled');
    ghost.classList.add('touch-layout-handle'); ghost.setAttribute('aria-label', `移动${label}`);
    ghost.style.cssText = `position:absolute!important;left:${r.left}px!important;top:${r.top}px!important;right:auto!important;bottom:auto!important;width:${r.width}px!important;height:${r.height}px!important;transform:none!important;translate:none!important;display:flex!important;pointer-events:auto!important;touch-action:none;opacity:1!important`;
    const caption = document.createElement('span'); caption.className = 'touch-layout-caption'; caption.textContent = label;
    ghost.append(caption); overlay.append(ghost);
    draft[id] = { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight };
    let pointer: number | null = null, dx = 0, dy = 0;
    ghost.onpointerdown = e => {
      if (pointer !== null) return;
      e.preventDefault(); pointer = e.pointerId; ghost.setPointerCapture(pointer);
      const rect = ghost.getBoundingClientRect(); dx = e.clientX - rect.left; dy = e.clientY - rect.top;
    };
    ghost.onpointermove = e => {
      if (pointer !== e.pointerId) return;
      e.preventDefault();
      const x = clamp(e.clientX - dx, b.l, b.r - r.width), y = clamp(e.clientY - dy, b.t, b.b - r.height);
      ghost.style.setProperty('left', `${x}px`, 'important'); ghost.style.setProperty('top', `${y}px`, 'important');
      draft[id] = { x: (x + r.width / 2) / innerWidth, y: (y + r.height / 2) / innerHeight };
    };
    const end = () => { pointer = null; };
    ghost.onpointerup = end; ghost.onpointercancel = end; ghost.onlostpointercapture = end;
  }
  let closed = false;
  const close = () => { if (closed) return; closed = true; window.removeEventListener('resize', close); window.removeEventListener('keydown', key, true); overlay.remove(); onClose(); };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } };
  const button = (label: string, action: () => void) => { const el = document.createElement('button'); el.textContent = label; el.onclick = action; bar.append(el); };
  const persist = (positions: Positions) => {
    try { const all = read(); all[mode] = positions; localStorage.setItem(KEY, JSON.stringify(all)); close(); }
    catch { hint.textContent = '保存失败，请检查浏览器存储空间后重试'; }
  };
  const fold = document.createElement('button'); fold.className = 'touch-layout-fold'; fold.textContent = '收起';
  fold.onclick = () => { const folded = bar.classList.toggle('is-folded'); fold.textContent = folded ? '展开工具栏' : '收起'; };
  bar.append(fold);
  button('恢复默认', () => persist({}));
  button('取消', close);
  button('保存布局', () => {
    persist(draft);
  });
  (document.getElementById('ui-root') ?? document.body).append(overlay); window.addEventListener('resize', close); window.addEventListener('keydown', key, true);
  return close;
}
