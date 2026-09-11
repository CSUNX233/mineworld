import * as THREE from 'three';

const TAU = Math.PI * 2;

function pushVertex(target: number[], radius: number, angle: number): void {
  // Geometry lies in local XY and is rotated onto world XZ by the caller.
  target.push(Math.cos(angle) * radius, -Math.sin(angle) * radius, 0);
}

/** A horizontal sector whose angles use world-space atan2(z, x). */
export function foundrySectorGeometry(radius: number, centerAngle: number, halfAngle: number): THREE.BufferGeometry {
  const segments = 40;
  const positions: number[] = [];
  const start = centerAngle - halfAngle;
  for (let i = 0; i < segments; i++) {
    positions.push(0, 0, 0);
    pushVertex(positions, radius, start + (i / segments) * halfAngle * 2);
    pushVertex(positions, radius, start + ((i + 1) / segments) * halfAngle * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** A lane built directly from a world-space direction, avoiding Euler sign ambiguity. */
export function foundryLaneGeometry(
  width: number,
  length: number,
  directionX: number,
  directionZ: number,
): THREE.BufferGeometry {
  const half = width / 2;
  const perpendicularX = -directionZ;
  const perpendicularZ = directionX;
  const points = [
    [perpendicularX * half, perpendicularZ * half],
    [-perpendicularX * half, -perpendicularZ * half],
    [directionX * length - perpendicularX * half, directionZ * length - perpendicularZ * half],
    [directionX * length + perpendicularX * half, directionZ * length + perpendicularZ * half],
  ];
  const positions: number[] = [];
  for (const index of [0, 1, 2, 0, 2, 3]) {
    const [x, z] = points[index];
    positions.push(x, -z, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** An annulus with one explicit safe gap, using world-space atan2(z, x). */
export function foundryGappedRingGeometry(
  innerRadius: number,
  outerRadius: number,
  gapAngle: number,
  gapHalfAngle: number,
): THREE.BufferGeometry {
  const segments = 64;
  const positions: number[] = [];
  const visibleArc = Math.max(0.01, TAU - gapHalfAngle * 2);
  const start = gapAngle + gapHalfAngle;
  for (let i = 0; i < segments; i++) {
    const a = start + (i / segments) * visibleArc;
    const b = start + ((i + 1) / segments) * visibleArc;
    pushVertex(positions, innerRadius, a);
    pushVertex(positions, outerRadius, a);
    pushVertex(positions, outerRadius, b);
    pushVertex(positions, innerRadius, a);
    pushVertex(positions, outerRadius, b);
    pushVertex(positions, innerRadius, b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Updates an existing gapped ring without allocating a geometry every frame. */
export function updateFoundryGappedRingGeometry(
  geometry: THREE.BufferGeometry,
  innerRadius: number,
  outerRadius: number,
  gapAngle: number,
  gapHalfAngle: number,
): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const segments = position.count / 6;
  const visibleArc = Math.max(0.01, TAU - gapHalfAngle * 2);
  const start = gapAngle + gapHalfAngle;
  const write = (index: number, radius: number, angle: number) => {
    position.setXYZ(index, Math.cos(angle) * radius, -Math.sin(angle) * radius, 0);
  };
  for (let i = 0; i < segments; i++) {
    const a = start + (i / segments) * visibleArc;
    const b = start + ((i + 1) / segments) * visibleArc;
    const offset = i * 6;
    write(offset, innerRadius, a);
    write(offset + 1, outerRadius, a);
    write(offset + 2, outerRadius, b);
    write(offset + 3, innerRadius, a);
    write(offset + 4, outerRadius, b);
    write(offset + 5, innerRadius, b);
  }
  position.needsUpdate = true;
  geometry.computeBoundingSphere();
}

export function angleOutsideGap(angle: number, gapAngle: number, gapHalfAngle: number): boolean {
  const delta = Math.atan2(Math.sin(angle - gapAngle), Math.cos(angle - gapAngle));
  return Math.abs(delta) > gapHalfAngle;
}

/** First distance along a segment at which a moving circle touches a fixed circle. */
export function segmentCircleHitDistance(
  startX: number,
  startZ: number,
  directionX: number,
  directionZ: number,
  distance: number,
  circleX: number,
  circleZ: number,
  radius: number,
): number | null {
  const offsetX = circleX - startX;
  const offsetZ = circleZ - startZ;
  const along = offsetX * directionX + offsetZ * directionZ;
  if (along < -radius || along > distance + radius) return null;
  const perpendicularSq = offsetX * offsetX + offsetZ * offsetZ - along * along;
  if (perpendicularSq > radius * radius) return null;
  const entry = along - Math.sqrt(Math.max(0, radius * radius - perpendicularSq));
  return Math.max(0, Math.min(distance, entry));
}

export function pointSegmentDistanceSquared(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const lengthSq = vx * vx + vz * vz;
  if (lengthSq <= 1e-8) return (px - ax) ** 2 + (pz - az) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / lengthSq));
  const dx = px - (ax + vx * t);
  const dz = pz - (az + vz * t);
  return dx * dx + dz * dz;
}

/**
 * Finds a continuous intersection between a moving player and an expanding wave
 * front. Solving the relative quadratic avoids tunnelling on long frames.
 */
export function expandingWaveHitTime(
  originX: number,
  originZ: number,
  previousRadius: number,
  nextRadius: number,
  previousX: number,
  previousZ: number,
  nextX: number,
  nextZ: number,
  halfThickness: number,
): number | null {
  const px = previousX - originX;
  const pz = previousZ - originZ;
  const vx = nextX - previousX;
  const vz = nextZ - previousZ;
  const radialVelocity = nextRadius - previousRadius;
  const candidates: number[] = [0, 1];
  // Include the centre and both edges of the finite-width front. This also
  // catches a tangent pass through the band when the exact centre is missed.
  for (const offset of [-halfThickness, 0, halfThickness]) {
    const startRadius = previousRadius + offset;
    const a = vx * vx + vz * vz - radialVelocity * radialVelocity;
    const b = 2 * (px * vx + pz * vz - startRadius * radialVelocity);
    const c = px * px + pz * pz - startRadius * startRadius;
    if (Math.abs(a) < 1e-8) {
      if (Math.abs(b) > 1e-8) candidates.push(-c / b);
    } else {
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const root = Math.sqrt(discriminant);
        candidates.push((-b - root) / (2 * a), (-b + root) / (2 * a));
      }
    }
  }
  let best: number | null = null;
  for (const raw of candidates) {
    const t = Math.max(0, Math.min(1, raw));
    const x = px + vx * t;
    const z = pz + vz * t;
    const radius = previousRadius + radialVelocity * t;
    if (Math.abs(Math.hypot(x, z) - radius) <= halfThickness + 1e-5
      && (best === null || t < best)) best = t;
  }
  return best;
}

export function disposeFoundryObject(object: THREE.Object3D): void {
  object.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material.dispose();
  });
  object.removeFromParent();
}
