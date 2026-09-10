import { pixelText, setPixelText } from './PixelNumbers';
import { STATUSES } from '../data/elements';
import { createUiIcon } from './UiAssets';
import { combatArtUrl } from './CombatArt';
import type { ActorStatus } from '../types';

export interface HUDState {
  level: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  xp: number;
  xpToNext: number;
  floor: number;
  floorName: string;
  gold: number;
  monstersRemaining: number;
  kills: number;
  shield: number;
}

export interface SkillHUDState {
  id?: string;
  name: string;
  key: string;
  cooldown: number;
  cooldownRemaining: number;
  manaCost: number;
}

export class HUD {
  private barValues = [0, 0, 0, 0];
  private barTargets = [0, 0, 0, 0];
  private barsReady = false;
  private barLevel = 0;

  private interaction: HTMLDivElement;
  private objective: HTMLDivElement;
  private container: HTMLDivElement;
  private hpFill: HTMLDivElement;
  private shieldFill: HTMLDivElement;
  private hpText: HTMLDivElement;
  private mpFill: HTMLDivElement;
  private mpText: HTMLDivElement;
  private xpFill: HTMLDivElement;
  private levelText: HTMLDivElement;
  private infoText: HTMLDivElement;
  private centerMessage: HTMLDivElement;
  private comboText: HTMLDivElement;
  private lowHealth: HTMLDivElement;
  private crosshair: HTMLDivElement;
  private skillContainer: HTMLDivElement;
  private statusContainer: HTMLDivElement;
  private statusSignature = '';
  private damageLayer: HTMLDivElement;
  private muteButton: HTMLDivElement;
  private messageTimer = 0;
  private messageDuration = 0;
  private combo = 0;
  private comboTimer = 0;
  private skillSignature = '';
  onMuteToggle: (() => void) | null = null;

