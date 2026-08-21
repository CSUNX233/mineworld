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

export interface TouchSkillState {
  key: string;
  cooldown: number;
  cooldownRemaining: number;
}

interface TouchLayout {
  landscape: boolean;
  joystickSize: number;
  joystickLeft: number;
  joystickBottom: number;
  attackSize: number;
  attackRight: number;
  attackBottom: number;
  skillSize: number;
  skillGap: number;
  skillRadius: number;
  utilityTop: number;
  utilityBottom: number;
  utilitySize: number;
  pauseSize: number;
  pauseRight: number;
  pauseTop: number;
}

const SKILL_SLOT_COUNT = 4;
const SKILL_ANGLES = [130, 170, 210, 250];
const LOOK_SENSITIVITY = 1.2;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getLayout(): TouchLayout {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const minDim = Math.min(width, height);
  const landscape = width > height;
  const scale = clamp(minDim / 420, 0.8, 1.18);

  const joystickLeft = Math.round(clamp(18 * scale, 14, 26));
  const baseJoystickSize = Math.round(clamp(108 * scale, 88, 142));
  const joystickSize = Math.max(64, Math.min(baseJoystickSize, Math.round(width * 0.25 - joystickLeft)));
  const attackSize = Math.round(clamp(102 * scale, 82, 128));
  const skillSize = Math.round(clamp(52 * scale, 48, 64));
  const utilitySize = Math.round(clamp(50 * scale, 48, 60));
  const pauseSize = Math.round(clamp(50 * scale, 48, 60));
  const skillGap = Math.round(clamp(8 * scale, 6, 10));
  const edge = Math.round(clamp(20 * scale, 16, 28));
  const bottom = Math.round(clamp(24 * scale, 20, 32));

  return {
    landscape,
    joystickSize,
    joystickLeft,
    joystickBottom: Math.round(clamp(20 * scale, 16, 28)),
    attackSize,
    attackRight: edge,
    attackBottom: bottom,
    skillSize,
    skillGap,
    skillRadius: attackSize / 2 + skillSize / 2 + skillGap,
    utilityTop: Math.round(clamp(76 * scale, 66, 92)),
    utilityBottom: bottom + attackSize + skillGap + 16,
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
  private attackButton: HTMLDivElement;
  private skillCluster: HTMLDivElement;
  private utilityRow: HTMLDivElement;
  private pauseButton: HTMLDivElement;
  private utilityButtons: HTMLDivElement[] = [];
  private skillButtons: HTMLDivElement[] = [];
  private skillLabels: HTMLDivElement[] = [];
  private skillOverlays: HTMLDivElement[] = [];
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

    this.joystick = this.createJoystick();
    this.stick = this.createStick();
    this.joystick.appendChild(this.stick);
    this.attachJoystickListeners();

    this.attackButton = this.createAttackButton();
    this.skillCluster = this.createSkillCluster();
    this.utilityRow = this.createUtilityRow();
    this.pauseButton = this.createPauseButton();

    this.root.appendChild(this.joystick);
    this.root.appendChild(this.attackButton);
    this.root.appendChild(this.skillCluster);
    this.root.appendChild(this.utilityRow);
    this.root.appendChild(this.pauseButton);

    parent.appendChild(this.root);
    this.applyLayout(getLayout());

    if (this.mobile) {
      window.addEventListener('pointerdown', this.onWindowPointerDown, { passive: false });
      window.addEventListener('pointermove', this.onWindowPointerMove);
      window.addEventListener('pointerup', this.onWindowPointerUp);
      window.addEventListener('pointercancel', this.onWindowPointerCancel);
      window.addEventListener('resize', this.onResize);
      window.addEventListener('orientationchange', this.onResize);
      window.visualViewport?.addEventListener('resize', this.onResize);
    }
  }

  updateSkillStates(states: TouchSkillState[]): void {
    const equipped = states.slice(0, SKILL_SLOT_COUNT);
    for (let i = 0; i < SKILL_SLOT_COUNT; i++) {
      const state = equipped[i] ?? null;
      const button = this.skillButtons[i];
      const label = this.skillLabels[i];
      const overlay = this.skillOverlays[i];
      if (!button || !label || !overlay) continue;

      if (state) {
        button.dataset.key = state.key;
        button.classList.remove('is-empty');
        label.textContent = state.key.replace('Digit', '');
        const ready = state.cooldownRemaining <= 0;
        button.classList.toggle('is-cooldown', !ready);
        const ratio = state.cooldown > 0 ? state.cooldownRemaining / state.cooldown : 0;
        overlay.style.height = `${Math.max(0, Math.min(100, ratio * 100))}%`;
        overlay.style.opacity = ready ? '0' : '0.72';
        button.style.color = ready ? '#ffffff' : '#a7c7e6';
      } else {
        button.dataset.key = '';
        button.classList.add('is-empty');
        button.classList.remove('is-cooldown');
        label.textContent = '';
        overlay.style.height = '0%';
        overlay.style.opacity = '0';
        button.style.color = '';
      }
    }
  }

  private createJoystick(): HTMLDivElement {
    const joystick = document.createElement('div');
    joystick.className = 'touch-joystick';
    joystick.style.position = 'absolute';
    joystick.style.borderRadius = '50%';
    joystick.style.background = 'rgba(10,14,20,0.46)';
    joystick.style.border = '1px solid rgba(255,255,255,0.34)';
    joystick.style.pointerEvents = 'auto';
    joystick.style.touchAction = 'none';
    joystick.style.userSelect = 'none';
    joystick.style.webkitUserSelect = 'none';
    return joystick;
  }

  private createStick(): HTMLDivElement {
    const stick = document.createElement('div');
    stick.className = 'touch-stick';
    stick.style.position = 'absolute';
    stick.style.left = '50%';
    stick.style.top = '50%';
    stick.style.borderRadius = '50%';
    stick.style.background = 'rgba(255,255,255,0.72)';
    stick.style.boxShadow = '0 0 8px rgba(0,0,0,0.35)';
    stick.style.transform = 'translate(-50%, -50%)';
    stick.style.pointerEvents = 'none';
    return stick;
  }

  private attachJoystickListeners(): void {
    this.joystick.addEventListener('pointerdown', (event) => this.onJoystickDown(event));
    this.joystick.addEventListener('pointermove', (event) => this.onJoystickMove(event));
    this.joystick.addEventListener('pointerup', () => this.onJoystickUp());
    this.joystick.addEventListener('pointercancel', () => this.onJoystickUp());
  }

  private createAttackButton(): HTMLDivElement {
    const button = this.makeButton('⚔', 'touch-button touch-attack');
    button.style.position = 'absolute';
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
    return button;
  }

  private createSkillCluster(): HTMLDivElement {
    const cluster = document.createElement('div');
    cluster.className = 'touch-skill-cluster';
    cluster.style.position = 'absolute';
    cluster.style.inset = '0';
    cluster.style.pointerEvents = 'none';

    for (let i = 0; i < SKILL_SLOT_COUNT; i++) {
      const button = this.makeButton('', 'touch-button touch-skill is-empty');
      button.style.position = 'absolute';

      const label = document.createElement('div');
      label.className = 'touch-skill-label';
      label.style.position = 'relative';
      label.style.zIndex = '2';
      label.style.fontWeight = 'bold';
      button.appendChild(label);

      const overlay = document.createElement('div');
      overlay.className = 'touch-skill-cooldown';
      overlay.style.position = 'absolute';
      overlay.style.left = '0';
      overlay.style.right = '0';
      overlay.style.bottom = '0';
      overlay.style.height = '0%';
      overlay.style.background =
        'linear-gradient(0deg, rgba(0,0,0,0.82), rgba(18,35,58,0.72))';
      overlay.style.transition = 'height 0.12s linear, opacity 0.12s linear';
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
      button.appendChild(overlay);

      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        const key = button.dataset.key;
        if (key) this.callbacks.onSkillPress(key);
      });
      const release = (event: PointerEvent): void => {
        if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
        const key = button.dataset.key;
        if (key) this.callbacks.onSkillRelease(key);
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);

      cluster.appendChild(button);
      this.skillButtons.push(button);
      this.skillLabels.push(label);
      this.skillOverlays.push(overlay);
    }

    return cluster;
  }

  private createUtilityRow(): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'touch-utility-row';
    row.style.position = 'absolute';
    row.style.left = '50%';
    row.style.transform = 'translateX(-50%)';
    row.style.display = 'flex';
    row.style.pointerEvents = 'none';

    const inventory = this.makeButton('🎒', 'touch-button touch-utility');
    inventory.title = '背包';
    this.bindTap(inventory, () => this.callbacks.onInventoryPress());
    row.appendChild(inventory);
    this.utilityButtons.push(inventory);

    const view = this.makeButton('👁', 'touch-button touch-utility');
    view.title = '切换人称';
    this.bindTap(view, () => this.callbacks.onViewPress());
    row.appendChild(view);
    this.utilityButtons.push(view);

    const skills = this.makeButton('✦', 'touch-button touch-utility');
    skills.title = '技能配置';
    this.bindTap(skills, () => this.callbacks.onSkillBarPress());
    row.appendChild(skills);
    this.utilityButtons.push(skills);

    return row;
  }

  private createPauseButton(): HTMLDivElement {
    const button = this.makeButton('⏸', 'touch-button touch-pause');
    button.style.position = 'absolute';
    button.title = '暂停';
    this.bindTap(button, () => this.callbacks.onPausePress());
    return button;
  }

  private bindTap(button: HTMLDivElement, action: () => void): void {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      action();
    });
  }

  private makeButton(label: string, className: string): HTMLDivElement {
    const button = document.createElement('div');
    button.className = className;
    button.textContent = label;
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.overflow = 'hidden';
    button.style.background = 'rgba(10,14,20,0.62)';
    button.style.border = '1px solid rgba(255,255,255,0.42)';
    button.style.borderRadius = '50%';
    button.style.color = '#fff';
    button.style.fontWeight = 'bold';
    button.style.pointerEvents = 'auto';
    button.style.touchAction = 'none';
    button.style.userSelect = 'none';
    button.style.webkitUserSelect = 'none';
    button.style.setProperty('-webkit-tap-highlight-color', 'transparent');
    return button;
  }

  private applyLayout(layout: TouchLayout): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.joystick.style.left = `calc(${layout.joystickLeft}px + env(safe-area-inset-left))`;
    this.joystick.style.bottom = `calc(${layout.joystickBottom}px + env(safe-area-inset-bottom))`;
    this.joystick.style.width = `${layout.joystickSize}px`;
    this.joystick.style.height = `${layout.joystickSize}px`;
    this.stick.style.width = `${Math.round(layout.joystickSize * 0.42)}px`;
    this.stick.style.height = `${Math.round(layout.joystickSize * 0.42)}px`;

    this.attackButton.style.right = `calc(${layout.attackRight}px + env(safe-area-inset-right))`;
    this.attackButton.style.bottom = `calc(${layout.attackBottom}px + env(safe-area-inset-bottom))`;
    this.attackButton.style.width = `${layout.attackSize}px`;
    this.attackButton.style.height = `${layout.attackSize}px`;
    this.attackButton.style.fontSize = `${Math.max(28, Math.round(layout.attackSize * 0.42))}px`;

    const attackCenterX = width - layout.attackRight - layout.attackSize / 2;
    const attackCenterY = height - layout.attackBottom - layout.attackSize / 2;
    for (let i = 0; i < SKILL_SLOT_COUNT; i++) {
      const angle = SKILL_ANGLES[i];
      const rad = (angle * Math.PI) / 180;
      const radius = layout.skillRadius;
      const left = attackCenterX + Math.cos(rad) * radius - layout.skillSize / 2;
      const top = attackCenterY - Math.sin(rad) * radius - layout.skillSize / 2;
      const button = this.skillButtons[i];
      const label = this.skillLabels[i];
      if (!button || !label) continue;
      button.style.left = `${Math.round(left)}px`;
      button.style.top = `${Math.round(top)}px`;
      button.style.width = `${layout.skillSize}px`;
      button.style.height = `${layout.skillSize}px`;
      label.style.fontSize = `${Math.max(18, Math.round(layout.skillSize * 0.36))}px`;
    }

    this.utilityRow.style.gap = `${layout.skillGap + 3}px`;
    this.utilityButtons.forEach((button) => {
      button.style.width = `${layout.utilitySize}px`;
      button.style.height = `${layout.utilitySize}px`;
      button.style.fontSize = `${Math.max(18, Math.round(layout.utilitySize * 0.38))}px`;
    });
    if (layout.landscape) {
      this.utilityRow.style.top = '';
      this.utilityRow.style.bottom = `calc(${layout.utilityBottom}px + env(safe-area-inset-bottom))`;
    } else {
      this.utilityRow.style.bottom = '';
      this.utilityRow.style.top = `calc(${layout.utilityTop}px + env(safe-area-inset-top))`;
    }

    this.pauseButton.style.right = `calc(${layout.pauseRight}px + env(safe-area-inset-right))`;
    this.pauseButton.style.top = `calc(${layout.pauseTop}px + env(safe-area-inset-top))`;
    this.pauseButton.style.width = `${layout.pauseSize}px`;
    this.pauseButton.style.height = `${layout.pauseSize}px`;
    this.pauseButton.style.fontSize = `${Math.max(18, Math.round(layout.pauseSize * 0.38))}px`;
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

    this.input.addMouseDelta(dx * LOOK_SENSITIVITY, dy * LOOK_SENSITIVITY);
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

  private onResize = (): void => {
    if (!this.mobile) return;
    this.applyLayout(getLayout());
  };

  dispose(): void {
    window.removeEventListener('pointerdown', this.onWindowPointerDown);
    window.removeEventListener('pointermove', this.onWindowPointerMove);
    window.removeEventListener('pointerup', this.onWindowPointerUp);
    window.removeEventListener('pointercancel', this.onWindowPointerCancel);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onResize);
    this.root.remove();
  }
}
