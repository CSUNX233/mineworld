import * as THREE from 'three';
import type { FloorData, Room } from '../types';
import { roomContainsPoint } from './RoomGeometry';
import { disposeMechanicObject } from '../monsters/MechanicVisual';

/** Harmless, optional entry demonstration. It never blocks progression or grants farmable rewards. */
export class FoundryPractice {
  private room: Room | null = null;
  private mesh: THREE.Mesh | null = null;
  private clock = 0;
  private previousY = 0;
  private previousZ = 0;
  private assessed = false;
  private finished = false;

  setup(floor: FloorData, scene: THREE.Scene): void {
    this.clear();
    if ((floor.generationVersion ?? 0) < 3 || floor.floor !== 6 || floor.theme.id !== 'foundry') return;
    this.room = floor.rooms.find(room => room.kind === 'start') ?? null;
    if (!this.room) return;
    const room = this.room;
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(room.width - 4, .25, .22),
      new THREE.MeshBasicMaterial({ color: 0x88e5f0, transparent: true, opacity: .8 }));
    this.mesh.name = 'harmless-jump-practice';
    this.mesh.position.set(room.x + (room.width - 2) / 2, .15, room.z + 1);
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  update(dt: number, position: {x: number; y: number; z: number}, show: (title: string, text: string) => void): void {
    if (!this.room || !this.mesh || this.finished) return;
    if (!roomContainsPoint(this.room, position.x, position.z)) {
      this.finished = true;
      this.mesh.visible = false;
      return;
    }
    const old = this.clock;
    this.clock += dt;
    if (old < 4 && this.clock >= 4) show('低位震波 · 无伤练习', '可跳过贴地波，或从右侧缺口绕开；无需完成即可前进。');
    const start = this.room.z + 1;
    const oldWave = start + Math.max(0, old - 5.4) * 3;
    const wave = start + Math.max(0, this.clock - 5.4) * 3;
    this.mesh.visible = this.clock >= 4;
    this.mesh.position.z = wave;
    // Swept relative crossing, including the player's motion, so a slow frame cannot skip assessment.
    const before = oldWave - this.previousZ;
    const after = wave - position.z;
    if (!this.assessed && this.clock >= 5.4 && before <= 0 && after >= 0) {
      this.assessed = true;
      const t = after === before ? 1 : -before / (after - before);
      const height = this.previousY + (position.y - this.previousY) * t;
      if (Math.abs(position.x - this.mesh.position.x) > (this.room.width - 4) / 2 + .35)
        show('已绕开低波', '地面缺口也是安全路线。');
      else if (height > .3) show('跃过低波', '低位攻击可跳过；喷汽和普通攻击仍需走位。');
      else show('练习波已通过', '本次不造成伤害；波到脚边前起跳，下次再试也可以。');
    }
    this.previousY = position.y;
    this.previousZ = position.z;
    if (wave > this.room.z + this.room.depth - 1) { this.finished = true; this.mesh.visible = false; }
  }

  clear(): void {
    if (this.mesh) { this.mesh.removeFromParent(); disposeMechanicObject(this.mesh); }
    this.mesh = null;
    this.room = null;
    this.clock = 0;
    this.previousY = this.previousZ = 0;
    this.assessed = this.finished = false;
  }
}
