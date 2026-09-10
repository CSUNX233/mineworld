import { BUILDS, type BuildId } from '../data/builds';

export class BuildSystem {
  ranks: Record<string, number> = {};
  choiceFloor = 0;
  private meleeHits = 0;
  restore(ranks: Record<string, number> = {}, floor = 0): void {
    this.ranks = {};
    BUILDS.forEach(build => { this.ranks[build.id] = Math.max(0, Math.min(3, Math.floor(ranks[build.id] || 0))); });
    this.choiceFloor = floor;
    this.meleeHits = 0;
  }
  rank(id: BuildId): number { return this.ranks[id] ?? 0; }
  canChoose(floor: number): boolean { return this.choiceFloor < floor && BUILDS.some(build => this.rank(build.id) < 3); }
  choose(id: BuildId, floor: number): boolean {
    if (!this.canChoose(floor) || !BUILDS.some(build => build.id === id) || this.rank(id) >= 3) return false;
    this.ranks[id] = this.rank(id) + 1;
    this.choiceFloor = floor;
    return true;
  }
  meleeEcho(hit: boolean): boolean {
    if (!hit || this.rank('vanguard') === 0) return false;
    return ++this.meleeHits % 3 === 0;
  }
  get summary(): string {
    return BUILDS.filter(build => this.rank(build.id) > 0).map(build => `${build.name} ${this.rank(build.id)}/3`).join(' · ') || '尚未选择专精';
  }
}
