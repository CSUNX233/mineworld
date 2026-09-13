import { createDeepChapterProp } from './DeepChapterAssets';
import * as THREE from 'three';
import type { FloorData } from '../types';
import { sanctumRitualPositions } from '../data/SanctumChapter';
import { findEncounterRoomPosition } from './EncounterBarriers';

export function isOptionalTrial(template?: string): boolean {
  return ['overload-trial', 'ruins-trial', 'sanctum-trial','abyss-trial','citadel-trial'].includes(template ?? '');
}
export function trialTitle(template?: string): string {
  return template==='abyss-trial'?'熄灯巡猎':template==='citadel-trial'?'两旗破关':template === 'ruins-trial' ? '旧军械挑战' : template === 'sanctum-trial' ? '无名者安葬' : '过载试炼';
}
interface Altar { id: string; roomId: string; position: THREE.Vector3; mesh: THREE.Group; warning: THREE.Mesh; remaining: number }

/** One-use player facilities, separate from monster AI and encounter clear counts. */
export class ChapterRituals {
  private altars: Altar[] = [];
  private used = new Set<string>();
  constructor(private scene: THREE.Scene) {}
  setup(floor: FloorData, used: string[] = []): void {
    this.clear(); this.used = new Set(used);
    for (const room of floor.rooms.filter(room => room.template === 'sanctum-ritual')) {
      const positions = sanctumRitualPositions(room);
      for (let i = 0; i < 2; i++) {
        const spot = findEncounterRoomPosition(floor, room, positions[i].x, positions[i].z);
        if (!spot) continue;
        const id = `${room.id}:${i}`;
        const mesh = new THREE.Group(); mesh.position.set(spot.x, 0, spot.z);
        const art = createDeepChapterProp(floor.floor, 'altar');
        const base = art ?? new THREE.Mesh(new THREE.CylinderGeometry(.45, .65, .5, 6), new THREE.MeshLambertMaterial({ color: 0x7e7968 }));
        base.position.y = art ? 0 : .25; mesh.add(base);
        const flame = new THREE.Mesh(new THREE.OctahedronGeometry(.25), new THREE.MeshBasicMaterial({ color: this.used.has(id) ? 0x394845 : 0x72c6c3 }));
        flame.position.y = .9; mesh.add(flame);
        const warning = new THREE.Mesh(new THREE.RingGeometry(3.8, 4, 32), new THREE.MeshBasicMaterial({ color: 0x72c6c3, transparent: true, opacity: .65, depthWrite: false, side: THREE.DoubleSide }));
        warning.rotation.x = -Math.PI / 2; warning.position.y = .08; warning.visible = false; mesh.add(warning);
        this.scene.add(mesh);
        this.altars.push({ id, roomId: room.id!, position: mesh.position, mesh, warning, remaining: 0 });
      }
    }
  }
  nearby(position: THREE.Vector3, lockedRooms: readonly string[]): Altar | undefined {
    return this.altars.filter(a => !this.used.has(a.id) && lockedRooms.includes(a.roomId) && a.position.distanceTo(position) < 2)
      .sort((a, b) => a.position.distanceToSquared(position) - b.position.distanceToSquared(position))[0];
  }
  activate(position: THREE.Vector3, lockedRooms: readonly string[]): boolean {
    const altar = this.nearby(position, lockedRooms); if (!altar) return false;
    this.used.add(altar.id); altar.remaining = .8; altar.warning.visible = true; return true;
  }
  update(dt: number, lockedRooms: readonly string[], burst: (position: THREE.Vector3, roomId: string) => void): void {
    for (const altar of this.altars) if (altar.remaining > 0) {
      if (!lockedRooms.includes(altar.roomId)) { altar.remaining = 0; altar.warning.visible = false; continue; }
      altar.remaining -= dt;
      if (altar.remaining <= 0) {
        altar.warning.visible = false;
        const flame = altar.mesh.children[1] as THREE.Mesh;
        (flame.material as THREE.MeshBasicMaterial).color.setHex(0x394845);
        burst(altar.position, altar.roomId);
      }
    }
  }
  snapshot(): string[] { return [...this.used]; }
  clear(): void {
    for (const altar of this.altars) {
      altar.mesh.removeFromParent(); altar.mesh.traverse(object => {
        if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.MeshLambertMaterial).map?.dispose(); (object.material as THREE.Material).dispose(); }
      });
    }
    this.altars = []; this.used.clear();
  }
}
