import { GLOBAL_MONSTER_STAT_MULTIPLIER } from '../data/DifficultyBalance';
import { foundryOpeningEncounter } from '../data/FoundryChapter';
import { RUINS_MONSTERS } from '../data/RuinsMonsters';
import { SANCTUM_MONSTERS } from '../data/SanctumMonsters';
import { ruinsEncounterForRoom } from '../data/RuinsChapter';
import { sanctumEncounterForRoom } from '../data/SanctumChapter';
import type { FloorData, MonsterDefinition, SavedMonster, Room } from '../types';
import monsterData from '../data/monsters.json';
import { ENCOUNTERS, encounterById, type EncounterDefinition, type EncounterRole } from '../data/encounters';
import { monsterAttack, monsterHealth, monsterXp } from '../data/recipes';
import { RNG } from '../utils/RNG';
import { BlockKind } from '../world/Block';
import { Monster } from './Monster';
import { attachMechanicVisual } from './MechanicVisual';

const MONSTER_DEFS = [...monsterData as unknown as MonsterDefinition[], ...RUINS_MONSTERS, ...SANCTUM_MONSTERS];

export class MonsterSpawner {
  static spawnEncounter(floor: FloorData, room: Room, player: { x: number; z: number }, rng: RNG): Monster[] {
    const teaching = (floor.generationVersion ?? 0) >= 3 && room.template === 'pressure-ring';
    const revised = (floor.generationVersion ?? 0) >= 5 ? (ruinsEncounterForRoom(floor.floor, room.id!) ?? sanctumEncounterForRoom(floor.floor, room.id!) ?? foundryOpeningEncounter(floor.floor, room.id!)) : undefined;
    const chapter = (floor.generationVersion ?? 0) >= 4 ? ENCOUNTERS.find(e => e.template === room.template && e.minFloor <= floor.floor) : undefined;
    if (chapter) room.encounterId = chapter.id;
    if (teaching) room.encounterId = 'pressure_lesson';
    const pool = this.availableForFloor(floor.floor);
    const roomCells = this.roomWalkableCells(floor, room);
    const candidates = roomCells.filter(cell => Math.hypot(cell.x + .5 - player.x, cell.z + .5 - player.z) > 3);
    const bossRoom = room.kind === 'exit' && floor.floor % 5 === 0;
    const desiredCount = revised?.monsterIds.length ?? chapter?.monsterIds?.length ?? (teaching ? 1 : bossRoom
      ? Math.min(3, Math.max(1, Math.floor(roomCells.length / 14)))
      : this.encounterSize(roomCells.length, floor.floor, room.kind === 'elite', rng));
    const count = Math.min(desiredCount, Math.max(1, candidates.length));
    const spawnPool = candidates.length ? candidates : roomCells;
    const spots = this.pickSpacedSpots(spawnPool, count, rng);
    const encounter = bossRoom || revised || chapter ? undefined : this.pickEncounter(room, floor.floor, rng);
    if (encounter) room.encounterId = encounter.id;
    const roles = encounter ? this.rolesForEncounter(encounter, spots.length, roomCells.length, rng)
      : this.fallbackRoles(spots.length, floor.floor);

    return spots.map((spot, i) => {
      const choices = pool.filter(def => this.roleForDefinition(def) === roles[i]);
      const def = revised?.monsterIds[i] ? this.definitionById(revised.monsterIds[i])! : chapter?.monsterIds?.[i] ? this.definitionById(chapter.monsterIds[i])! : teaching ? this.definitionById('valve_overseer')! : bossRoom && i === 0 ? this.bossForFloor(floor.floor)! : rng.pick(choices.length ? choices : pool);
      const monster = new Monster(def, spot.x + .5, spot.z + .5);
      attachMechanicVisual(monster);
      monster.roomId = room.id!;
      monster.maxHealth = monsterHealth(def.health, floor.floor, def.behavior === 'boss');
      monster.health = monster.maxHealth;
      if (room.kind === 'elite' && i === 0 && def.behavior !== 'boss') { monster.setElite(['extraHealth']); monster.maxHealth *= 1.6; monster.health=monster.maxHealth; }
      monster.state = 'chase';
      return monster;
    });
  }
  static availableForFloor(floor: number): MonsterDefinition[] {
    return MONSTER_DEFS.filter((def) => def.minFloor <= floor && def.behavior !== 'boss' && !['valve_overseer','ram_beast','chain_smith','prism_sentry'].includes(def.id) && !SANCTUM_MONSTERS.some(s => s.id === def.id));
  }

  static bossForFloor(floor: number): MonsterDefinition | null {
    const id = floor === 25 ? 'ruins_warden' : 'boss';
    return MONSTER_DEFS.find((def) => def.id === id) ?? null;
  }

