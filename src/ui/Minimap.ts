import { roomCenter } from '../world/RoomGeometry';
import type { FloorData, FloorProgress } from '../types';
import { ROOM_COLORS } from '../data/rooms';
import type { Monster } from '../monsters/Monster';
import type { Player } from '../player/Player';
import { BlockKind } from '../world/Block';
import { isMobileDevice } from '../utils/mobile';

export class Minimap {
  readonly element: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  readonly size = isMobileDevice() ? 90 : 150;
  private baseCanvas: HTMLCanvasElement | null = null;
  private baseFloor: FloorData | null = null;

  constructor(root: HTMLElement) {
    this.element = document.createElement('canvas');
    this.element.className = 'minimap';
    this.element.width = this.size;
    this.element.height = this.size;
    this.element.style.position = 'absolute';
    this.element.style.right = '16px';
    this.element.style.top = '16px';
    this.element.style.width = `${this.size}px`;
    this.element.style.height = `${this.size}px`;
    this.element.style.border = '1px solid rgba(255,255,255,0.28)';
    this.element.style.borderRadius = '4px';
    this.element.style.background = 'rgba(10,12,18,0.6)';
    root.appendChild(this.element);
    this.context = this.element.getContext('2d')!;
  }

  update(
    floor: FloorData | null,
    player: Player,
    monsters: Monster[],
    progress?: FloorProgress,
  ): void {
    const ctx = this.context;
    ctx.clearRect(0, 0, this.size, this.size);
    if (!floor) return;
    const scale = this.size / floor.size;
    ctx.fillStyle = '#1c304a';
    ctx.fillRect(0, 0, this.size, this.size);

    if (this.baseFloor !== floor) {
      this.baseFloor = floor;
      if (!this.baseCanvas) this.baseCanvas = document.createElement('canvas');
      this.baseCanvas.width = this.size;
      this.baseCanvas.height = this.size;
      const baseCtx = this.baseCanvas.getContext('2d')!;
      baseCtx.fillStyle = '#1c304a';
      baseCtx.fillRect(0, 0, this.size, this.size);
      for (let z = 0; z < floor.size; z++) {
        for (let x = 0; x < floor.size; x++) {
          const kind = floor.grid[z][x];
          if (kind === BlockKind.Wall || kind === BlockKind.Obstacle) {
            baseCtx.fillStyle = '#73857d';
          } else if (kind === BlockKind.Portal) {
            baseCtx.fillStyle = '#c05bff';
          } else {
            baseCtx.fillStyle = '#cbb781';
          }
          baseCtx.fillRect(x * scale, z * scale, Math.max(1, scale), Math.max(1, scale));
        }
      }
    }
    ctx.drawImage(this.baseCanvas!, 0, 0);
    for (const room of floor.rooms) {
      if (!room.kind) continue;
      const center = roomCenter(room);
      const x=center.x*scale, z=center.z*scale;
      const cleared = progress?.cleared.includes(room.id!);
      ctx.fillStyle = cleared ? '#68d49d' : `#${ROOM_COLORS[room.kind].toString(16).padStart(6,'0')}`;
      ctx.font = `bold ${this.size < 100 ? 9 : 13}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(cleared ? '✓' : room.required ? '!' : room.kind==='treasure' ? '$' : room.kind==='sanctuary' ? '+' : room.kind==='elite' ? '★' : room.kind==='start' ? 'S' : '·',x,z);
    }

    if (floor.merchant) {
      ctx.fillStyle = '#ffcc66';
      ctx.font = `bold ${this.size < 100 ? 9 : 12}px sans-serif`;
      ctx.fillText('商', (floor.merchant.x + .5) * scale, (floor.merchant.z + .5) * scale);
    }

    monsters.forEach((monster) => {
      if (monster.dead) return;
      ctx.fillStyle = monster.def.behavior === 'boss' ? '#ff5b5b' : '#e85757';
      ctx.beginPath();
      ctx.arc(monster.position.x * scale, monster.position.z * scale, Math.max(1.2, scale * 0.4), 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.save();
    ctx.translate(player.position.x * scale, player.position.z * scale);
    ctx.rotate(-player.yaw);
    const arrow = Math.max(4, scale * .85);
    ctx.fillStyle = '#fff4c9';
    ctx.strokeStyle = '#163247';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, arrow);
    ctx.lineTo(-arrow * .65, -arrow * .7);
    ctx.lineTo(0, -arrow * .3);
    ctx.lineTo(arrow * .65, -arrow * .7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
