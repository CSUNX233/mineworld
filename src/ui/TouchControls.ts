import type { InputManager } from '../core/InputManager';
import { isMobileDevice } from '../utils/mobile';

export interface TouchCallbacks {
  onAttackPress: () => void;
  onAttackRelease: () => void;
  onSkillPress: (key: string) => void;
  onSkillRelease: (key: string) => void;
  onPausePress: () => void;
  onInventoryPress: () => void;
  onViewPress: () => void;
  onSkillBarPress: () => void;
}

interface TouchLayout {
  joystickSize: number;
  joystickLeft: number;
  joystickBottom: number;
  attackSize: number;
  attackRight: number;
  attackBottom: number;
  skillSize: number;
  skillGap: number;
  skillRight: number;
  skillBottom: number;
  utilityTop: number;
  utilitySize: number;
  pauseSize: number;
  pauseRight: number;
  pauseTop: number;
}

const SKILL_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getLayout(): TouchLayout {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const minDim = Math.min(width, height);
  const scale = clamp(minDim / 420, 0.82, 1.18);
  const joystickSize = Math.round(clamp(118 * scale, 96, 150));
  const attackSize = Math.round(clamp(76 * scale, 54, 90));
  const skillSize = Math.round(clamp(48 * scale, 48, 58));
  const utilitySize = Math.round(clamp(48 * scale, 48, 56));
  const pauseSize = Math.round(clamp(48 * scale, 48, 56));
  const skillGap = Math.round(clamp(7 * scale, 6, 9));
  const edge = Math.round(clamp(15 * scale, 12, 20));
  const bottom = Math.round(clamp(22 * scale, 18, 28));

  return {
    joystickSize,
    joystickLeft: Math.round(clamp(16 * scale, 14, 22)),
    joystickBottom: bottom,
    attackSize,
    attackRight: edge,
    attackBottom: bottom,
    skillSize,
    skillGap,
    skillRight: edge + attackSize + skillGap,
    skillBottom: bottom,
    utilityTop: Math.round(clamp(78 * scale, 70, 96)),
    utilitySize,
    pauseSize,
    pauseRight: edge,
    pauseTop: Math.round(clamp(18 * scale, 14, 24)),
  };
}

export class TouchControls {
  private root: HTMLDivElement;
  private joystick: HTMLDivElement;
  private stick: HTMLDivElement;
  private activePointer: number | null = null;
  private activeLookPointer: { pointerId: number; lastX: number; lastY: number } | null = null;
  private mobile = isMobileDevice();

  constructor(parent: HTMLElement, private input: InputManager, private callbacks: TouchCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'touch-controls';
    this.root.style.position = 'absolute';
    this.root.style.inset = '0';
    this.root.style.pointerEvents = 'none';
    this.root.style.zIndex = '40';
    if (!this.mobile) this.root.style.display = 'none';

    const layout = getLayout();

    this.joystick = this.createJoystick(layout);
    this.stick = document.createElement('div');
    this.stick.className = 'touch-stick';
    this.stick.style.position = 'absolute';
    this.stick.style.left = '50%';
    this.stick.style.top = '50%';
    this.stick.style.width = `${Math.round(layout.joystickSize * 0.42)}px`;
    this.stick.style.height = `${Math.round(layout.joystickSize * 0.42)}px`;
    this.stick.style.borderRadius = '50%';
    this.stick.style.background = 'rgba(255,255,255,0.72)';
    this.stick.style.boxShadow = '0 0 8px rgba(0,0,0,0.35)';
    this.stick.style.transform = 'translate(-50%, -50%)';
    this.stick.style.pointerEvents = 'none';
    this.joystick.appendChild(this.stick);

    this.joystick.addEventListener('pointerdown', (event) => this.onJoystickDown(event));
    this.joystick.addEventListener('pointermove', (event) => this.onJoystickMove(event));
    this.joystick.addEventListener('pointerup', () => this.onJoystickUp());
    this.joystick.addEventListener('pointercancel', () => this.onJoystickUp());

    this.buildAttackButton(layout);
    this.buildSkillCluster(layout);
    this.buildUtilityRow(layout);
    this.buildPauseButton(layout);

    parent.appendChild(this.root);

    if (this.mobile) {
      window.addEventListener('pointerdown', this.onWindowPointerDown, { passive: false });
      window.addEventListener('pointermove', this.onWindowPointerMove);
      window.addEventListener('pointerup', this.onWindowPointerUp);
      window.addEventListener('pointercancel', this.onWindowPointerCancel);
    }
  }

