import { closestScrollable, isGestureSafeTarget, isMobileDevice } from '../utils/mobile';

export class MobileGestureGuard {
  static install(): void {
    if (!isMobileDevice()) return;

    document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
    document.addEventListener('gesturechange', (event) => event.preventDefault(), { passive: false });
    window.addEventListener('touchmove', this.onTouchMove, { passive: false });
  }

  private static onTouchMove = (event: TouchEvent): void => {
    if (!event.cancelable) return;

    if (event.touches.length > 1) {
      event.preventDefault();
      return;
    }

    const target = event.target as EventTarget | null;
    if (closestScrollable(target)) return;
    if (isGestureSafeTarget(target)) return;
    event.preventDefault();
  };
}