  static definitionById(id: string): MonsterDefinition | null {
    return MONSTER_DEFS.find((def) => def.id === id) ?? null;
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
    return monsterAttack(monster.def.attack, floor, monster.def.behavior === 'boss');
  }

  static spawnMinionAt(floorData: FloorData, position: { x: number; z: number }, rng: RNG, meleeOnly = false): Monster | null {
    const pool = this.availableForFloor(floorData.floor).filter(def => !def.role && (!meleeOnly || def.id === 'slime' || def.id === 'zombie'));
    if (pool.length === 0) return null;
    const spot = this.findNearestWalkable(floorData, position.x, position.z);
    if (!spot) return null;
    const def = rng.pick(pool);
    const monster = new Monster(def, spot.x + 0.5, spot.z + 0.5);
    attachMechanicVisual(monster);
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
    attachMechanicVisual(monster);
    if (saved.elite && saved.eliteModifiers.length > 0) monster.setElite(saved.eliteModifiers);
    monster.statuses = structuredClone(saved.statuses ?? []);
    monster.roomId = saved.roomId ?? '';
    const previousScale = Number.isFinite(saved.difficultyStatMultiplier) && saved.difficultyStatMultiplier! > 0 ? saved.difficultyStatMultiplier! : 1;
    const ratio = GLOBAL_MONSTER_STAT_MULTIPLIER / previousScale;
    monster.maxHealth = Math.max(1, Math.round(saved.maxHealth * ratio));
    monster.health = Math.min(monster.maxHealth, Math.max(0, saved.health * ratio));
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

  private static roomWalkableCells(floor: FloorData, room: Room): { x: number; z: number }[] {
    if (room.cells?.length) return room.cells.filter(cell => this.isWalkableCell(floor, cell.x, cell.z));
    const cells: { x: number; z: number }[] = [];
    for (let z = room.z + 1; z < room.z + room.depth - 1; z++) {
      for (let x = room.x + 1; x < room.x + room.width - 1; x++) {
        if (this.isWalkableCell(floor, x, z)) cells.push({ x, z });
      }
    }
    return cells;
  }

  private static encounterSize(cellCount: number, floor: number, elite: boolean, rng: RNG): number {
    const spaceCap = Math.max(2, Math.min(8, Math.floor(cellCount / 10)));
    const pressure = 2 + Math.floor(floor / 5) + (elite ? 1 : 0) + rng.int(0, 1);
    return Math.min(spaceCap, Math.max(2, pressure));
  }

  private static pickEncounter(room: Room, floor: number, rng: RNG): EncounterDefinition | undefined {
    const requested = encounterById(room.encounterId);
    if (requested && requested.minFloor <= floor) return requested;
    const eligible = ENCOUNTERS.filter(encounter => encounter.minFloor <= floor && encounter.roomKinds.includes(room.kind ?? 'battle'));
    return eligible.length ? rng.pick(eligible) : undefined;
  }

  private static rolesForEncounter(
    encounter: EncounterDefinition,
    count: number,
    roomCellCount: number,
    rng: RNG,
  ): EncounterRole[] {
    const roles: EncounterRole[] = [];
    const slotMax = (role: EncounterRole, max: number): number =>
      roomCellCount < 34 && (role === 'guardian' || role === 'charger') ? Math.min(1, max) : max;
    for (const slot of encounter.slots) {
      const adjustedMax = slotMax(slot.role, slot.max);
      for (let amount = 0; amount < Math.min(slot.min, adjustedMax) && roles.length < count; amount++) roles.push(slot.role);
    }
    while (roles.length < count) {
      const options = encounter.slots.filter(slot => roles.filter(role => role === slot.role).length < slotMax(slot.role, slot.max));
      if (!options.length) break;
      roles.push(rng.pick(options).role);
    }
    while (roles.length < count) roles.push('melee');
    return rng.shuffle(roles);
  }

  private static fallbackRoles(count: number, floor: number): EncounterRole[] {
    return Array.from({ length: count }, (_, index) => index === 1 ? 'ranged' : index > 1 && floor > 2 ? 'charger' : 'melee');
  }

  private static roleForDefinition(def: MonsterDefinition): EncounterRole {
    return def.role ?? (def.behavior === 'boss' ? 'melee' : def.behavior);
  }

  private static pickSpacedSpots(cells: { x: number; z: number }[], count: number, rng: RNG): { x: number; z: number }[] {
    const shuffled = rng.shuffle(cells);
    const picked: { x: number; z: number }[] = [];
    for (const cell of shuffled) {
      if (picked.every(other => Math.hypot(other.x - cell.x, other.z - cell.z) >= 1.5)) picked.push(cell);
      if (picked.length >= count) return picked;
    }
    for (const cell of shuffled) {
      if (!picked.includes(cell)) picked.push(cell);
      if (picked.length >= count) break;
    }
    return picked;
  }

}
