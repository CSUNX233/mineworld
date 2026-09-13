import * as THREE from 'three';
import { loadImage } from '../core/AssetLoading';
import { BlockKind } from './Block';
import type { FloorData } from '../types';

const geometryCache = new Map<string, THREE.BufferGeometry>();
let material: THREE.MeshLambertMaterial | null = null;
let pending: Promise<void> | null = null;
const hinge = new THREE.Vector3(0, .52, -.4);
const paletteMaterials = new Map<string, THREE.MeshLambertMaterial>();
const openAngle = -105 * Math.PI / 180;

/** Shared across chapters, awaited by the existing foreground loading gate. */
export async function preloadInteractionProps(): Promise<void> {
  if (material) return;
  if (!pending) pending = (async () => {
    const base = `${import.meta.env.BASE_URL}assets/world/interaction-props/`;
    const [{ GLTFLoader }, image] = await Promise.all([
      import('three/addons/loaders/GLTFLoader.js'), loadImage(`${base}pixel-palette.png`),
    ]);
    let bytes: ArrayBuffer | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(`${base}interaction-props.glb`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Interaction props: HTTP ${response.status}`);
        bytes = await response.arrayBuffer();
        break;
      } catch (error) { if (attempt === 2) throw error; }
      finally { clearTimeout(timer); }
    }
    const gltf = await new GLTFLoader().parseAsync(bytes!, '');
    const oldMaterials = new Set<THREE.Material>();
    const loaded = new Map<string, THREE.BufferGeometry>();
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld);
      if (node.name === 'chest_lid') geometry.translate(-hinge.x, -hinge.y, -hinge.z);
      loaded.set(node.name, geometry);
      node.geometry.dispose();
      for (const m of Array.isArray(node.material) ? node.material : [node.material]) oldMaterials.add(m);
    });
    oldMaterials.forEach(m => m.dispose());
    const required = ['chest_body', 'chest_lid', 'rack_frame', 'rack_supplies', 'merchant_stall', 'supply_crate'];
    if (required.some(name => !loaded.has(name))) {
      loaded.forEach(g => g.dispose());
      throw new Error('Interaction prop kit is incomplete');
    }
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false;
    texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
    material = new THREE.MeshLambertMaterial({ map: texture });
    loaded.forEach((g, name) => geometryCache.set(name, g));
  })().catch(error => { pending = null; throw error; });
  await pending;
}

/** Borrowed GPU resources: callers dispose instance buffers only, never these assets. */
export function interactionModule(name: string, floor = 1): { geometry: THREE.BufferGeometry; material: THREE.MeshLambertMaterial } | null {
  const geometry = geometryCache.get(name);
  return geometry && material ? { geometry, material: chapterPropMaterial(floor) } : null;
}

/** One palette shader per chapter; same geometry, texture and chest animation. */
function chapterPropMaterial(floor: number): THREE.MeshLambertMaterial {
  const id = floor >= 6 && floor <= 10 ? 'foundry' : floor >= 11 && floor <= 15 ? 'sanctum' : '';
  if (!id) return material!;
  let themed = paletteMaterials.get(id);
  if (!themed) {
    themed = material!.clone();
    const colors = (id === 'foundry' ? [0x8b6546, 0xb67b4e, 0x3e5366, 0x43382e] : [0xaba48a, 0xa58c55, 0x3d6257, 0x424f47])
      .map(c => new THREE.Color(c).toArray().map(v => v.toFixed(5)).join(','));
    themed.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        #ifdef USE_MAP
          float propTile = floor(vMapUv.x * 4.0) + (1.0 - floor(vMapUv.y * 2.0)) * 4.0;
          if (propTile < 4.0) {
            vec3 paletteColor = propTile < 0.5 ? vec3(${colors[0]}) : propTile < 1.5 ? vec3(${colors[1]}) : propTile < 2.5 ? vec3(${colors[2]}) : vec3(${colors[3]});
            float referenceLuma = propTile < .5 ? .15 : propTile < 1.5 ? .24 : propTile < 2.5 ? .035 : .033;
            float brightness = clamp(dot(diffuseColor.rgb, vec3(.2126,.7152,.0722)) / referenceLuma, .7, 1.35);
            diffuseColor.rgb = paletteColor * brightness;
          }
        #endif`);
    };
    themed.customProgramCacheKey = () => `interaction-palette-${id}`;
    paletteMaterials.set(id, themed);
  }
  return themed;
}

