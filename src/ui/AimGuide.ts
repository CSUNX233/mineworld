import * as THREE from 'three';

/** Reused ground arrow for touch aiming; presentation only, no hit detection. */
export class AimGuide {
  private readonly points = new Float32Array(18);
  readonly mesh = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x70f5dc, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }),
  );
  constructor() {
    this.mesh.geometry.setAttribute('position', new THREE.BufferAttribute(this.points, 3));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }
  show(origin: THREE.Vector3, direction: THREE.Vector3, distance: number): void {
    const x = origin.x + direction.x * distance, z = origin.z + direction.z * distance;
    const y = origin.y + 0.07;
    const head = Math.min(0.4, distance * 0.25);
    this.points.set([origin.x, y, origin.z, x, y, z,
      x, y, z, x - direction.x * head - direction.z * head * 0.6, y, z - direction.z * head + direction.x * head * 0.6,
      x, y, z, x - direction.x * head + direction.z * head * 0.6, y, z - direction.z * head - direction.x * head * 0.6]);
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.visible = true;
  }
}
