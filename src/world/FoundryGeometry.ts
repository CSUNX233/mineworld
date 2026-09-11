import * as THREE from 'three';
import type { FloorData, Room } from '../types';
import { BlockKind } from './Block';

/** Shared by idle pipe markings and the exact steam footprint. End crossings remain clear. */
export function pressureLaneCells(room: Room, floor: FloorData, side: number): {x: number; z: number}[] {
  return (room.cells ?? []).filter(cell => floor.grid[cell.z][cell.x] === BlockKind.Floor
    && cell.z >= room.z + 2 && cell.z < room.z + room.depth - 2
    && (side === 0 ? cell.x >= room.x + 1 && cell.x < room.x + 4
      : cell.x >= room.x + room.width - 4 && cell.x < room.x + room.width - 1));
}

export function createFoundryPipes(floor: FloorData): THREE.InstancedMesh | null {
  const room = floor.rooms.find(room => room.template === 'pressure-ring');
  if (!room) return null;
  const cells = [...pressureLaneCells(room, floor, 0), ...pressureLaneCells(room, floor, 1)];
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.16, .035, .92),
    new THREE.MeshLambertMaterial({color: 0xb99762}), cells.length);
  const matrix = new THREE.Matrix4();
  cells.forEach((cell, index) => mesh.setMatrixAt(index, matrix.makeTranslation(cell.x+.5,.025,cell.z+.5)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = 'foundry-pressure-pipes';
  return mesh;
}
