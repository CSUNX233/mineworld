import * as THREE from 'three';
import type { FloorData, Room } from '../types';
import type { Monster } from './Monster';
import type { EncounterMechanicsHost, MechanicPlayer, SerializedMechanicState } from './EncounterMechanics';
import { FOUNDRY_CHAPTER as CONFIG } from '../data/FoundryChapter';
import { monsterAttack } from '../data/recipes';
import { pressureLaneCells } from '../world/FoundryGeometry';
import { disposeMechanicObject, setMechanicVisualPhase } from './MechanicVisual';

interface State {
  cooldown: number;
  remaining: number;
  phase: 'idle' | 'warning' | 'active';
  cells: { x: number; z: number }[];
  visual: THREE.Group | null;
  interrupted: boolean;
  hit: boolean;
  side: number;
}

/** Room-defined lanes, rather than circles following the player. Owns and cleans all temporary visuals. */
export class ValveOverseer {
  private states = new Map<Monster, State>();

  private state(monster: Monster): State {
    let state = this.states.get(monster);
    if (!state) {
      state = { cooldown: 2.5, remaining: 0, phase: 'idle', cells: [], visual: null, interrupted: false, hit: false, side: 0 };
      this.states.set(monster, state);
    }
    return state;
  }

  handles(monster: Monster): boolean {
    // Dedicated AI: stationary readable valve operation; no hidden ordinary attacks during recovery.
    return monster.def.id === CONFIG.monsterId;
  }

  interrupt(monster: Monster): void {
    const state = this.state(monster);
    if (state.phase === 'warning') state.interrupted = true;
  }

  serialize(monster: Monster): SerializedMechanicState {
    const state = this.state(monster);
    return { role: 'controller', cooldown: state.cooldown, interruptedCast: state.phase !== 'idle' };
  }

  restore(monster: Monster, saved: SerializedMechanicState | undefined): void {
    if (saved?.role !== 'controller') return;
    this.state(monster).cooldown = Math.max(2.5, saved.cooldown);
  }

  update(dt: number, monsters: Monster[], player: MechanicPlayer, floor: FloorData, host: EncounterMechanicsHost): void {
    for (const [monster, state] of this.states) {
      if (monster.dead || !monsters.includes(monster)) {
        this.removeVisual(state, host);
        this.states.delete(monster);
      }
    }
    for (const monster of monsters) {
      if (monster.dead || monster.def.id !== CONFIG.monsterId) continue;
      const state = this.state(monster);
      monster.velocity.set(0, 0, 0);
      monster.faceToward(player.position.x, player.position.z);
      if (state.interrupted) {
        this.removeVisual(state, host);
        state.phase = 'idle';
        state.cooldown = CONFIG.interruptRecovery;
        state.interrupted = false;
      }
      if (state.phase === 'idle') {
        setMechanicVisualPhase(monster, 'exposed');
        state.cooldown = Math.max(0, state.cooldown - dt);
        if (state.cooldown > 0) continue;
        const room = floor.rooms.find(room => room.id === monster.roomId);
        if (!room || !this.begin(monster, state, room, floor, player, host)) continue;
        continue;
      }
      state.remaining -= dt;
      setMechanicVisualPhase(monster, 'casting', state.remaining);
      if (state.phase === 'warning' && state.remaining <= 0) {
        this.removeVisual(state, host);
        state.phase = 'active';
        state.remaining = CONFIG.activeDuration;
        state.visual = this.visual(state.cells, true);
        host.addWorldObject(state.visual);
      }
      if (state.phase === 'active') {
        if (!state.hit && state.cells.some(cell =>
          player.position.x > cell.x - .35 && player.position.x < cell.x + 1.35
          && player.position.z > cell.z - .35 && player.position.z < cell.z + 1.35)) {
          state.hit = true;
          host.damagePlayer(monsterAttack(monster.def.attack, floor.floor), 'foundry_steam');
        }
        if (state.remaining <= 0) {
          this.removeVisual(state, host);
          state.phase = 'idle';
          state.cooldown = CONFIG.cooldown;
        }
      }
    }
  }

  private begin(monster: Monster, state: State, room: Room, floor: FloorData, player: MechanicPlayer, host: EncounterMechanicsHost): boolean {
    // Choose a fixed side, never move the lane after warning starts. Wide end crossings always stay safe.
    state.side = player.position.x < room.x + room.width / 2 ? 0 : 1;
    const cells = pressureLaneCells(room, floor, state.side);
    if (!cells.length) return false;
    state.cells = cells;
    state.hit = false;
    state.phase = 'warning';
    state.remaining = CONFIG.windup;
    state.visual = this.visual(cells, false);
    host.addWorldObject(state.visual);
    monster.velocity.set(0, 0, 0);
    return true;
  }

  private visual(cells: { x: number; z: number }[], active: boolean): THREE.Group {
    const root = new THREE.Group();
    root.name = active ? 'foundry-steam-active' : 'foundry-steam-warning';
    const geometry = new THREE.BoxGeometry(1, active ? .65 : .035, 1);
    const material = new THREE.MeshBasicMaterial({ color: active ? 0xff6030 : 0xffd06a,
      transparent: true, opacity: active ? .48 : .5, depthWrite: false });
    const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
    const matrix = new THREE.Matrix4();
    cells.forEach((cell, i) => mesh.setMatrixAt(i, matrix.makeTranslation(cell.x + .5, active ? .36 : .075, cell.z + .5)));
    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
    // Repeated white chevrons distinguish the lane from circular ground hazards, even without color.
    const arrowGeometry = new THREE.ConeGeometry(.22, .5, 3);
    arrowGeometry.rotateX(Math.PI / 2);
    const arrows = new THREE.InstancedMesh(arrowGeometry, new THREE.MeshBasicMaterial({color: 0xfff0c4}), cells.length);
    cells.forEach((cell, i) => arrows.setMatrixAt(i, matrix.makeTranslation(cell.x + .5, .13, cell.z + .5)));
    arrows.instanceMatrix.needsUpdate = true;
    root.add(arrows);
    return root;
  }

  private removeVisual(state: State, host?: EncounterMechanicsHost): void {
    if (!state.visual) return;
    host?.removeWorldObject(state.visual);
    state.visual.removeFromParent();
    disposeMechanicObject(state.visual);
    state.visual = null;
  }

  clear(host?: EncounterMechanicsHost): void {
    for (const state of this.states.values()) this.removeVisual(state, host);
    this.states.clear();
  }
}
