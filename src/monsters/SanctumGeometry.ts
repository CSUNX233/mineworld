import * as THREE from 'three';
import type { FloorData, Room } from '../types';
import { isWalkable } from '../world/FloorGenerator';
import { roomContainsPoint } from '../world/RoomGeometry';
import { encounterBarrierBlocksCylinder } from '../world/EncounterBarriers';

export function disposeSanctumObject(object: THREE.Object3D): void {
  object.removeFromParent();
  object.traverse(child => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material.dispose();
  });
}

export function segmentDistanceSquared(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / Math.max(1e-9, dx * dx + dz * dz)));
  return (x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2;
}

export function inSector(x: number, z: number, ox: number, oz: number, dx: number, dz: number, radius: number, halfAngle: number): boolean {
  const px = x - ox, pz = z - oz, distance = Math.hypot(px, pz);
  return distance <= radius && (distance < 1e-6 || (px * dx + pz * dz) / distance >= Math.cos(halfAngle));
}

export function sanctumSector(radius: number, halfAngle: number, dx: number, dz: number): THREE.BufferGeometry {
  const vertices: number[] = [];
  const angle = Math.atan2(dz, dx);
  for (let i = 0; i < 32; i++) {
    const a = angle - halfAngle + 2 * halfAngle * i / 32;
    const b = angle - halfAngle + 2 * halfAngle * (i + 1) / 32;
    vertices.push(0, 0, 0, Math.cos(a) * radius, 0, Math.sin(a) * radius, Math.cos(b) * radius, 0, Math.sin(b) * radius);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  return geometry;
}

/** Conservative cardinal route, measured in walking time rather than spare floor area. */
export function hasReachableSanctumSafety(
  floor: FloorData, room: Room, start: { x: number; z: number }, seconds: number,
  danger: (x: number, z: number) => boolean,
): boolean {
  if (!danger(start.x, start.z)) return true;
  const budget = Math.max(0, seconds - 0.2) * 3;
  const bodyFits = (x: number, z: number) => [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]
    .every(([dx, dz]) => isWalkable(floor, Math.floor(x + dx), Math.floor(z + dz)) && roomContainsPoint(room, x + dx, z + dz))
    && !encounterBarrierBlocksCylinder(floor, x, z, 0.3);
  const queue: { x: number; z: number; distance: number }[] = [];
  // Seed adjacent centers using the player's actual subcell position. Charging an
  // extra center offset on every route would wrongly cancel ordinary 1s marks.
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const x = Math.floor(start.x) + dx, z = Math.floor(start.z) + dz;
    const distance = Math.hypot(x + 0.5 - start.x, z + 0.5 - start.z);
    let clear = true;
    const steps = Math.max(1, Math.ceil(distance / 0.15));
    for (let step = 1; step <= steps; step++) {
      const px = start.x + (x + 0.5 - start.x) * step / steps;
      const pz = start.z + (z + 0.5 - start.z) * step / steps;
      if (!bodyFits(px, pz)) { clear = false; break; }
    }
    if (clear) queue.push({ x, z, distance });
  }
  const seen = new Map<string, number>();
  for (let index = 0; index < queue.length; index++) {
    const node = queue[index];
    if (node.distance > budget) continue;
    const key = `${node.x},${node.z}`;
    if ((seen.get(key) ?? Infinity) <= node.distance) continue;
    seen.set(key, node.distance);
    const x = node.x + 0.5, z = node.z + 0.5;
    if (!bodyFits(x, z)) continue;
    if (!danger(x, z)) return true;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      queue.push({ x: node.x + dx, z: node.z + dz, distance: node.distance + 1 });
    }
  }
  return false;
}