  constructor(private root: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'hud';
    root.appendChild(this.container);
    this.objective = document.createElement('div');
    this.objective.className = 'hud-objective';
    this.container.appendChild(this.objective);
    this.interaction = document.createElement('div');
    this.interaction.className = 'hud-interaction';
    this.interaction.hidden = true;
    this.container.appendChild(this.interaction);
    this.damageLayer = document.createElement('div');
    this.damageLayer.style.position = 'absolute';
    this.damageLayer.style.inset = '0';
    this.damageLayer.style.pointerEvents = 'none';
    this.damageLayer.style.overflow = 'hidden';
    this.damageLayer.style.zIndex = '30';
    this.container.appendChild(this.damageLayer);

    const bars = document.createElement('div');
    bars.className = 'hud-bars';
    bars.style.position = 'absolute';
    bars.style.left = '18px';
    bars.style.top = '18px';
    bars.style.width = '260px';
    bars.style.display = 'flex';
    bars.style.flexDirection = 'column';
    bars.style.gap = '6px';
    this.container.appendChild(bars);

    const hp = document.createElement('div');
    hp.className = 'bar health-bar';
    const hpTrack = document.createElement('div');
    hpTrack.className = 'bar-track';
    hp.appendChild(hpTrack);
    this.hpFill = document.createElement('div');
    this.hpFill.className = 'bar-fill hp-fill';
    hpTrack.appendChild(this.hpFill);
    this.shieldFill = document.createElement('div');
    this.shieldFill.className = 'bar-fill shield-fill';
    this.shieldFill.style.width = '0%';
    hpTrack.appendChild(this.shieldFill);
    this.hpText = document.createElement('div');
    this.hpText.style.position = 'absolute';
    this.hpText.style.inset = '0';
    this.hpText.style.display = 'flex';
    this.hpText.style.alignItems = 'center';
    this.hpText.style.justifyContent = 'center';
    this.hpText.style.fontSize = '10px';
    this.hpText.style.fontWeight = 'bold';
    this.hpText.style.textShadow = '0 1px 2px #000';
    hp.appendChild(this.hpText);
    bars.appendChild(hp);

    const mp = document.createElement('div');
    mp.className = 'bar mana-bar';
    const mpTrack = document.createElement('div');
    mpTrack.className = 'bar-track';
    mp.appendChild(mpTrack);
    mp.style.height = '9px';
    this.mpFill = document.createElement('div');
    this.mpFill.className = 'bar-fill mp-fill';
    mpTrack.appendChild(this.mpFill);
    this.mpText = document.createElement('div');
    this.mpText.style.position = 'absolute';
    this.mpText.style.inset = '0';
    this.mpText.style.display = 'flex';
    this.mpText.style.alignItems = 'center';
    this.mpText.style.justifyContent = 'center';
    this.mpText.style.fontSize = '8px';
    this.mpText.style.fontWeight = 'bold';
    this.mpText.style.textShadow = '0 1px 2px #000';
    mp.appendChild(this.mpText);
    bars.appendChild(mp);

    const xp = document.createElement('div');
    xp.className = 'bar experience-bar';
    const xpTrack = document.createElement('div');
    xpTrack.className = 'bar-track';
    xp.appendChild(xpTrack);
    xp.style.height = '7px';
    this.xpFill = document.createElement('div');
    this.xpFill.className = 'bar-fill xp-fill';
    xpTrack.appendChild(this.xpFill);
    bars.appendChild(xp);

    this.levelText = document.createElement('div');
    this.levelText.style.fontSize = '17px';
    this.levelText.style.fontWeight = 'bold';
    this.levelText.style.textShadow = '0 2px 4px #000';
    bars.appendChild(this.levelText);

    this.statusContainer = document.createElement('div');
    this.statusContainer.className = 'hud-statuses';
    this.statusContainer.style.display = 'flex';
    this.statusContainer.style.gap = '5px';
    this.statusContainer.style.flexWrap = 'wrap';
    bars.appendChild(this.statusContainer);
    bars.appendChild(this.objective);

    this.infoText = document.createElement('div');
    this.infoText.className = 'hud-info';
    this.infoText.style.position = 'absolute';
    this.infoText.style.right = '180px';
    this.infoText.style.top = '18px';
    this.infoText.style.textAlign = 'right';
    this.infoText.style.fontSize = '14px';
    this.infoText.style.textShadow = '0 2px 4px #000';
    this.container.appendChild(this.infoText);

    this.skillContainer = document.createElement('div');
    this.skillContainer.className = 'hud-skills';
    this.skillContainer.style.position = 'absolute';
    this.skillContainer.style.left = '18px';
    this.skillContainer.style.bottom = '18px';
    this.skillContainer.style.display = 'flex';
    this.skillContainer.style.gap = '8px';
    this.container.appendChild(this.skillContainer);

    this.crosshair = document.createElement('div');
    this.crosshair.className = 'hud-crosshair';
    this.crosshair.style.position = 'absolute';
    this.crosshair.style.left = '50%';
    this.crosshair.style.top = '50%';
    this.crosshair.style.transform = 'translate(-50%, -50%)';
    this.crosshair.style.width = '14px';
    this.crosshair.style.height = '14px';
    this.crosshair.style.border = '2px solid rgba(255,255,255,0.9)';
    this.crosshair.style.borderRadius = '50%';
    this.crosshair.style.boxShadow = '0 0 5px rgba(0,0,0,0.8)';
    this.container.appendChild(this.crosshair);

    this.muteButton = document.createElement('div');
    this.muteButton.className = 'hud-mute';
    this.muteButton.textContent = '🔊';
    this.muteButton.style.position = 'absolute';
    this.muteButton.style.right = '180px';
    this.muteButton.style.bottom = '18px';
    this.muteButton.style.padding = '6px 9px';
    this.muteButton.style.background = 'rgba(10,14,20,0.72)';
    this.muteButton.style.border = '1px solid #43516a';
    this.muteButton.style.borderRadius = '4px';
    this.muteButton.style.cursor = 'pointer';
    this.muteButton.style.fontSize = '16px';
    this.muteButton.style.pointerEvents = 'auto';
    this.muteButton.onclick = () => this.onMuteToggle?.();
    this.container.appendChild(this.muteButton);

    this.centerMessage = document.createElement('div');
    this.centerMessage.className = 'center-message';
    this.centerMessage.style.opacity = '0';
    this.container.appendChild(this.centerMessage);

    this.comboText = document.createElement('div');
    this.comboText.style.position = 'absolute';
    this.comboText.style.left = '50%';
    this.comboText.style.top = '42%';
    this.comboText.style.transform = 'translate(-50%, -50%)';
    this.comboText.style.fontSize = '28px';
    this.comboText.style.fontWeight = 'bold';
    this.comboText.style.color = '#ffd54f';
    this.comboText.style.textShadow = '0 3px 6px #000';
    this.comboText.style.opacity = '0';
    this.container.appendChild(this.comboText);

    this.lowHealth = document.createElement('div');
    this.lowHealth.style.position = 'absolute';
    this.lowHealth.style.inset = '0';
    this.lowHealth.style.pointerEvents = 'none';
    this.lowHealth.style.boxShadow = 'inset 0 0 120px 40px rgba(180,0,0,0.55)';
    this.lowHealth.style.opacity = '0';
    this.lowHealth.style.transition = 'opacity 0.2s';
    this.container.appendChild(this.lowHealth);
  }

