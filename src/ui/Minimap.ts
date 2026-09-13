import { roomCenter, roomContainsPoint } from '../world/RoomGeometry';
import type { FloorData, FloorProgress } from '../types';
import { ROOM_COLORS, ROOM_LABELS } from '../data/rooms';
import { loadImage } from '../core/AssetLoading';
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
  private atlas: HTMLImageElement | null = null;

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
    this.element.setAttribute('role', 'img');
    void loadImage('/assets/ui/sunlit/minimap/icons.webp').then(image => { this.atlas = image; }).catch(() => { /* Keep readable symbols if the atlas is unavailable. */ });
  }

  private icon(index: number, x: number, y: number, size: number, fallback: string): void {
    const ctx = this.context;
    ctx.fillStyle = '#142331';
    ctx.fillRect(Math.round(x - size / 2 - 1), Math.round(y - size / 2 - 1), size + 2, size + 2);
    if (this.atlas) {
      const cell = this.atlas.naturalWidth / 3;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.atlas, index % 3 * cell, Math.floor(index / 3) * cell, cell, cell, Math.round(x - size / 2), Math.round(y - size / 2), size, size);
    } else {
      ctx.fillStyle = '#ffe9b7'; ctx.font = `bold ${size}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(fallback, x, y);
    }
  }

  invalidate(): void { this.baseFloor = null; }

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
            baseCtx.fillStyle = '#253746';
          } else if (kind === BlockKind.Portal) {
            baseCtx.fillStyle = '#c05bff';
          } else {
            baseCtx.fillStyle = '#8d947d';
          }
          baseCtx.fillRect(x * scale, z * scale, Math.max(1, scale), Math.max(1, scale));
        }
      }
    }
    ctx.drawImage(this.baseCanvas!, 0, 0);
    const currentRoom = floor.rooms.find(room => roomContainsPoint(room, player.position.x, player.position.z));
    const location = currentRoom?.kind ? ROOM_LABELS[currentRoom.kind] : '连接通道';
    this.element.setAttribute('aria-label', `第 ${floor.floor} 层，当前位置：${location}。帐篷：营地；双剑：战斗；骷髅：试炼；宝箱：宝藏；绿碑：恢复；拱门：出口；钱袋：商店；红盔：Boss。绿色角标表示已完成。`);
    this.element.title = this.element.getAttribute('aria-label')!;
    for (const room of floor.rooms) {
      if (!room.kind) continue;
      const center = roomCenter(room);
      const x=center.x*scale, z=center.z*scale;
      const cleared = progress?.cleared.includes(room.id!);
      const size = this.size < 100 ? 11 : 17;
      const index = { start: 0, battle: 1, elite: 2, treasure: 3, sanctuary: 4, exit: floor.floor % 5 === 0 ? 7 : 5 }[room.kind];
      this.icon(index, x, z, size, ['S', '⚔', '★', '$', '+', '↗', '$', 'B'][index]);
      ctx.strokeStyle = room === currentRoom ? '#fff4c9' : `#${ROOM_COLORS[room.kind].toString(16).padStart(6,'0')}`;
      ctx.lineWidth = room === currentRoom ? 2 : 1;
      if (room === currentRoom || room.required) ctx.strokeRect(Math.round(x-size/2-1), Math.round(z-size/2-1), size+2, size+2);
      if (cleared) {
        ctx.fillStyle = '#72efab'; ctx.fillRect(Math.round(x+size/2-2), Math.round(z+size/2-2), 3, 3);
      }
    }

    if (floor.merchant) {
      this.icon(6, (floor.merchant.x + .5) * scale, (floor.merchant.z + .5) * scale, this.size < 100 ? 11 : 17, '商');
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
