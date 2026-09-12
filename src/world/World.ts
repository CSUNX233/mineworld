import { getChapterTexture } from './ChapterTextures';
import { foundryPanels, breakFoundryPanel } from './FoundryPanels';
import { createFoundryPipes } from './FoundryGeometry';
import { roomCenter } from './RoomGeometry';
import { createChapterLandmarks } from './ChapterGeometry';
import { ruinsSupplyCells } from '../data/RuinsChapter';
import { invalidateNavigation } from './Navigation';
import * as THREE from 'three';
import type { FloorData } from '../types';
import { BlockKind } from './Block';
import { getBlock, initBlockRegistry } from './BlockRegistry';
import { ROOM_COLORS } from '../data/rooms';
import {
  clearEncounterBarriers,
  ENCOUNTER_BARRIER_HEIGHT,
  setEncounterBarrierRooms,
} from './EncounterBarriers';

export class World {
  readonly group = new THREE.Group();
  private panelMeshes = new Map<string, THREE.InstancedMesh>();
  private supplyMeshes = new Map<string, THREE.InstancedMesh>();
  private floorData: FloorData | null = null;
  private portalMesh: THREE.Mesh | null = null;
  private encounterBarrierMesh: THREE.InstancedMesh | null = null;

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
    const chapterFloor = getChapterTexture(data.floor, 'floor');
    const floorTexture = (chapterFloor ?? floorDef.texture).clone();
    floorTexture.repeat.set(size / (chapterFloor ? 4 : 1), size / (chapterFloor ? 4 : 1));
    floorTexture.wrapS = chapterFloor ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
    floorTexture.wrapT = floorTexture.wrapS;
    floorTexture.needsUpdate = true;
    const floorTint = (data.generationVersion ?? 1) >= 5 ? data.theme.id === 'sanctum' ? 0xaaa99c : data.floor === 1 ? 0xd3d3b8 : data.floor === 2 ? 0xbfa486 : data.floor === 3 ? 0xaaa985 : data.floor === 4 ? 0xbeb9a3 : 0xffffff : 0xffffff;
    const floorMaterial = new THREE.MeshLambertMaterial({ map: floorTexture, color: floorTint });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(size / 2, 0, size / 2);
    floor.name = 'floor';
    this.group.add(floor);
    const pipes = createFoundryPipes(data);
    if (pipes) this.group.add(pipes);
    const landmarks = createChapterLandmarks(data);
    if (landmarks) this.group.add(landmarks);

