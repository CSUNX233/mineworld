import type { FloorData } from '../types';
import { BlockKind } from './Block';
import { invalidateNavigation } from './Navigation';

export interface FoundryPanel { id: string; cells: {x: number; z: number}[]; broken: boolean }
const panels = new WeakMap<FloorData, FoundryPanel[]>();
export function foundryPanels(floor: FloorData): FoundryPanel[] { return panels.get(floor) ?? []; }
export function prepareFoundryPanels(floor: FloorData, broken: string[] = []): void {
  const result: FoundryPanel[] = [];
  if ((floor.generationVersion ?? 1) < 4) return;
  for (const room of floor.rooms.filter(r => r.template === 'impact-yard')) {
    for (const [index, x] of [room.x+4, room.x+room.width-5].entries()) {
      const id = `${room.id}-panel-${index}`;
      const cells = [-1,0,1].map(offset => ({x, z:room.z+Math.floor(room.depth/2)+offset}))
        .filter(c => floor.grid[c.z][c.x] === BlockKind.Floor);
      if (!cells.length) continue;
      const panel={id,cells,broken:broken.includes(id)};
      result.push(panel);
      if (!panel.broken) for (const c of cells) floor.grid[c.z][c.x]=BlockKind.Obstacle;
    }
  }
  panels.set(floor,result);
  invalidateNavigation(floor);
}
export function breakFoundryPanel(floor: FloorData, x: number, z: number): FoundryPanel | null {
  const panel=foundryPanels(floor).find(p=>!p.broken && p.cells.some(c=>c.x===Math.floor(x)&&c.z===Math.floor(z)));
  if (!panel) return null;
  panel.broken=true;
  for(const cell of panel.cells) floor.grid[cell.z][cell.x]=BlockKind.Floor;
  invalidateNavigation(floor);
  return panel;
}
