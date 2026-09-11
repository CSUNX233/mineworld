import type { SummonStatus } from '../summons/types';
import { createUiIcon } from './UiAssets';

/** Commands are separate from the four active skill slots. */
export class SummonCommandBar {
  private root = document.createElement('div');
  private label = document.createElement('span');
  private counts = new Map<string, HTMLElement>();
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
      button.addEventListener('pointerdown', event => event.stopPropagation());
      button.addEventListener('click', callback);
      this.root.append(button);
    }
    parent.append(this.root);
  }
  update(status: SummonStatus, unlocked: boolean): void {
    this.root.hidden = !unlocked && status.count === 0;
    for (const [id,count] of this.counts) count.textContent = String(status.roles[id as keyof typeof status.roles]);
    this.label.textContent = `编队 ${status.capacityUsed}/${status.capacity} · ${status.mode === 'focus' ? '集火' : status.mode === 'recall' ? '召回' : '自主'}`;
    this.root.title = `战士 ${status.roles.warrior} · 守卫 ${status.roles.guardian} · 射手 ${status.roles.archer}；G 集火 / H 召回`;
  }
  hide(): void { this.root.hidden = true; }
}
