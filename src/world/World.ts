import * as THREE from 'three';
import type { FloorData } from '../types';
import { BlockKind } from './Block';
import { getBlock, initBlockRegistry } from './BlockRegistry';
import { ROOM_COLORS } from '../data/rooms';

export class World {
  readonly group = new THREE.Group();
  private floorData: FloorData | null = null;
  private portalMesh: THREE.Mesh | null = null;

  constructor(scene: THREE.Scene) {
    initBlockRegistry();
    this.group.name = 'world';
    scene.add(this.group);
  }

  get data(): FloorData | null {
    return this.floorData;
  }

  get portalWorldPosition(): THREE.Vector3 | null {
    if (!this.floorData) return null;
    return new THREE.Vector3(this.floorData.portal.x + 0.5, 1, this.floorData.portal.z + 0.5);
  }

  generate(data: FloorData): void {
    this.clear();
    this.floorData = data;
    const theme = data.theme;
    const size = data.size;

    const floorDef = getBlock(theme.floorType);
    const floorTexture = floorDef.texture.clone();
    floorTexture.repeat.set(size, size);
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.needsUpdate = true;
    const floorMaterial = new THREE.MeshLambertMaterial({ map: floorTexture });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(size / 2, 0, size / 2);
    floor.name = 'floor';
    this.group.add(floor);

    const wallCells: { x: number; z: number }[] = [];
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const kind = data.grid[z][x];
        if (kind === BlockKind.Wall || kind === BlockKind.Obstacle) {
          wallCells.push({ x, z });
        }
      }
    }

    if (wallCells.length > 0) {
      const wallDef = getBlock(theme.wallType);
      const wallTexture = wallDef.texture.clone();
      wallTexture.repeat.set(1, 1);
      wallTexture.needsUpdate = true;
      const wallMaterial = new THREE.MeshLambertMaterial({ map: wallTexture });
      const geometry = new THREE.BoxGeometry(1, 2, 1);
      const walls = new THREE.InstancedMesh(geometry, wallMaterial, wallCells.length);
      walls.name = 'walls';
      const matrix = new THREE.Matrix4();
      wallCells.forEach((cell, index) => {
        matrix.setPosition(cell.x + 0.5, 1, cell.z + 0.5);
        walls.setMatrixAt(index, matrix);
      });
      walls.instanceMatrix.needsUpdate = true;
      this.group.add(walls);
    }

    const portalPosition = this.portalWorldPosition!;
    const portalMaterial = new THREE.MeshBasicMaterial({
      color: 0xb56bff,
      transparent: true,
      opacity: 0.85,
    });
    this.portalMesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 0.8), portalMaterial);
    this.portalMesh.position.copy(portalPosition);
    this.portalMesh.name = 'portal';
    this.group.add(this.portalMesh);
    for (const room of data.rooms) {
      if (!room.kind || room.kind === 'start') continue;
      const marker = new THREE.Mesh(new THREE.RingGeometry(0.9,1.12,32),
        new THREE.MeshBasicMaterial({color:ROOM_COLORS[room.kind],transparent:true,opacity:.65,depthWrite:false,side:THREE.DoubleSide}));
      marker.rotation.x = -Math.PI/2;
      marker.position.set(room.x+5.5,.03,room.z+5.5);
      this.group.add(marker);
    }

    if (data.merchant) {
      const stall = new THREE.Group();
      stall.name = 'merchant';
      stall.position.set(data.merchant.x + .5, 0, data.merchant.z + .5);
      const addBox = (w: number, h: number, d: number, y: number, color: number) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
        mesh.position.y = y;
        stall.add(mesh);
      };
      addBox(1.2, .65, .6, .325, 0x805938);
      addBox(1.65, .15, 1.1, 1.9, 0xe2ad4d);
      addBox(.35, .6, .3, 1.05, 0x386f7d);
      addBox(.32, .32, .32, 1.5, 0xd5aa7e);
      const marker = new THREE.Mesh(new THREE.RingGeometry(.95, 1.1, 24), new THREE.MeshBasicMaterial({ color: 0xffcc66, side: THREE.DoubleSide }));
      marker.rotation.x = -Math.PI / 2;
      marker.position.y = .035;
      stall.add(marker);
      this.group.add(stall);
    }

    const chestMaterial = new THREE.MeshLambertMaterial({ color: 0xd7a93b });
    const chestGeometry = new THREE.BoxGeometry(0.6, 0.45, 0.4);
    data.chests.forEach((chest) => {
      const mesh = new THREE.Mesh(chestGeometry, chestMaterial);
      mesh.position.set(chest.x + 0.5, 0.3, chest.z + 0.5);
      mesh.userData.chest = { x: chest.x, z: chest.z };
      mesh.name = 'chest';
      this.group.add(mesh);
    });
  }

  setPortalActive(active: boolean): void {
    if (this.portalMesh) (this.portalMesh.material as THREE.MeshBasicMaterial).color.setHex(active ? 0xb56bff : 0x444958);
  }

  removeChest(x: number, z: number): void {
    const chest = this.group.children.find(
      (child) =>
        child.name === 'chest' &&
        (child.userData.chest as { x?: number; z?: number } | undefined)?.x === x &&
        (child.userData.chest as { x?: number; z?: number } | undefined)?.z === z,
    );
    if (chest) {
      this.group.remove(chest);
      if (chest instanceof THREE.Mesh) {
        chest.geometry.dispose();
        const materials = Array.isArray(chest.material) ? chest.material : [chest.material];
        materials.forEach((material) => material.dispose());
      }
    }
  }

  update(dt: number, elapsed: number): void {
    if (this.portalMesh) {
      this.portalMesh.rotation.y += dt * 1.6;
      this.portalMesh.position.y = 1 + Math.sin(elapsed * 2.5) * 0.08;
    }
    this.group.children.forEach((child) => {
      if (child.name === 'chest') {
        child.rotation.y += dt * 0.8;
      }
    });
  }

  private clear(): void {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          if (material.map) material.map.dispose();
          material.dispose();
        });
      }
    }
    this.portalMesh = null;
  }
}
