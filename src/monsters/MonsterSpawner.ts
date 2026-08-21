import type { FloorData, MonsterDefinition, SavedMonster } from '../types';
import monsterData from '../data/monsters.json';
import { monsterAttack, monsterHealth, monsterXp } from '../data/recipes';
import { RNG } from '../utils/RNG';
import { BlockKind } from '../world/Block';
import { Monster } from './Monster';

const MONSTER_DEFS = monsterData as unknown as MonsterDefinition[];

export class MonsterSpawner {
  static availableForFloor(floor: number): MonsterDefinition[] {
    return MONSTER_DEFS.filter((def) => def.minFloor <= floor && def.id !== 'boss');
  }

  static bossForFloor(floor: number): MonsterDefinition | null {
    return MONSTER_DEFS.find((def) => def.id === 'boss') ?? null;
  }

  static definitionById(id: string): MonsterDefinition | null {
    return MONSTER_DEFS.find((def) => def.id === id) ?? null;
  }

  static spawnWave(floorData: FloorData, playerPosition: { x: number; z: number }, count: number, rng: RNG): Monster[] {
    const monsters: Monster[] = [];
    const pool = this.availableForFloor(floorData.floor);
    const isBossFloor = floorData.floor % 5 === 0;
    const spawnCount = isBossFloor ? Math.max(3, Math.min(count, 8)) : count;

    for (let i = 0; i < spawnCount; i++) {
      const def = rng.pick(pool);
      const spot = this.findSpawnCell(floorData, playerPosition, rng);
      if (!spot) continue;
      const monster = new Monster(def, spot.x + 0.5, spot.z + 0.5);
      monster.maxHealth = monsterHealth(def.health, floorData.floor);
      monster.health = monster.maxHealth;
      this.rollElite(monster, floorData.floor, rng);
      monsters.push(monster);
    }

    if (isBossFloor) {
      const bossDef = this.bossForFloor(floorData.floor);
      if (bossDef) {
        const spot = this.findSpawnCell(floorData, playerPosition, rng, 8);
        if (spot) {
          const boss = new Monster(bossDef, spot.x + 0.5, spot.z + 0.5);
          boss.maxHealth = Math.round(monsterHealth(bossDef.health, floorData.floor) * 1.4);
          boss.health = boss.maxHealth;
          monsters.push(boss);
        }
      }
    }
    return monsters;
  }

  private static rollElite(monster: Monster, floor: number, rng: RNG): void {
    const chance = Math.min(0.28, 0.035 + floor * 0.018);
    if (!rng.chance(chance)) return;
    const pool = ['extraHealth', 'fast', 'fireEnchanted', 'vampiric'];
    const modifiers = rng.shuffle(pool).slice(0, rng.int(1, 2));
    monster.setElite(modifiers);
    if (modifiers.includes('extraHealth')) {
      monster.maxHealth = Math.round(monster.maxHealth * 2.1);
      monster.health = monster.maxHealth;
    }
    if (modifiers.includes('vampiric')) {
      monster.def = { ...monster.def, attack: Math.round(monster.def.attack * 1.15) };
    }
  }

  static baseXp(monster: Monster, floor: number): number {
    return monsterXp(monster.def.xp, floor);
  }

  static baseAttack(monster: Monster, floor: number): number {
    return monsterAttack(monster.def.attack, floor);
  }

  static spawnMinionAt(floorData: FloorData, position: { x: number; z: number }, rng: RNG): Monster | null {
    const pool = this.availableForFloor(floorData.floor);
    if (pool.length === 0) return null;
    const spot = this.findNearestWalkable(floorData, position.x, position.z);
    if (!spot) return null;
    const def = rng.pick(pool);
    const monster = new Monster(def, spot.x + 0.5, spot.z + 0.5);
    monster.maxHealth = monsterHealth(def.health, floorData.floor);
    monster.health = monster.maxHealth;
    this.rollElite(monster, floorData.floor, rng);
    return monster;
  }

  static spawnSaved(saved: SavedMonster, floorData: FloorData): Monster | null {
    const def = this.definitionById(saved.defId);
    if (!def) return null;
    const spot = this.findNearestWalkable(floorData, saved.x, saved.z);
    if (!spot) return null;
    const monster = new Monster(def, spot.x + 0.5, spot.z + 0.5);
    if (saved.elite && saved.eliteModifiers.length > 0) monster.setElite(saved.eliteModifiers);
    monster.maxHealth = Math.max(1, saved.maxHealth);
    monster.health = Math.min(monster.maxHealth, Math.max(0, saved.health));
    return monster;
  }

  static isWalkableCell(floorData: FloorData, x: number, z: number): boolean {
    const cellX = Math.floor(x);
    const cellZ = Math.floor(z);
    if (cellX < 0 || cellZ < 0 || cellX >= floorData.size || cellZ >= floorData.size) return false;
    const kind = floorData.grid[cellZ][cellX];
    return kind === BlockKind.Floor || kind === BlockKind.Portal;
  }

  static findNearestWalkable(floorData: FloorData, x: number, z: number): { x: number; z: number } | null {
    const size = floorData.size;
    const startX = Math.floor(x);
    const startZ = Math.floor(z);
    if (this.isWalkableCell(floorData, startX, startZ)) return { x: startX, z: startZ };

    const maxRadius = Math.max(size, 1);
    for (let radius = 1; radius <= maxRadius; radius++) {
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
          const cellX = startX + dx;
          const cellZ = startZ + dz;
          if (cellX < 0 || cellZ < 0 || cellX >= size || cellZ >= size) continue;
          const kind = floorData.grid[cellZ][cellX];
          if (kind === BlockKind.Floor || kind === BlockKind.Portal) return { x: cellX, z: cellZ };
        }
      }
    }
    return null;
  }

  private static findSpawnCell(
    floorData: FloorData,
    playerPosition: { x: number; z: number },
    rng: RNG,
    minDistance = 7,
  ): { x: number; z: number } | null {
    const cells: { x: number; z: number }[] = [];
    for (let z = 0; z < floorData.size; z++) {
      for (let x = 0; x < floorData.size; x++) {
        if (floorData.grid[z][x] !== BlockKind.Floor && floorData.grid[z][x] !== BlockKind.Portal) continue;
        const dist = Math.abs(x - playerPosition.x) + Math.abs(z - playerPosition.z);
        if (dist >= minDistance) cells.push({ x, z });
      }
    }
    if (cells.length === 0) {
      for (let z = 0; z < floorData.size; z++) {
        for (let x = 0; x < floorData.size; x++) {
          if (floorData.grid[z][x] === BlockKind.Floor || floorData.grid[z][x] === BlockKind.Portal) cells.push({ x, z });
        }
      }
    }
    return cells.length > 0 ? rng.pick(cells) : null;
  }
}
