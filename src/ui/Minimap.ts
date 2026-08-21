import type { FloorData } from '../types';
import type { Monster } from '../monsters/Monster';
import type { Player } from '../player/Player';
import { BlockKind } from '../world/Block';
import { isMobileDevice } from '../utils/mobile';

export class Minimap {
  readonly element: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  readonly size = isMobileDevice() ? 75 : 150;
  private baseCanvas: HTMLCanvasElement | null = null;
  private baseFloor: FloorData | null = null;

  constructor(root: HTMLElement) {
    this.element = document.createElement('canvas');
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
  ): void {
    const ctx = this.context;
    ctx.clearRect(0, 0, this.size, this.size);
    if (!floor) return;
    const scale = this.size / floor.size;
    ctx.fillStyle = '#111722';
    ctx.fillRect(0, 0, this.size, this.size);

    if (this.baseFloor !== floor) {
      this.baseFloor = floor;
      if (!this.baseCanvas) this.baseCanvas = document.createElement('canvas');
      this.baseCanvas.width = this.size;
      this.baseCanvas.height = this.size;
      const baseCtx = this.baseCanvas.getContext('2d')!;
      baseCtx.fillStyle = '#111722';
      baseCtx.fillRect(0, 0, this.size, this.size);
      for (let z = 0; z < floor.size; z++) {
        for (let x = 0; x < floor.size; x++) {
          const kind = floor.grid[z][x];
          if (kind === BlockKind.Wall || kind === BlockKind.Obstacle) {
            baseCtx.fillStyle = '#59606a';
          } else if (kind === BlockKind.Portal) {
            baseCtx.fillStyle = '#c05bff';
          } else {
            baseCtx.fillStyle = '#202b38';
          }
          baseCtx.fillRect(x * scale, z * scale, Math.max(1, scale), Math.max(1, scale));
        }
      }
    }
    ctx.drawImage(this.baseCanvas!, 0, 0);

    monsters.forEach((monster) => {
      if (monster.dead) return;
      ctx.fillStyle = monster.def.behavior === 'boss' ? '#ff5b5b' : '#e85757';
      ctx.beginPath();
      ctx.arc(monster.position.x * scale, monster.position.z * scale, Math.max(1.2, scale * 0.4), 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(player.position.x * scale, player.position.z * scale, Math.max(1.6, scale * 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
}
