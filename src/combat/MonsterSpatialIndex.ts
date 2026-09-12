import type { Monster } from '../monsters/Monster';
import type { Projectile } from './ProjectileSystem';

/** Frame-local broad phase. Rebuild after damage callbacks which can move/spawn actors. */
export class MonsterSpatialIndex {
  private cells = new Map<string, number[]>();
  private monsters: Monster[] = [];
  private readonly cellSize = 4;

  rebuild(monsters: Monster[]): void {
    this.monsters = monsters;
    this.cells.clear();
    monsters.forEach((monster, index) => {
      if (monster.dead) return;
      const key = `${Math.floor(monster.position.x / this.cellSize)},${Math.floor(monster.position.z / this.cellSize)}`;
      const cell = this.cells.get(key);
      if (cell) cell.push(index); else this.cells.set(key, [index]);
    });
  }

  query(projectile: Projectile, dt: number): Monster[] {
    if (!projectile.friendly) return [];
    const speed = projectile.velocity.length();
    const distance = Math.min(speed * dt, Math.max(0, (projectile.maxDistance ?? Infinity) - projectile.traveled), Math.max(0, projectile.life) * speed);
    const radius = projectile.radius ?? 1.1;
    const x = projectile.position.x, z = projectile.position.z;
    const endX = x + (speed ? projectile.velocity.x / speed * distance : 0);
    const endZ = z + (speed ? projectile.velocity.z / speed * distance : 0);
    const minX = Math.floor((Math.min(x, endX) - radius) / this.cellSize), maxX = Math.floor((Math.max(x, endX) + radius) / this.cellSize);
    const minZ = Math.floor((Math.min(z, endZ) - radius) / this.cellSize), maxZ = Math.floor((Math.max(z, endZ) + radius) / this.cellSize);
    // Extremely long rays are cheaper to check directly than to enumerate empty cells.
    if ((maxX-minX+1)*(maxZ-minZ+1) > this.monsters.length * 2) return this.monsters;
    const indices: number[] = [];
    for (let cz=minZ;cz<=maxZ;cz++) for (let cx=minX;cx<=maxX;cx++) {
      const cell=this.cells.get(`${cx},${cz}`);
      if (cell) indices.push(...cell);
    }
    indices.sort((a,b)=>a-b); // Preserve the original tie-breaking order.
    return indices.map(index=>this.monsters[index]);
  }
}
