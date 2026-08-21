import { isMobileDevice } from '../utils/mobile';

type BackAction = {
  id: string;
  close: () => void;
};

export class MobileBackHandler {
  private stack: BackAction[] = [];
  private rootHandler: (() => boolean) | null = null;
  private readonly mobile = isMobileDevice();

  constructor() {
    if (this.mobile) {
      this.pushGuard();
      window.addEventListener('popstate', this.onPopState);
    }
  }

  setRootHandler(handler: (() => boolean) | null): void {
    this.rootHandler = handler;
  }

  register(id: string, close: () => void): void {
    if (!this.mobile) return;
    this.unregister(id);
    this.stack.push({ id, close });
  }

  unregister(id: string): void {
    if (!this.mobile) return;
    this.stack = this.stack.filter((action) => action.id !== id);
  }

  clear(): void {
    this.stack = [];
  }

  private pushGuard(): void {
    try {
      window.history.pushState({ mineworldMobileBack: true }, '');
    } catch {
      // Some sandboxed webviews may not allow history mutation.
    }
  }

  private onPopState = (): void => {
    if (!this.mobile) return;

    if (this.stack.length > 0) {
      const action = this.stack[this.stack.length - 1];
      action.close();
      this.pushGuard();
      return;
    }

    const handled = this.rootHandler?.() ?? false;
    if (handled) this.pushGuard();
  };
}
