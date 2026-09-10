import { JoystickTapJump } from './JoystickTapJump';
import type { InputManager } from '../core/InputManager';
import { isMobileDevice } from '../utils/mobile';
import { createUiIcon } from './UiAssets';

export interface TouchCallbacks {
  onAimBegin: (key: string | null) => void;
  onAim: (x: number, y: number) => void;
  onAimEnd: (cancel: boolean) => void;
  onAttackPress: () => void;
  onAttackRelease: () => void;
  onSkillPress: (key: string) => void;
  onSkillRelease: (key: string) => void;
  onPausePress: () => void;
  onInventoryPress: () => void;
  onViewPress: () => void;
  onSkillBarPress: () => void;
  onInteractPress: () => void;
}

export interface TouchSkillState {
  id?: string;
  name: string;
  manaCost: number;
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
const SKILL_ANGLES = [90, 135, 180, 225];
const HALF_CM_PX = 19;

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
  const baseJoystickSize = Math.round(clamp(108 * scale, 88, 142) * 1.2);
  const joystickSize = Math.max(76, Math.min(baseJoystickSize, Math.round(width * 0.3 - joystickLeft)));
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
    joystickBottom: Math.round(clamp(20 * scale, 16, 28)) + HALF_CM_PX,
    attackSize,
    attackRight: edge,
    attackBottom: bottom + HALF_CM_PX,
    skillSize,
    skillGap,
    skillRadius: attackSize / 2 + skillSize / 2 + skillGap,
    utilityTop: Math.round(clamp(76 * scale, 66, 92)),
    utilityBottom: Math.round(clamp(8 * scale, 6, 12)),
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
  private readonly tapJump = new JoystickTapJump();
  private interactButton: HTMLDivElement;
  private viewButton: HTMLDivElement | null = null;
  private enabled = false;
  private utilityButtons: HTMLDivElement[] = [];
  private skillButtons: HTMLDivElement[] = [];
  private skillLabels: HTMLDivElement[] = [];
  private skillOverlays: HTMLDivElement[] = [];
  private activePointer: number | null = null;
  private joystickRect: DOMRect | null = null;
  private joystickRest: { left: string; top: string; bottom: string } | null = null;
  private sprintHeld = false;
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
    this.interactButton = this.makeButton('交互', 'touch-button touch-interact');
    this.interactButton.style.position = 'absolute';
    this.bindTap(this.interactButton, () => this.callbacks.onInteractPress());

    const moveZone = document.createElement('div');
    moveZone.className = 'touch-move-zone';
    moveZone.setAttribute('aria-label', '移动触控区');
    moveZone.addEventListener('pointerdown', event => this.onJoystickDown(event));
    this.root.appendChild(moveZone);
    this.root.appendChild(this.joystick);
    this.root.appendChild(this.attackButton);
    this.root.appendChild(this.skillCluster);
    this.root.appendChild(this.utilityRow);
    this.root.appendChild(this.pauseButton);
    this.root.appendChild(this.interactButton);

    parent.appendChild(this.root);
    this.applyLayout(getLayout());

