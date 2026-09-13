import * as THREE from 'three';
import type { Room } from '../types';
import { RoomLightSelection } from './RoomLightSelection';

export interface ChapterLightSource { x: number; y: number; z: number; color: number; strength?: number }
/** Activate all light sources belonging to the nearest room. */
export class ChapterLightPool {
  readonly group = new THREE.Group();
  private lights: THREE.PointLight[];
  private slots: number[] = [];
  private nextSelection = -1;
  private selection: RoomLightSelection;
  constructor(readonly sources: ChapterLightSource[], rooms: readonly Room[]) {
    this.group.name = 'chapter-light-pool';
    this.selection = new RoomLightSelection(sources, rooms);
    this.lights = Array.from({ length: this.selection.capacity }, () => {
      const light = new THREE.PointLight(0xffffff, 0, 9, 2); this.group.add(light); return light;
    });
  }
  update(elapsed: number, viewer: THREE.Vector3): void {
    if (elapsed >= this.nextSelection || elapsed === 0) {
      this.nextSelection = elapsed + .4;
      this.slots = this.selection.select(viewer);
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
