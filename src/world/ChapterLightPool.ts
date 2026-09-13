import * as THREE from 'three';
import { PerformanceTierDetector } from '../core/Performance';

export interface ChapterLightSource { x: number; y: number; z: number; color: number; strength?: number }
/** Static luminous props are always visible; only the nearest few need dynamic lights. */
export class ChapterLightPool {
  readonly group = new THREE.Group();
  private lights: THREE.PointLight[];
  private slots: number[] = [];
  private nextSelection = -1;
  constructor(readonly sources: ChapterLightSource[]) {
    this.group.name = 'chapter-light-pool';
    this.lights = Array.from({ length: PerformanceTierDetector.tier === 'low' ? 1 : 3 }, () => {
      const light = new THREE.PointLight(0xffffff, 0, 9, 2); this.group.add(light); return light;
    });
  }
  update(elapsed: number, viewer: THREE.Vector3): void {
    if (elapsed >= this.nextSelection || elapsed === 0) {
      this.nextSelection = elapsed + .4;
      this.slots = this.sources.map((s, i) => ({ i, d: (s.x - viewer.x) ** 2 + (s.z - viewer.z) ** 2 }))
        .filter(s => s.d < 16 ** 2).sort((a, b) => a.d - b.d).slice(0, this.lights.length).map(s => s.i);
    }
    this.lights.forEach((light, i) => {
      const s = this.sources[this.slots[i]];
      if (!s) { light.intensity = 0; return; }
      light.position.set(s.x, s.y, s.z); light.color.setHex(s.color);
      light.intensity = (s.strength ?? 5.5) * (1 + Math.sin(elapsed * 2.3 + this.slots[i]) * .025);
    });
  }
  dispose(): void { this.lights.forEach(light => light.dispose()); }
}
