import type { SummonStatus } from '../summons/types';
import { createUiIcon } from './UiAssets';

/** Commands are separate from the four active skill slots. */
export class SummonCommandBar {
  private root = document.createElement('div');
  private label = document.createElement('span');
  private counts = new Map<string, HTMLElement>();
  private layoutKey = '';
  constructor(parent: HTMLElement, focus: () => void, recall: () => void) {
    this.root.className = 'summon-command-bar';
    this.root.setAttribute('aria-label', '召唤编队');
    this.root.append(this.label);
    const roles = document.createElement('div');
    roles.className = 'summon-role-icons';
    for (const [id,name] of [['warrior','战士'],['guardian','守卫'],['archer','射手']]) {
      const slot = document.createElement('span');
      slot.title = name;
      const count = document.createElement('span');
      slot.append(createUiIcon(`summon_${id}`), count);
      this.counts.set(id,count);
      roles.append(slot);
    }
    this.root.append(roles);
    for (const [text, callback] of [['集火', focus], ['召回', recall]] as const) {
      const button = document.createElement('button');
      button.textContent = text;
      button.prepend(createUiIcon(text === '集火' ? 'summon_focus' : 'summon_recall'));
      button.type = 'button';
      button.classList.add(text === '集火' ? 'summon-focus-button' : 'summon-recall-button');
      button.addEventListener('pointerdown', event => event.stopPropagation());
      button.addEventListener('click', callback);
      this.root.append(button);
    }
    parent.append(this.root);
  }
  update(status: SummonStatus, unlocked: boolean): void {
    this.root.hidden = !unlocked;
    document.documentElement.classList.toggle('has-summon-controls', unlocked);
    const key = `${unlocked}:${window.innerWidth}:${window.innerHeight}`;
    if (unlocked && key !== this.layoutKey) {
      const xp = document.querySelector('.experience-bar')?.getBoundingClientRect();
      const skill = document.querySelector('.touch-utility-row [title="技能配置"]')?.getBoundingClientRect();
      if (xp) {
        this.root.style.setProperty('--summon-status-left', `${xp.left + xp.width / 2}px`);
        this.root.style.setProperty('--summon-status-top', `${xp.bottom + 3}px`);
        this.root.style.setProperty('--summon-status-width', `${xp.width / 2}px`);
      }
      if (skill && skill.width > 0 && xp && xp.width > 0) {
        this.layoutKey = key;
        this.root.style.setProperty('--summon-action-top', `${skill.top}px`);
        this.root.style.setProperty('--summon-action-left', `${skill.right + 6}px`);
      }
    }
    for (const [id,count] of this.counts) count.textContent = String(status.roles[id as keyof typeof status.roles]);
    this.label.textContent = `编队 ${status.capacityUsed}/${status.capacity} · ${status.mode === 'focus' ? '集火' : status.mode === 'recall' ? '召回' : '自主'}`;
    this.root.title = `战士 ${status.roles.warrior} · 守卫 ${status.roles.guardian} · 射手 ${status.roles.archer}；G 集火 / H 召回`;
  }
  hide(): void { this.root.hidden = true; this.layoutKey = ''; document.documentElement.classList.remove('has-summon-controls'); }
}
