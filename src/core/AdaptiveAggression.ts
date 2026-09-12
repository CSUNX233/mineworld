export interface AggressionSnapshot {
  tier: 0.8 | 1 | 1.2;
  crowded?: boolean;
  combatSeconds: number;
  healthySeconds: number;
  pressuredSeconds: number;
  expectedSeconds: number;
  encounters: number;
}

export function validAggression(value: unknown): value is AggressionSnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as AggressionSnapshot;
  return (s.crowded === undefined || typeof s.crowded === 'boolean') && [0.8, 1, 1.2].includes(s.tier)
    && ['combatSeconds', 'healthySeconds', 'pressuredSeconds', 'expectedSeconds', 'encounters']
      .every(key => typeof s[key as 'combatSeconds'] === 'number'
        && Number.isFinite(s[key as 'combatSeconds']) && s[key as 'combatSeconds'] >= 0)
    && Number.isInteger(s.encounters) && s.encounters <= 100
    && s.healthySeconds <= s.combatSeconds && s.pressuredSeconds <= s.combatSeconds;
}

/** Samples only active encounters; menu, loading and exploration time never count. */
export class AdaptiveAggression {
  private state: AggressionSnapshot = this.empty(1);
  private empty(tier: AggressionSnapshot['tier']): AggressionSnapshot {
    return { tier, combatSeconds: 0, healthySeconds: 0, pressuredSeconds: 0, expectedSeconds: 0, encounters: 0 };
  }
  get multiplier(): AggressionSnapshot['tier'] { return this.state.tier; }
  get crowded(): boolean { return this.state.tier === 1.2 && this.state.crowded === true; }
  get label(): string { return this.multiplier === .8 ? '舒缓' : this.multiplier === 1.2 ? (this.crowded ? '猛烈 · 增援' : '猛烈') : '普通'; }
  restore(saved?: AggressionSnapshot): void { this.state = validAggression(saved) ? { ...saved } : this.empty(1); }
  snapshot(): AggressionSnapshot { return { ...this.state }; }
  encounter(monsters: number, boss: boolean, elite: boolean): void {
    this.state.encounters++;
    // Encounter-sized pacing reference, not the player's gear/DPS (which would hide fast builds).
    this.state.expectedSeconds += boss ? 75 : Math.max(15, monsters * 4) * (elite ? 1.35 : 1);
  }
  sample(dt: number, healthFraction: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const seconds = Math.min(dt, .25);
    this.state.combatSeconds += seconds;
    if (healthFraction >= .95) this.state.healthySeconds += seconds;
    if (healthFraction < .45) this.state.pressuredSeconds += seconds;
  }
  advance(): void {
    const s = this.state;
    let tier: AggressionSnapshot['tier'] = 1;
    if (s.encounters > 0 && s.combatSeconds > 0 && s.expectedSeconds > 0) {
      const pace = s.combatSeconds / s.expectedSeconds;
      const healthy = s.healthySeconds / s.combatSeconds;
      const pressured = s.pressuredSeconds / s.combatSeconds;
      if (pace > 1.5 && (pressured >= .2 || healthy < .5)) tier = .8;
      else if (pace < .7 || (s.combatSeconds >= 10 && healthy >= .9)) tier = 1.2;
    }
    const crowded = s.tier === 1.2 && tier === 1.2;
    this.state = { ...this.empty(tier), crowded };
  }
}