    if (this.mobile) {
      window.addEventListener('pointerdown', this.onWindowPointerDown, { passive: false });
      window.addEventListener('pointermove', this.onWindowPointerMove);
      window.addEventListener('pointerup', this.onWindowPointerUp);
      window.addEventListener('pointercancel', this.onWindowPointerCancel);
      window.addEventListener('resize', this.onResize);
      window.addEventListener('blur', this.onSuspend);
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      window.addEventListener('orientationchange', this.onResize);
      window.visualViewport?.addEventListener('resize', this.onResize);
    }
  }

  private cancelAim: (() => void) | null = null;

  setGameplayState(enabled: boolean, firstPerson: boolean, interaction: string | null): void {
    if (this.enabled && !enabled) {
      this.cancelAim?.();
      this.onJoystickUp();
      this.activeLookPointer = null;
      this.input.reset();
    }
    this.enabled = enabled;
    this.root.style.display = this.mobile && enabled ? 'block' : 'none';
    if (this.viewButton) {
      this.viewButton.textContent = firstPerson ? '一人称' : '三人称';
      this.viewButton.setAttribute('aria-label', firstPerson ? '切换第三人称' : '切换第一人称');
    }
    this.interactButton.style.display = interaction ? 'flex' : 'none';
    this.interactButton.textContent = interaction ?? '交互';
    this.interactButton.setAttribute('aria-label', interaction ?? '交互');
  }

  updateSkillStates(states: TouchSkillState[], mana = Infinity): void {
    const equipped = states.slice(0, SKILL_SLOT_COUNT);
    for (let i = 0; i < SKILL_SLOT_COUNT; i++) {
      const state = equipped[i] ?? null;
      const button = this.skillButtons[i];
      const label = this.skillLabels[i];
      const overlay = this.skillOverlays[i];
      if (!button || !label || !overlay) continue;
      const iconId = state?.id ?? '';
      if (button.dataset.icon !== iconId) {
        button.querySelector('.sunlit-icon')?.remove();
        if (iconId) button.prepend(createUiIcon(iconId));
        button.dataset.icon = iconId;
      }

      if (state) {
        button.dataset.key = state.key;
        button.classList.remove('is-empty');
        const ready = state.cooldownRemaining <= 0 && mana >= state.manaCost;
        label.textContent = state.cooldownRemaining > 0 ? state.cooldownRemaining.toFixed(1) : state.name;
        label.style.fontSize = '11px';
        button.setAttribute('aria-label', `${state.name}${mana < state.manaCost ? ' · 法力不足' : ''}`);
        button.setAttribute('aria-disabled', String(!ready));
        button.classList.toggle('is-cooldown', !ready);
        const ratio = state.cooldown > 0 ? state.cooldownRemaining / state.cooldown : 0;
        overlay.style.height = `${Math.max(0, Math.min(100, ratio * 100))}%`;
        overlay.style.opacity = ready ? '0' : '0.72';
        button.style.color = ready ? '#ffffff' : '#a7c7e6';
      } else {
        button.dataset.key = '';
        button.classList.add('is-empty');
        button.classList.remove('is-cooldown');
        label.textContent = '配置';
        label.style.fontSize = '11px';
        button.setAttribute('aria-label', '配置技能');
        button.setAttribute('aria-disabled', 'false');
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
    const release = (event: PointerEvent): void => {
      if (event.pointerId === this.activePointer) this.onJoystickUp();
    };
    this.joystick.addEventListener('pointerup', event => {
      if (event.pointerId !== this.activePointer) return;
      this.onJoystickMove(event);
      const jump = this.tapJump.end(event.clientX, event.clientY, event.timeStamp);
      this.onJoystickUp(false);
      if (jump) { this.input.press('Space'); this.input.release('Space'); }
    });
    this.joystick.addEventListener('pointercancel', release);
    this.joystick.addEventListener('lostpointercapture', release);
  }

  private createAttackButton(): HTMLDivElement {
    const button = this.makeButton('⚔', 'touch-button touch-attack');
    button.style.position = 'absolute';
    this.bindDirectionalControl(button, true);
    return button;
  }

  private bindDirectionalControl(button: HTMLDivElement, attack: boolean): void {
    let pointer: number | null = null;
    let startX = 0, startY = 0, cancelled = false, key = '';
    const thumb = document.createElement('span');
    thumb.className = 'touch-aim-thumb';
    thumb.hidden = true;
    button.appendChild(thumb);
    let stickRadius = 20;
    const indicator = document.createElement('div');
    indicator.className = 'touch-direction-indicator';
    indicator.hidden = true;
    this.root.appendChild(indicator);
    const finish = (cancel: boolean) => {
      if (pointer === null) return;
      const id = pointer;
      pointer = null;
      if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
      if (attack) this.callbacks.onAttackRelease();
      else if (!cancel && !cancelled && button.getAttribute('aria-disabled') !== 'true') {
        this.callbacks.onSkillPress(key);
        this.callbacks.onSkillRelease(key);
      }
      this.callbacks.onAimEnd(cancel || cancelled);
      indicator.hidden = true;
      thumb.hidden = true;
      button.classList.remove('is-aiming', 'is-aim-cancelled');
      this.cancelAim = null;
    };
    button.addEventListener('pointerdown', event => {
      event.preventDefault(); event.stopPropagation();
      if (!this.enabled || pointer !== null) return;
      key = button.dataset.key ?? '';
      if (!attack && !key) { this.callbacks.onSkillBarPress(); return; }
      if (!attack && button.getAttribute('aria-disabled') === 'true') return;
      this.cancelAim?.();
      pointer = event.pointerId; startX = event.clientX; startY = event.clientY; cancelled = false;
      button.setPointerCapture(pointer);
      this.callbacks.onAimEnd(true);
      this.callbacks.onAimBegin(attack ? null : key);
      this.cancelAim = () => finish(true);
      const rect = button.getBoundingClientRect();
      stickRadius = rect.width * 0.3;
      thumb.hidden = false;
      thumb.style.transform = 'translate(-50%, -50%)';
      indicator.style.left = Math.max(90, Math.min(window.innerWidth - 90, rect.left + rect.width / 2)) + 'px';
      indicator.style.top = Math.max(32, rect.top - 52) + 'px';
      indicator.classList.remove('has-direction');
      indicator.style.color = '#fff0ce';
      button.classList.add('is-aiming');
      indicator.hidden = false;
      indicator.textContent = attack ? '拖动调整方向' : '拖动瞄准 · 松手施放';
      if (attack) this.callbacks.onAttackPress();
    });
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      event.preventDefault(); event.stopPropagation();
      const samples = event.getCoalescedEvents?.();
      const latest = samples?.length ? samples[samples.length - 1] : event;
      const dx = latest.clientX - startX, dy = latest.clientY - startY;
      const length = Math.hypot(dx, dy);
      // Hysteresis prevents jitter between cast and cancel near the boundary.
      cancelled = !attack && length > (cancelled ? 130 : 150);
      const factor = Math.min(1, stickRadius / Math.max(1, length));
      thumb.style.transform = 'translate(calc(-50% + ' + dx * factor + 'px), calc(-50% + ' + dy * factor + 'px))';
      button.classList.toggle('is-aim-cancelled', cancelled);
      indicator.style.color = cancelled ? '#ff927b' : '#fff0ce';
      indicator.textContent = cancelled ? '松手取消 · 拖回继续瞄准' : length < 5 ? '拖动瞄准' : '➤';
      indicator.style.setProperty('--aim-angle', Math.atan2(dy, dx) + 'rad');
      indicator.classList.toggle('has-direction', !cancelled && length >= 5);
      if (!cancelled) this.callbacks.onAim(dx, dy);
    };
    button.addEventListener('pointermove', move);
    button.addEventListener('pointerup', event => { if (event.pointerId === pointer) { move(event); finish(false); } });
    button.addEventListener('pointercancel', event => { if (event.pointerId === pointer) finish(true); });
    button.addEventListener('lostpointercapture', event => { if (event.pointerId === pointer) finish(true); });
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

      this.bindDirectionalControl(button, false);

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

    const inventory = this.makeButton('背包', 'touch-button touch-utility touch-inventory');
    inventory.replaceChildren(createUiIcon('bag'));
    inventory.title = '背包';
    this.bindTap(inventory, () => this.callbacks.onInventoryPress());
    row.appendChild(inventory);
    this.utilityButtons.push(inventory);

    const view = this.makeButton('视角', 'touch-button touch-utility');
    this.viewButton = view;
    view.title = '切换人称';
    this.bindTap(view, () => this.callbacks.onViewPress());
    row.appendChild(view);
    this.utilityButtons.push(view);

    const skills = this.makeButton('技能配置', 'touch-button touch-utility');
    skills.textContent = '技能';
    skills.title = '技能配置';
    this.bindTap(skills, () => this.callbacks.onSkillBarPress());
    row.appendChild(skills);
    this.utilityButtons.push(skills);

    return row;
  }

  private createPauseButton(): HTMLDivElement {
    const button = this.makeButton('暂停', 'touch-button touch-pause');
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
    button.setAttribute('role', 'button');
    button.setAttribute('aria-label', label);
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
      button.style.left = `calc(${Math.round(left)}px - env(safe-area-inset-right))`;
      button.style.top = `calc(${Math.round(Math.min(top, height - layout.skillSize - 10))}px - env(safe-area-inset-bottom))`;
      button.style.width = `${layout.skillSize}px`;
      button.style.height = `${layout.skillSize}px`;
      label.style.fontSize = '11px';
    }

    this.utilityRow.style.gap = `${layout.skillGap + 3}px`;
    this.utilityButtons.forEach((button) => {
      button.style.width = `${layout.utilitySize}px`;
      button.style.height = `${layout.utilitySize}px`;
      button.style.fontSize = '14px';
    });
    if (layout.landscape) {
      this.utilityRow.style.top = '';
      this.utilityRow.style.bottom = `calc(${layout.utilityBottom}px + env(safe-area-inset-bottom))`;
    } else {
      this.utilityRow.style.bottom = '';
      this.utilityRow.style.top = `calc(${layout.utilityTop}px + env(safe-area-inset-top))`;
    }

    this.pauseButton.style.right = 'calc(max(12px, env(safe-area-inset-right)) + 90px + 10px)';
    this.pauseButton.style.top = 'max(12px, env(safe-area-inset-top))';
    this.pauseButton.style.width = `${layout.pauseSize}px`;
    this.pauseButton.style.height = `${layout.pauseSize}px`;
    this.pauseButton.style.fontSize = `${Math.max(18, Math.round(layout.pauseSize * 0.38))}px`;
    this.interactButton.style.left = '50%';
    this.interactButton.style.transform = 'translateX(-50%)';
    this.interactButton.style.bottom = `calc(${layout.landscape ? 76 : 180}px + env(safe-area-inset-bottom))`;
    this.interactButton.style.width = '88px';
    this.interactButton.style.height = '44px';
    this.interactButton.style.borderRadius = '8px';
    this.interactButton.style.fontSize = '14px';
  }

  private onJoystickDown(event: PointerEvent): void {
    event.preventDefault();
    if (!this.enabled || this.activePointer !== null) return;
    event.stopPropagation();
    const size = this.joystick.getBoundingClientRect();
    this.joystickRest = { left: this.joystick.style.left, top: this.joystick.style.top, bottom: this.joystick.style.bottom };
    // Anchor at the finger so a press never starts movement before an intentional drag.
    this.joystick.style.left = (event.clientX - size.width / 2) + 'px';
    this.joystick.style.top = (event.clientY - size.height / 2) + 'px';
    this.joystick.style.bottom = 'auto';
    this.joystickRect = new DOMRect(event.clientX - size.width / 2, event.clientY - size.height / 2, size.width, size.height);
    this.stick.style.transition = 'none';
    this.activePointer = event.pointerId;
    this.tapJump.begin(event.clientX, event.clientY, event.timeStamp);
    this.joystick.setPointerCapture(event.pointerId);
    this.onJoystickMove(event);
  }

  private onJoystickMove(event: PointerEvent): void {
    if (this.activePointer !== event.pointerId) return;
    for (const sample of event.getCoalescedEvents?.() ?? []) this.tapJump.move(sample.clientX, sample.clientY);
    this.tapJump.move(event.clientX, event.clientY);
    const rect = this.joystickRect ?? this.joystick.getBoundingClientRect();
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

    const deadZone = Math.max(3, rect.width * 0.035);
    const strength = Math.max(0, Math.min(1, (length - deadZone) / (max - deadZone)));
    this.input.setAnalogMovement(nx * strength, -ny * strength);

    this.sprintHeld = length >= rect.width * (this.sprintHeld ? 0.43 : 0.5);
    if (this.sprintHeld) {
      this.input.press('ShiftLeft');
    } else {
      this.input.release('ShiftLeft');
    }
  }

  private onJoystickUp(cancelTap = true): void {
    if (cancelTap) this.tapJump.cancel();
    const pointer = this.activePointer;
    this.activePointer = null;
    if (pointer !== null && this.joystick.hasPointerCapture(pointer)) this.joystick.releasePointerCapture(pointer);
    this.joystickRect = null;
    if (this.joystickRest) {
      Object.assign(this.joystick.style, this.joystickRest);
      this.joystickRest = null;
    }
    this.sprintHeld = false;
    this.stick.style.transition = 'transform 90ms ease-out';
    this.stick.style.transform = 'translate(-50%, -50%)';
    this.input.setAnalogMovement(0, 0);
    this.input.release('KeyW');
    this.input.release('KeyS');
    this.input.release('KeyA');
    this.input.release('KeyD');
    this.input.release('ShiftLeft');
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
    if (!this.enabled) return;
    if (event.pointerType !== 'touch' || this.isInteractiveTarget(event.target)) {
      return;
    }

    const target = event.target;
    const isGameSurface = target instanceof HTMLCanvasElement && target.closest('#app') === target.parentElement;
    if (!isGameSurface) {
      return;
    }

    if (this.activeLookPointer) return;

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
    return true;
  }

  private onResize = (): void => {
    if (!this.mobile) return;
    this.cancelAim?.();
    this.onJoystickUp();
    this.activeLookPointer = null;
    this.input.reset();
    this.applyLayout(getLayout());
  };

  private onSuspend = (): void => {
    this.cancelAim?.(); this.onJoystickUp(); this.activeLookPointer = null; this.input.reset();
  };
  private onVisibilityChange = (): void => { if (document.hidden) this.onSuspend(); };

  dispose(): void {
    this.cancelAim?.();
    window.removeEventListener('pointerdown', this.onWindowPointerDown);
    window.removeEventListener('pointermove', this.onWindowPointerMove);
    window.removeEventListener('pointerup', this.onWindowPointerUp);
    window.removeEventListener('pointercancel', this.onWindowPointerCancel);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('blur', this.onSuspend);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('orientationchange', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onResize);
    this.root.remove();
  }
}
