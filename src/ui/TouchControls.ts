import type { InputManager } from '../core/InputManager';

export interface TouchCallbacks {
  onSkillPress: (key: string) => void;
  onSkillRelease: (key: string) => void;
  onAttackPress: () => void;
  onAttackRelease: () => void;
}

export class TouchControls {
  private root: HTMLDivElement;
  private joystick: HTMLDivElement;
  private stick: HTMLDivElement;
  private activePointer: number | null = null;
  private buttons: HTMLDivElement;

  constructor(parent: HTMLElement, private input: InputManager, private callbacks: TouchCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'touch-controls';
    this.root.style.position = 'absolute';
    this.root.style.inset = '0';
    this.root.style.pointerEvents = 'none';
    this.root.style.zIndex = '12';

    this.joystick = document.createElement('div');
    this.joystick.style.position = 'absolute';
    this.joystick.style.left = '24px';
    this.joystick.style.bottom = '30px';
    this.joystick.style.width = '118px';
    this.joystick.style.height = '118px';
    this.joystick.style.borderRadius = '50%';
    this.joystick.style.background = 'rgba(10,14,20,0.45)';
    this.joystick.style.border = '1px solid rgba(255,255,255,0.28)';
    this.joystick.style.pointerEvents = 'auto';
    this.joystick.style.touchAction = 'none';
    this.root.appendChild(this.joystick);

    this.stick = document.createElement('div');
    this.stick.style.position = 'absolute';
    this.stick.style.left = '50%';
    this.stick.style.top = '50%';
    this.stick.style.width = '48px';
    this.stick.style.height = '48px';
    this.stick.style.borderRadius = '50%';
    this.stick.style.background = 'rgba(255,255,255,0.7)';
    this.stick.style.transform = 'translate(-50%, -50%)';
    this.stick.style.pointerEvents = 'none';
    this.joystick.appendChild(this.stick);

    this.buttons = document.createElement('div');
    this.buttons.style.position = 'absolute';
    this.buttons.style.right = '18px';
    this.buttons.style.bottom = '24px';
    this.buttons.style.display = 'grid';
    this.buttons.style.gridTemplateColumns = 'repeat(3, 54px)';
    this.buttons.style.gap = '8px';
    this.buttons.style.pointerEvents = 'none';
    this.root.appendChild(this.buttons);

    this.addButton('⚔', 'attack', () => this.callbacks.onAttackPress(), () => this.callbacks.onAttackRelease());
    this.addButton('1', 'Digit1', () => this.callbacks.onSkillPress('Digit1'), () => this.callbacks.onSkillRelease('Digit1'));
    this.addButton('2', 'Digit2', () => this.callbacks.onSkillPress('Digit2'), () => this.callbacks.onSkillRelease('Digit2'));
    this.addButton('3', 'Digit3', () => this.callbacks.onSkillPress('Digit3'), () => this.callbacks.onSkillRelease('Digit3'));
    this.addButton('4', 'Digit4', () => this.callbacks.onSkillPress('Digit4'), () => this.callbacks.onSkillRelease('Digit4'));

    this.joystick.addEventListener('pointerdown', (event) => this.onJoystickDown(event));
    this.joystick.addEventListener('pointermove', (event) => this.onJoystickMove(event));
    this.joystick.addEventListener('pointerup', () => this.onJoystickUp());
    this.joystick.addEventListener('pointercancel', () => this.onJoystickUp());

    parent.appendChild(this.root);
  }

  private addButton(label: string, key: string, down: () => void, up: () => void): void {
    const button = document.createElement('div');
    button.textContent = label;
    button.style.width = '54px';
    button.style.height = '54px';
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.background = key === 'attack' ? 'rgba(220,60,60,0.55)' : 'rgba(10,14,20,0.55)';
    button.style.border = '1px solid rgba(255,255,255,0.35)';
    button.style.borderRadius = '50%';
    button.style.color = '#fff';
    button.style.fontSize = '20px';
    button.style.fontWeight = 'bold';
    button.style.pointerEvents = 'auto';
    button.style.touchAction = 'none';
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      down();
    });
    button.addEventListener('pointerup', () => up());
    button.addEventListener('pointercancel', () => up());
    this.buttons.appendChild(button);
  }

  private onJoystickDown(event: PointerEvent): void {
    this.activePointer = event.pointerId;
    this.joystick.setPointerCapture(event.pointerId);
    this.onJoystickMove(event);
  }

  private onJoystickMove(event: PointerEvent): void {
    if (this.activePointer !== event.pointerId) return;
    const rect = this.joystick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const max = rect.width * 0.36;
    const length = Math.hypot(dx, dy);
    const clampedLength = Math.min(max, length);
    const nx = length > 0 ? dx / length : 0;
    const ny = length > 0 ? dy / length : 0;
    this.stick.style.transform = `translate(calc(-50% + ${nx * clampedLength}px), calc(-50% + ${ny * clampedLength}px))`;
    this.input.release('KeyW');
    this.input.release('KeyS');
    this.input.release('KeyA');
    this.input.release('KeyD');
    if (Math.abs(dx) > Math.abs(dy)) {
      this.input.press(dx > 0 ? 'KeyD' : 'KeyA');
    } else if (length > 4) {
      this.input.press(dy > 0 ? 'KeyS' : 'KeyW');
    }
  }

  private onJoystickUp(): void {
    this.activePointer = null;
    this.stick.style.transform = 'translate(-50%, -50%)';
    this.input.release('KeyW');
    this.input.release('KeyS');
    this.input.release('KeyA');
    this.input.release('KeyD');
  }
}
