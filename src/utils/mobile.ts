const MOBILE_UA =
  /Android|iPhone|iPad|iPod|Mobile|Tablet|webOS|BlackBerry|IEMobile|Opera Mini|Silk|Kindle/i;

export function hasTouchSupport(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function hasCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaMobile = MOBILE_UA.test(navigator.userAgent);
  const touch = hasTouchSupport();
  const coarse = hasCoarsePointer();
  return uaMobile || (touch && coarse);
}

export function installMobileShell(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('mobile-ui', isMobileDevice());
  document.body.classList.toggle('mobile-ui', isMobileDevice());
}

export function isGestureSafeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      '.mobile-scroll, .touch-controls, input, select, textarea, button, .panel, .tooltip, .context-menu',
    ),
  );
}

export function closestScrollable(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  return target.closest('.mobile-scroll');
}
