type Kind = 'notice' | 'room' | 'floor' | 'loot' | 'legendary';
interface Announcement { title: string; subtitle: string; color: string; duration: number; kind: Kind; created: number; count: number; emphasis: number }

/** A single bounded banner: coalesce loot bursts, replace stale room names, never stack text. */
export class AnnouncementQueue {
  private pending: Announcement[] = [];
  private current: Announcement | null = null;
  private age = 0;
  private clock = 0;
  private title = document.createElement('div');
  private subtitle = document.createElement('div');
  private label = document.createElement('div');
  constructor(private element: HTMLElement) {
    element.className = 'hud-announcement'; element.setAttribute('role', 'status');
    this.title.className = 'hud-announcement-title'; this.subtitle.className = 'hud-announcement-subtitle';
    this.label.className = 'hud-announcement-label'; element.append(this.label, this.title, this.subtitle);
    element.hidden = true;
  }
  reset(): void { this.pending.length = 0; this.current = null; this.element.hidden = true; }
  push(title: string, subtitle = '', duration = 2, kind: Kind = 'notice', color = '#efd69b', emphasis = 0): void {
    if (kind === 'floor') this.reset();
    if (kind !== 'loot' && this.current?.title === title && this.current.subtitle === subtitle) return;
    if (kind !== 'loot' && this.pending.some(item => item.title === title && item.subtitle === subtitle)) return;
    if (kind === 'room') this.pending = this.pending.filter(item => item.kind !== 'room');
    if (kind === 'loot' && emphasis === 0) {
      const batch = this.pending.find(item => item.kind === 'loot' && item.emphasis === 0);
      if (batch) {
        const previous = batch.count === 1 ? batch.title : batch.subtitle;
        batch.count++; batch.title = `收获战利品 ×${batch.count}`;
        batch.subtitle = `${title} · ${previous}`.slice(0, 100); batch.color = color; batch.created = this.clock;
        return;
      }
    }
    const item = { title, subtitle, duration: Math.max(1.1, Math.min(2.6, duration)), kind, color, created: this.clock, count: 1, emphasis };
    if (kind === 'legendary') this.pending.unshift(item);
    else if (kind === 'room') {
      const lootIndex = this.pending.findIndex(entry => entry.kind === 'loot');
      if (lootIndex >= 0) this.pending.splice(lootIndex, 0, item); else this.pending.push(item);
    } else this.pending.push(item);
    if (this.pending.length > 8) {
      const expendable = this.pending.findIndex(entry => entry.kind === 'loot' || entry.kind === 'room');
      this.pending.splice(expendable >= 0 ? expendable : this.pending.length - 1, 1);
    }
    if (!this.current) this.next();
    else if ((kind === 'room' && this.current.kind === 'room') || kind === 'legendary') {
      // Finish the existing banner quickly, with a fade; never paint two simultaneously.
      this.age = Math.max(this.age, this.current.duration - .18);
    }
  }
  private next(): void {
    this.pending = this.pending.filter(item => item.kind === 'legendary' || this.clock - item.created < 7);
    this.current = this.pending.shift() ?? null; this.age = 0;
    this.element.hidden = !this.current;
    if (!this.current) return;
    const item = this.current;
    this.title.textContent = item.title; this.subtitle.textContent = item.subtitle; this.subtitle.hidden = !item.subtitle;
    this.label.textContent = ({ room: '探索', floor: '深入地牢', loot: '获得战利品', legendary: '传说现世', notice: '冒险纪事' })[item.kind];
    this.element.style.setProperty('--announcement-accent', item.color);
    this.element.style.opacity = '0';
    this.element.classList.toggle('is-premium', item.emphasis >= 2);
    this.title.getAnimations().forEach(animation => animation.cancel());
    if (item.emphasis > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const kick = [0, 1, 3, 5, 6][Math.min(4, item.emphasis)];
      const scale = 1 + item.emphasis * .035;
      this.title.animate([
        { transform: 'translateX(0) scale(.94)', filter: 'brightness(1)' },
        { transform: `translateX(0) scale(${scale})`, filter: 'brightness(1.65)', offset: .16 },
        { transform: `translateX(${-kick}px) scale(${scale})`, offset: .25 },
        { transform: `translateX(${kick}px) scale(1.04)`, offset: .35 },
        { transform: `translateX(${-kick * .55}px) scale(1.02)`, offset: .46 },
        { transform: `translateX(${kick * .3}px) scale(1)`, offset: .57 },
        { transform: 'translateX(0) scale(1)', filter: 'brightness(1)' }
      ], { duration: item.emphasis >= 3 ? 620 : 380 });
    }
  }
  update(dt: number): void {
    this.clock += Math.max(0, dt);
    if (!this.current) return;
    this.age += Math.max(0, dt);
    const alpha = Math.max(0, Math.min(1, this.age / .14, (this.current.duration - this.age) / .2));
    this.element.style.opacity = String(alpha);
    if (this.age >= this.current.duration) this.next();
  }
}