  setState(state: HUDState): void {
    const maxHealth = Math.max(1, state.maxHealth);
    const maxMana = Math.max(1, state.maxMana);
    const ratio = (value: number, max: number) => Math.max(0, Math.min(100, value / max * 100));
    this.barTargets = [ratio(state.health, maxHealth), ratio(state.shield, maxHealth),
      ratio(state.mana, maxMana), ratio(state.xp, Math.max(1, state.xpToNext))];
    if (!this.barsReady) {
      this.barValues = [...this.barTargets];
      this.barsReady = true;
    }
    // Level-up starts a fresh XP cycle instead of animating backwards through the old one.
    if (this.barLevel !== state.level) this.barValues[3] = this.barTargets[3];
    this.barLevel = state.level;
    setPixelText(this.hpText, `${Math.ceil(state.health)}/${Math.ceil(maxHealth)}`);
    setPixelText(this.mpText, `${Math.ceil(state.mana)}/${Math.ceil(maxMana)}`);
    this.levelText.innerHTML = `Lv.${state.level} <span style="font-size:13px;color:#a9c8ff">经验 ${Math.floor(state.xp)}/${Math.ceil(state.xpToNext)}</span>`;
    this.infoText.innerHTML = `第 ${state.floor} 层 · ${state.floorName}<br><span style="color:#ffd76a">金币 ${pixelText(String(state.gold)).outerHTML}</span> · 怪物 ${pixelText(String(Math.max(0, state.monstersRemaining))).outerHTML} · 击杀 ${pixelText(String(state.kills)).outerHTML}`;
    this.lowHealth.style.opacity = state.health / state.maxHealth < 0.28 ? '1' : '0';
  }

  setObjective(text: string): void {
    if (this.objective.textContent !== text) this.objective.textContent = text;
  }

  updateSkills(skills: SkillHUDState[], mana = Infinity): void {
    const signature = skills.map(skill => `${skill.id}:${skill.name}:${skill.key}`).join('|');
    if (signature !== this.skillSignature) {
      this.skillSignature = signature;
      this.skillContainer.replaceChildren();
      skills.forEach((skill) => {
      const box = document.createElement('div');
      box.className = 'sunlit-skill';
      box.appendChild(createUiIcon(skill.id ?? 'fireball'));
      const overlay = document.createElement('div');
      overlay.className = 'sunlit-skill-overlay';
      const key = document.createElement('span');
      key.className = 'sunlit-skill-key';
      key.textContent = skill.key.replace('Digit', '');
      const cooldown = document.createElement('span');
      cooldown.className = 'sunlit-skill-timer';
      box.append(overlay, key, cooldown);
      this.skillContainer.appendChild(box);
      });
    }
    skills.forEach((skill, index) => {
      const box = this.skillContainer.children[index] as HTMLElement;
      const cooling = skill.cooldownRemaining > 0;
      box.classList.toggle('is-unavailable', cooling || mana < skill.manaCost);
      box.title = `${skill.name} · 法力 ${skill.manaCost}${mana < skill.manaCost ? ' · 法力不足' : ''}`;
      box.querySelector<HTMLElement>('.sunlit-skill-overlay')!.style.height = `${Math.max(0, Math.min(100, skill.cooldownRemaining / Math.max(.01, skill.cooldown) * 100))}%`;
      box.querySelector<HTMLElement>('.sunlit-skill-timer')!.textContent = cooling ? skill.cooldownRemaining.toFixed(1) : mana < skill.manaCost ? '法力不足' : '';
    });
  }