function mesh(name: string, floor = 1): THREE.Mesh {
  const module = interactionModule(name, floor);
  if (!module) throw new Error(`Interaction prop not preloaded: ${name}`);
  const result = new THREE.Mesh(module.geometry, module.material);
  result.name = name; result.castShadow = result.receiveShadow = true;
  return result;
}

export function createChest(floor = 1): THREE.Group {
  const group = new THREE.Group(); group.name = 'chest'; group.userData.interactionProp = true;
  group.add(mesh('chest_body', floor));
  const lid = mesh('chest_lid', floor); lid.position.copy(hinge); group.add(lid);
  group.userData.lid = lid; group.userData.openProgress = 0;
  return group;
}

export function openChestVisual(chest: THREE.Object3D, immediate = false): void {
  chest.userData.opened = true;
  if (immediate) { chest.userData.openProgress = 1; (chest.userData.lid as THREE.Mesh).rotation.x = openAngle; }
}

export function updateChestVisual(chest: THREE.Object3D, dt: number): void {
  if (!chest.userData.opened || chest.userData.openProgress >= 1) return;
  const t = Math.min(1, chest.userData.openProgress + Math.max(0, dt) / .45);
  chest.userData.openProgress = t;
  (chest.userData.lid as THREE.Mesh).rotation.x = openAngle * (1 - (1 - t) ** 3);
}

/** Orient toward room centre; shrink only when the real occupied grid demands it. */
export function fitInteractionProp(object: THREE.Object3D, data: FloorData, x: number, z: number, preferredScale: number): void {
  object.position.set(x + .5, 0, z + .5);
  const room = data.rooms.find(r => x >= r.x && x < r.x + r.width && z >= r.z && z < r.z + r.depth);
  const angle = room ? Math.atan2(room.x + room.width / 2 - x - .5, room.z + room.depth / 2 - z - .5) : 0;
  const facing = Math.round(angle / (Math.PI / 2)) * Math.PI / 2;
  for (let scale = preferredScale; scale >= .25; scale -= .05) {
    for (const offset of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      object.rotation.y = facing + offset; object.scale.setScalar(scale); object.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(object);
      const lid = object.userData.lid as THREE.Mesh | undefined;
      if (lid) {
        const closedAngle = lid.rotation.x;
        // Reserve the lid's swept volume as well as the closed chest footprint.
        for (const tilt of [-Math.PI / 4, -Math.PI / 2, openAngle]) {
          lid.rotation.x = tilt; object.updateMatrixWorld(true);
          bounds.union(new THREE.Box3().setFromObject(object));
        }
        lid.rotation.x = closedAngle; object.updateMatrixWorld(true);
      }
      let clear = true;
      for (let cz = Math.floor(bounds.min.z); cz <= Math.floor(bounds.max.z); cz++) {
        for (let cx = Math.floor(bounds.min.x); cx <= Math.floor(bounds.max.x); cx++) {
          const cell = data.grid[cz]?.[cx];
          if (cell === undefined || cell === BlockKind.Wall || cell === BlockKind.Obstacle) clear = false;
        }
      }
      if (clear) return;
    }
  }
  // Valid chest/merchant cells are walkable; this footprint always stays in that cell.
  object.rotation.y = facing; object.scale.setScalar(.25);
}

export function createMerchantProp(floor = 1): THREE.Mesh { return mesh('merchant_stall', floor); }

export function createSupplyRack(cells: {x: number; z: number}[], floor = 1): THREE.Group {
  const group = new THREE.Group(); group.name = 'ruins-supply-rack'; group.userData.interactionProp = true;
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const scale = new THREE.Vector3(.67, .67, .67), matrix = new THREE.Matrix4();
  for (const name of ['rack_frame', 'rack_supplies']) {
    const module = interactionModule(name, floor);
    if (!module) throw new Error(`Interaction prop not preloaded: ${name}`);
    const instances = new THREE.InstancedMesh(module.geometry, module.material, cells.length);
    cells.forEach((c, i) => instances.setMatrixAt(i, matrix.compose(new THREE.Vector3(c.x + .5, 0, c.z + .5), rotation, scale)));
    instances.instanceMatrix.needsUpdate = true; instances.computeBoundingSphere();
    instances.castShadow = instances.receiveShadow = true; group.add(instances);
  }
  return group;
}

export function disposeInteractionProp(object: THREE.Object3D): void {
  object.traverse(child => { if (child instanceof THREE.InstancedMesh) child.dispose(); });
}