  private createJoystick(layout: TouchLayout): HTMLDivElement {
    const joystick = document.createElement('div');
    joystick.className = 'touch-joystick';
    joystick.style.position = 'absolute';
    joystick.style.left = `calc(${layout.joystickLeft}px + env(safe-area-inset-left))`;
    joystick.style.bottom = `calc(${layout.joystickBottom}px + env(safe-area-inset-bottom))`;
    joystick.style.width = `${layout.joystickSize}px`;
    joystick.style.height = `${layout.joystickSize}px`;
    joystick.style.borderRadius = '50%';
    joystick.style.background = 'rgba(10,14,20,0.42)';
    joystick.style.border = '1px solid rgba(255,255,255,0.28)';
    joystick.style.pointerEvents = 'auto';
    joystick.style.touchAction = 'none';
    joystick.style.userSelect = 'none';
    joystick.style.webkitUserSelect = 'none';
    return joystick;
  }

  private buildAttackButton(layout: TouchLayout): void {
    const button = this.makeButton('⚔', layout.attackSize, 'touch-button touch-attack');
    button.style.right = `calc(${layout.attackRight}px + env(safe-area-inset-right))`;
    button.style.bottom = `calc(${layout.attackBottom}px + env(safe-area-inset-bottom))`;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      this.callbacks.onAttackPress();
    });
    const release = (event: PointerEvent): void => {
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      this.callbacks.onAttackRelease();
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    this.root.appendChild(button);
  }

  private buildSkillCluster(layout: TouchLayout): void {
    const cluster = document.createElement('div');
    cluster.className = 'touch-skill-cluster';
    cluster.style.position = 'absolute';
    cluster.style.right = `calc(${layout.skillRight}px + env(safe-area-inset-right))`;
    cluster.style.bottom = `calc(${layout.skillBottom}px + env(safe-area-inset-bottom))`;
    cluster.style.display = 'grid';
    cluster.style.gridTemplateColumns = `repeat(2, ${layout.skillSize}px)`;
    cluster.style.gridAutoRows = `${layout.skillSize}px`;
    cluster.style.gap = `${layout.skillGap}px`;
    cluster.style.pointerEvents = 'none';

    SKILL_KEYS.forEach((key, index) => {
      const button = this.makeButton(String(index + 1), layout.skillSize, 'touch-button touch-skill');
      button.dataset.key = key;
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        this.callbacks.onSkillPress(key);
      });
      const release = (event: PointerEvent): void => {
        if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
        this.callbacks.onSkillRelease(key);
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      cluster.appendChild(button);
    });
    this.root.appendChild(cluster);
  }

  private buildUtilityRow(layout: TouchLayout): void {
    const row = document.createElement('div');
    row.className = 'touch-utility-row';
    row.style.position = 'absolute';
    row.style.left = '50%';
    row.style.top = `calc(${layout.utilityTop}px + env(safe-area-inset-top))`;
    row.style.transform = 'translateX(-50%)';
    row.style.display = 'flex';
    row.style.gap = `${layout.skillGap + 3}px`;
    row.style.pointerEvents = 'none';

    const inventory = this.makeButton('🎒', layout.utilitySize, 'touch-button touch-utility');
    inventory.title = '背包';
    this.bindTap(inventory, () => this.callbacks.onInventoryPress());
    row.appendChild(inventory);

    const view = this.makeButton('👁', layout.utilitySize, 'touch-button touch-utility');
    view.title = '切换人称';
    this.bindTap(view, () => this.callbacks.onViewPress());
    row.appendChild(view);

    const skills = this.makeButton('✦', layout.utilitySize, 'touch-button touch-utility');
    skills.title = '技能配置';
    this.bindTap(skills, () => this.callbacks.onSkillBarPress());
    row.appendChild(skills);

    this.root.appendChild(row);
  }

  private buildPauseButton(layout: TouchLayout): void {
    const button = this.makeButton('⏸', layout.pauseSize, 'touch-button touch-pause');
    button.style.right = `calc(${layout.pauseRight}px + env(safe-area-inset-right))`;
    button.style.top = `calc(${layout.pauseTop}px + env(safe-area-inset-top))`;
    button.title = '暂停';
    this.bindTap(button, () => this.callbacks.onPausePress());
    this.root.appendChild(button);
  }

  private bindTap(button: HTMLDivElement, action: () => void): void {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      action();
    });
    button.addEventListener('pointerup', (event) => {
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    });
    button.addEventListener('pointercancel', (event) => {
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    });
  }

  private makeButton(label: string, size: number, className: string): HTMLDivElement {
    const button = document.createElement('div');
    button.className = className;
    button.textContent = label;
    button.style.width = `${size}px`;
    button.style.height = `${size}px`;
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.background = 'rgba(10,14,20,0.62)';
    button.style.border = '1px solid rgba(255,255,255,0.42)';
    button.style.borderRadius = '50%';
    button.style.color = '#fff';
    button.style.fontSize = `${Math.max(17, Math.round(size * 0.4))}px`;
    button.style.fontWeight = 'bold';
    button.style.pointerEvents = 'auto';
    button.style.touchAction = 'none';
    button.style.userSelect = 'none';
    button.style.webkitUserSelect = 'none';
    button.style.setProperty('-webkit-tap-highlight-color', 'transparent');
    return button;
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
    const max = rect.width * 0.38;
    const length = Math.hypot(dx, dy);
    const clampedLength = Math.min(max, length);
    const nx = length > 0 ? dx / length : 0;
    const ny = length > 0 ? dy / length : 0;
    this.stick.style.transform = `translate(calc(-50% + ${nx * clampedLength}px), calc(-50% + ${ny * clampedLength}px))`;

    this.input.release('KeyW');
    this.input.release('KeyS');
    this.input.release('KeyA');
    this.input.release('KeyD');

    const deadZone = Math.max(4, rect.width * 0.05);
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > deadZone) {
      this.input.press(dx > 0 ? 'KeyD' : 'KeyA');
    } else if (Math.abs(dy) > deadZone) {
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

  private isInteractiveTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest(
        '.touch-controls, .panel, .tooltip, .mobile-scroll, button, input, select, textarea, .context-menu',
      ),
    );
  }

  private onWindowPointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch' || this.isInteractiveTarget(event.target)) {
      this.activeLookPointer = null;
      return;
    }

    const target = event.target;
    const isGameSurface = target instanceof HTMLCanvasElement && target.closest('#app') === target.parentElement;
    if (!isGameSurface) {
      this.activeLookPointer = null;
      return;
    }

    if (this.isCameraLookArea(event.clientX)) {
      this.activeLookPointer = {
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
      };
    }
  };

  private onWindowPointerMove = (event: PointerEvent): void => {
    if (
      !this.activeLookPointer ||
      this.activeLookPointer.pointerId !== event.pointerId ||
      event.pointerType !== 'touch'
    ) {
      return;
    }

    const dx = event.clientX - this.activeLookPointer.lastX;
    const dy = event.clientY - this.activeLookPointer.lastY;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

    this.input.addMouseDelta(dx, dy);
    this.activeLookPointer.lastX = event.clientX;
    this.activeLookPointer.lastY = event.clientY;
  };

  private onWindowPointerUp = (event: PointerEvent): void => {
    if (this.activeLookPointer?.pointerId === event.pointerId) {
      this.activeLookPointer = null;
    }
  };

  private onWindowPointerCancel = (event: PointerEvent): void => {
    if (this.activeLookPointer?.pointerId === event.pointerId) this.activeLookPointer = null;
  };

  private isCameraLookArea(clientX: number): boolean {
    return clientX > window.innerWidth * 0.5;
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.onWindowPointerDown);
    window.removeEventListener('pointermove', this.onWindowPointerMove);
    window.removeEventListener('pointerup', this.onWindowPointerUp);
    window.removeEventListener('pointercancel', this.onWindowPointerCancel);
    this.root.remove();
  }
}
