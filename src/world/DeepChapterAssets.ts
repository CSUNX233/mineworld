import * as THREE from 'three';
import { loadImage } from '../core/AssetLoading';
import { deepChapterStyle, type DeepChapter } from './DeepChapterStyle';
import { applySceneryCutaway } from './SceneryCutaway';

export interface DeepKit {
  geometries: Map<string, THREE.BufferGeometry>;
  material: THREE.MeshPhongMaterial;
}
const kits = new Map<DeepChapter, DeepKit>();
const pending = new Map<DeepChapter, Promise<void>>();

export async function preloadDeepChapterKit(floor: number): Promise<void> {
  const profile = deepChapterStyle(floor);
  if (!profile || kits.has(profile.chapter)) return;
  const id = profile.chapter;
  if (!pending.has(id)) pending.set(id, (async () => {
    const base = `${import.meta.env.BASE_URL}assets/world/${id}-kit/`;
    const [{ GLTFLoader }, image] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), loadImage(`${base}atlas.png`)]);
    let bytes: ArrayBuffer | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(`${base}kit.glb`, { signal: controller.signal });
        if (!response.ok) throw new Error(`${id} model: HTTP ${response.status}`);
        bytes = await response.arrayBuffer(); break;
      } catch (error) { if (attempt === 2) throw error; }
      finally { clearTimeout(timer); }
    }
    const gltf = await new GLTFLoader().parseAsync(bytes!, '');
    gltf.scene.updateMatrixWorld(true);
    const geometries = new Map<string, THREE.BufferGeometry>(), oldMaterials = new Set<THREE.Material>();
    gltf.scene.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      geometries.set(node.name, node.geometry.clone().applyMatrix4(node.matrixWorld));
      node.geometry.dispose();
      for (const m of Array.isArray(node.material) ? node.material : [node.material]) oldMaterials.add(m);
    });
    oldMaterials.forEach(m => m.dispose());
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false;
    texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.needsUpdate = true;
    // Atlas lower-left is metal. Stone/cloth keep a very weak, broad highlight.
    const specular = new THREE.DataTexture(new Uint8Array([12,12,12,255, 10,10,10,255, 210,210,210,255, 6,6,6,255]),2,2);
    specular.magFilter=specular.minFilter=THREE.NearestFilter;specular.needsUpdate=true;
    const material = new THREE.MeshPhongMaterial({ map: texture, vertexColors: true, specularMap: specular, specular:0xbdb8a5, shininess:28 });
    applySceneryCutaway(material); kits.set(id, { geometries, material });
  })().finally(() => pending.delete(id)));
  await pending.get(id);
}

export function deepChapterKit(floor: number): DeepKit | undefined {
  const profile = deepChapterStyle(floor); return profile ? kits.get(profile.chapter) : undefined;
}

/** Owned clone for legacy breakable/ritual lifecycles, which dispose their resources. */
export function createDeepChapterProp(floor: number, name: string): THREE.Mesh | null {
  const kit = deepChapterKit(floor), geometry = kit?.geometries.get(name);
  if (!kit || !geometry) return null;
  const material = kit.material.clone(); material.map = kit.material.map?.clone() ?? null;
  material.color.setHex(deepChapterStyle(floor)!.tint);
  const mesh = new THREE.Mesh(geometry.clone(), material); mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true; return mesh;
}