    const supplyCells = new Set<string>();
    for (const room of data.rooms.filter(r => r.template === 'ruins-supply')) {
      const cells = ruinsSupplyCells(room).filter(c => data.grid[c.z]?.[c.x] === BlockKind.Obstacle);
      for (const c of cells) supplyCells.add(`${c.x},${c.z}`);
      if (!cells.length) continue;
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.95,1.05,.95),new THREE.MeshLambertMaterial({color:0x8e6745}),cells.length);
      const matrix = new THREE.Matrix4(); cells.forEach((c,i) => mesh.setMatrixAt(i,matrix.makeTranslation(c.x+.5,.525,c.z+.5)));
      mesh.instanceMatrix.needsUpdate = true; mesh.name = 'ruins-supply-rack';
      this.supplyMeshes.set(room.id!,mesh); this.group.add(mesh);
    }

    const panelCells = new Set(foundryPanels(data).flatMap(p => p.cells.map(c => `${c.x},${c.z}`)));
    for (const panel of foundryPanels(data).filter(p => !p.broken)) {
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.95,2,.95), new THREE.MeshLambertMaterial({color:0xc78f56}),panel.cells.length);
      const matrix = new THREE.Matrix4();
      panel.cells.forEach((c,i)=>mesh.setMatrixAt(i,matrix.makeTranslation(c.x+.5,1,c.z+.5)));
      mesh.instanceMatrix.needsUpdate=true; mesh.name='cracked-panel';
      const cracks: THREE.Vector3[]=[];
      for(const c of panel.cells) for(const side of [-1,1]) {
        const x=c.x+.5+side*.481;
        const points=[new THREE.Vector3(x,.2,c.z+.2),new THREE.Vector3(x,.8,c.z+.6),new THREE.Vector3(x,1.2,c.z+.35),new THREE.Vector3(x,1.8,c.z+.8)];
        for(let i=0;i<points.length-1;i++) cracks.push(points[i],points[i+1]);
      }
      mesh.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(cracks),new THREE.LineBasicMaterial({color:0x392219})));
      this.panelMeshes.set(panel.id,mesh); this.group.add(mesh);
    }
    const wallCells: { x: number; z: number }[] = [];
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const kind = data.grid[z][x];
        if (kind === BlockKind.Wall || kind === BlockKind.Obstacle) {
          if (!panelCells.has(`${x},${z}`) && !supplyCells.has(`${x},${z}`)) wallCells.push({ x, z });
        }
      }
    }

    if (wallCells.length > 0) {
      const wallDef = getBlock(theme.wallType);
      const wallTexture = (getChapterTexture(data.floor, 'wall') ?? wallDef.texture).clone();
      wallTexture.repeat.set(1, 1);
      wallTexture.needsUpdate = true;
      const wallMaterial = new THREE.MeshLambertMaterial({ map: wallTexture, color: data.theme.id === 'sanctum' ? 0xaaa38e : 0xffffff });
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
      const center = roomCenter(room);
      marker.position.set(center.x,.03,center.z);
      this.group.add(marker);
      if(room.template==='overload-trial') {
        const device=new THREE.Mesh(new THREE.OctahedronGeometry(.55),new THREE.MeshLambertMaterial({color:0xffba58,emissive:0x6b3d11}));
        device.position.set(center.x,.8,center.z);device.name='optional-overload-device';this.group.add(device);
      }
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

  /** Synchronizes visible doors and the collision/raycast barrier registry. */
  setEncounterBarriers(roomIds: Iterable<string>): void {
    if (!this.floorData) return;
    this.removeEncounterBarrierMesh();
    const barriers = setEncounterBarrierRooms(this.floorData, roomIds);
    if (barriers.length === 0) return;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({
      color: 0x65d9ff,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, barriers.length);
    mesh.name = 'encounter-barriers';
    const matrix = new THREE.Matrix4();
    barriers.forEach((barrier, index) => {
      matrix.compose(
        new THREE.Vector3(
          (barrier.minX + barrier.maxX) / 2,
          ENCOUNTER_BARRIER_HEIGHT / 2,
          (barrier.minZ + barrier.maxZ) / 2,
        ),
        new THREE.Quaternion(),
        new THREE.Vector3(
          barrier.maxX - barrier.minX,
          ENCOUNTER_BARRIER_HEIGHT,
          barrier.maxZ - barrier.minZ,
        ),
      );
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.renderOrder = 2;
    this.encounterBarrierMesh = mesh;
    this.group.add(mesh);
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
    if (this.encounterBarrierMesh) {
      const material = this.encounterBarrierMesh.material as THREE.MeshBasicMaterial;
      material.opacity = 0.5 + Math.sin(elapsed * 4) * 0.1;
    }
    this.group.children.forEach((child) => {
      if (child.name === 'chest') {
        child.rotation.y += dt * 0.8;
      }
    });
  }

  breakPanel(x: number, z: number): boolean {
    if (!this.floorData) return false;
    const panel=breakFoundryPanel(this.floorData,x,z);
    if (!panel) return false;
    const mesh=this.panelMeshes.get(panel.id);
    if(mesh) { mesh.removeFromParent(); mesh.children.forEach(child=>{if(child instanceof THREE.LineSegments){child.geometry.dispose();(child.material as THREE.Material).dispose();}}); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); this.panelMeshes.delete(panel.id); }
    return true;
  }

  /** Opening is idempotent and updates collision, flow fields and its separate rack mesh. */
  openRuinsSupply(roomId: string): boolean {
    if (!this.floorData) return false;
    const room = this.floorData.rooms.find(r => r.id === roomId && r.template === 'ruins-supply');
    if (!room) return false;
    for (const c of ruinsSupplyCells(room)) this.floorData.grid[c.z][c.x] = BlockKind.Floor;
    const mesh = this.supplyMeshes.get(roomId);
    if (mesh) { mesh.removeFromParent(); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); this.supplyMeshes.delete(roomId); }
    invalidateNavigation(this.floorData);
    return true;
  }

  private clear(): void {
    this.panelMeshes.clear();
    this.supplyMeshes.clear();
    if (this.floorData) clearEncounterBarriers(this.floorData);
    this.encounterBarrierMesh = null;
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      if (child.name === 'chapter-landmarks') child.traverse(part => {
        if (part instanceof THREE.Mesh) { part.geometry.dispose(); const materials = Array.isArray(part.material) ? part.material : [part.material]; materials.forEach(m => m.dispose()); }
      });
      if(child.name === 'cracked-panel') child.children.forEach(line=>{if(line instanceof THREE.LineSegments){line.geometry.dispose();(line.material as THREE.Material).dispose();}});
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

  private removeEncounterBarrierMesh(): void {
    if (!this.encounterBarrierMesh) return;
    this.group.remove(this.encounterBarrierMesh);
    this.encounterBarrierMesh.geometry.dispose();
    const materials = Array.isArray(this.encounterBarrierMesh.material)
      ? this.encounterBarrierMesh.material : [this.encounterBarrierMesh.material];
    materials.forEach(material => material.dispose());
    this.encounterBarrierMesh = null;
  }
}
