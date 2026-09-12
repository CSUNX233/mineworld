import type { DerivedStats } from '../items/EquipmentManager';
import { applyPermanentMetaBonuses } from './MetaProgression';

/** Per-game cache. Compare node contents too: save/load may replace or edit the array. */
export class EffectiveStatsCache {
  private base?: DerivedStats;
  private nodes: string[] = [];
  private result?: DerivedStats;

  get(base: DerivedStats, nodes: readonly string[]): DerivedStats {
    if (this.base === base && this.result && nodes.length === this.nodes.length
      && nodes.every((id, index) => id === this.nodes[index])) return this.result;
    this.base = base;
    this.nodes = [...nodes];
    this.result = applyPermanentMetaBonuses(base, nodes);
    return this.result;
  }
}
