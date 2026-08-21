export type PerformanceTier = 'low' | 'medium' | 'high';

export class PerformanceTierDetector {
  static readonly tier: PerformanceTier = PerformanceTierDetector.detect();

  static detect(): PerformanceTier {
    if (typeof navigator === 'undefined') return 'high';
    const cores = navigator.hardwareConcurrency ?? 4;
    const dpr = window.devicePixelRatio || 1;
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const score = cores + (mobile ? 0 : 4) + Math.min(3, dpr);
    if (score <= 5) return 'low';
    if (score <= 9) return 'medium';
    return 'high';
  }

  static get maxPixelRatio(): number {
    if (this.tier === 'low') return 1;
    if (this.tier === 'medium') return 1.5;
    return 2;
  }

  static get particleScale(): number {
    if (this.tier === 'low') return 0.45;
    if (this.tier === 'medium') return 0.7;
    return 1;
  }

  static get monsterCap(): number {
    if (this.tier === 'low') return 24;
    if (this.tier === 'medium') return 36;
    return 48;
  }

  static get isMobile(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }
}