  setStatuses(statuses: ActorStatus[]): void {
    const signature = statuses.map(status => `${status.type}:${Math.ceil(status.duration)}`).join('|');
    if (signature === this.statusSignature) return;
    this.statusSignature = signature;
    this.statusContainer.innerHTML = '';
    statuses.forEach((status) => {
      const def = STATUSES[status.type];
      if (!def) return;
      const badge = document.createElement('span');
      badge.textContent = `${def.label}`;
      if (status.type !== 'bleeding') {
        const icon = document.createElement('img');
        icon.src = combatArtUrl('statuses', status.type);
        icon.alt = '';
        icon.width = icon.height = 24;
        icon.style.imageRendering = 'pixelated';
        badge.prepend(icon);
      }
      badge.style.display = 'inline-flex';
      badge.style.alignItems = 'center';
      badge.style.gap = '3px';
      badge.setAttribute('aria-label', `${def.label}，剩余 ${Math.ceil(status.duration)} 秒`);
      badge.style.padding = '2px 6px';
      badge.style.borderRadius = '3px';
      badge.style.background = `#${def.color.toString(16).padStart(6, '0')}66`;
      badge.style.border = `1px solid #${def.color.toString(16).padStart(6, '0')}`;
      badge.style.color = `#${def.color.toString(16).padStart(6, '0')}`;
      badge.style.fontSize = '10px';
      badge.style.fontWeight = 'bold';
      badge.title = `${def.label} ${status.duration.toFixed(1)}s`;
      this.statusContainer.appendChild(badge);
    });
  }

  showCenterMessage(title: string, subtitle = '', duration = 2.4): void {
    this.centerMessage.innerHTML = `<div style="font-size:30px;font-weight:bold;color:#fff">${title}</div><div style="margin-top:6px;font-size:15px;color:#cbd6e4">${subtitle}</div>`;
    this.centerMessage.style.opacity = '1';
    this.messageDuration = duration;
    this.messageTimer = 0;
  }

  showLootMessage(text: string, color: string | number): void {
    this.showCenterMessage(text, '', 1.8);
    this.centerMessage.style.color =
      typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : color;
  }

  setCombo(combo: number): void {
    this.combo = combo;
    if (combo > 1) {
      this.comboText.textContent = `COMBO x${combo}`;
      this.comboText.style.opacity = '1';
      this.comboText.style.fontSize = `${Math.min(42, 26 + combo)}px`;
      this.comboTimer = 1.2;
    }
  }

  spawnDamage(text: string, color: string, crit = false, scale = 1): void {
    const element = document.createElement('div');
    element.className = crit ? 'hud-damage damage-critical' : 'hud-damage';
    element.appendChild(pixelText(text, 'damage'));
    element.style.color = color;
    element.style.fontSize = `${Math.round((crit ? 34 : 24) * scale)}px`;
    element.style.left = `${58 + (Math.random() - 0.5) * 10}vw`;
    element.style.top = `${42 + (Math.random() - 0.5) * 10}vh`;
    if (crit) {
      element.style.textShadow = 'none';
    }
    this.damageLayer.appendChild(element);
    window.setTimeout(() => element.remove(), crit ? 900 : 700);
  }

  update(dt: number): void {
    const bars = [this.hpFill, this.shieldFill, this.mpFill, this.xpFill];
    for (let i = 0; i < bars.length; i++) {
      const target = this.barTargets[i];
      const speed = target < this.barValues[i] ? 16 : 10;
      this.barValues[i] += (target - this.barValues[i]) * (1 - Math.exp(-speed * Math.max(0, dt)));
      if (Math.abs(target - this.barValues[i]) < 0.03) this.barValues[i] = target;
      bars[i].style.width = this.barValues[i] + '%';
    }

    if (this.messageTimer < this.messageDuration) {
      this.messageTimer += dt;
      if (this.messageTimer >= this.messageDuration) {
        this.centerMessage.style.opacity = '0';
      }
    }
    if (this.combo > 1) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboText.style.opacity = '0';
      }
    }
  }

  setPointerLocked(locked: boolean): void {
    this.crosshair.style.opacity = locked ? '1' : '0.25';
  }

  setAimPoint(x: number, y: number, visible: boolean, thirdPerson: boolean, blocked = false): void {
    this.crosshair.style.display = visible ? 'block' : 'none';
    this.crosshair.style.left = `${(x + 1) * 50}%`;
    this.crosshair.style.top = `${(1 - y) * 50}%`;
    this.crosshair.style.opacity = '0.85';
    this.crosshair.style.borderColor = blocked ? '#ffbd70' : '#d5f5ff';
    this.crosshair.classList.toggle('third-person-aim', thirdPerson);
  }

  setMuted(muted: boolean): void {
    this.muteButton.textContent = muted ? '🔇' : '🔊';
  }

  setInteraction(label: string | null): void {
    this.interaction.hidden = !label;
    const text = label ? `E · ${label}` : '';
    if (this.interaction.textContent !== text) this.interaction.textContent = text;
  }
}
