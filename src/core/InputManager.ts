export class InputManager {
  keys = new Set<string>();
  mouseDown = new Set<number>();
  mouseDeltaX = 0;
  mouseDeltaY = 0;
  wheelDelta = 0;
  private analogX = 0;
  private analogY = 0;
  private justPressed = new Set<string>();
  private justReleased = new Set<string>();
  private mouseJustPressed = new Set<number>();
  private mouseJustReleased = new Set<number>();

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const code = event.code;
    if (!this.keys.has(code)) this.justPressed.add(code);
    this.keys.add(code);
    if (['Space', 'Tab', 'Escape'].includes(code)) event.preventDefault();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
    this.justReleased.add(event.code);
  };

  private onMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement) {
      this.mouseDeltaX += event.movementX;
      this.mouseDeltaY += event.movementY;
    }
  };

  private onMouseDown = (event: MouseEvent): void => {
    if (!document.pointerLockElement) return;
    this.mouseDown.add(event.button);
    this.mouseJustPressed.add(event.button);
  };

  private onMouseUp = (event: MouseEvent): void => {
    this.mouseDown.delete(event.button);
    this.mouseJustReleased.add(event.button);
  };

  private onWheel = (event: WheelEvent): void => {
    if (!document.pointerLockElement) return;
    this.wheelDelta += Math.sign(event.deltaY);
  };

  private onContextMenu = (event: MouseEvent): void => {
    if (document.pointerLockElement) event.preventDefault();
  };

  private onBlur = (): void => {
    this.reset();
  };

  reset(): void {
    this.keys.clear();
    this.mouseDown.clear();
    this.analogX = 0;
    this.analogY = 0;
    this.wheelDelta = 0;
    this.endFrame();
  }

  get movement(): { x: number; y: number } {
    let x = Number(this.isDown('KeyD')) - Number(this.isDown('KeyA')) + this.analogX;
    let y = Number(this.isDown('KeyW')) - Number(this.isDown('KeyS')) + this.analogY;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    return { x, y };
  }

  setAnalogMovement(x: number, y: number): void {
    this.analogX = x;
    this.analogY = y;
  }

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('wheel', this.onWheel);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('contextmenu', this.onContextMenu);
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  isMouseDown(button: number): boolean {
    return this.mouseDown.has(button);
  }

  press(code: string): void {
    if (!this.keys.has(code)) this.justPressed.add(code);
    this.keys.add(code);
  }

  release(code: string): void {
    this.keys.delete(code);
    this.justReleased.add(code);
  }

  pressMouse(button: number): void {
    this.mouseDown.add(button);
    this.mouseJustPressed.add(button);
  }

  addMouseDelta(dx: number, dy: number): void {
    this.mouseDeltaX += dx;
    this.mouseDeltaY += dy;
  }

  releaseMouse(button: number): void {
    this.mouseDown.delete(button);
    this.mouseJustReleased.add(button);
  }

  wasPressed(code: string): boolean {
    return this.justPressed.has(code);
  }

  wasReleased(code: string): boolean {
    return this.justReleased.has(code);
  }

  wasMousePressed(button: number): boolean {
    return this.mouseJustPressed.has(button);
  }

  consumeWheel(): number {
    const value = this.wheelDelta;
    this.wheelDelta = 0;
    return value;
  }

  endFrame(): void {
    this.justPressed.clear();
    this.justReleased.clear();
    this.mouseJustPressed.clear();
    this.mouseJustReleased.clear();
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  }

  requestPointerLock(canvas: HTMLCanvasElement): void {
    if (document.pointerLockElement === canvas) return;
    // Browsers may reject rapid reacquisition after closing a menu or Escape.
    // Leave the canvas clickable so the next user gesture can acquire it.
    const request = canvas.requestPointerLock() as Promise<void> | undefined;
    request?.catch(() => {});
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement !== null;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('contextmenu', this.onContextMenu);
  }
}
