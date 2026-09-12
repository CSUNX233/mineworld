import { trackedTexture } from '../core/AssetLoading';
import * as THREE from 'three';

export const combatArtUrl = (group: string, name: string): string =>
  `${import.meta.env.BASE_URL}assets/ui/sunlit/p0/${group}/${name}.webp`;
const textures = new Map<string, THREE.Texture>();
const lastVariant = new Map<string, number>();
export function effectTexture(name: string): THREE.Texture {
  if (name !== 'slash' && name !== 'impact') return combatTexture('effects', name);
  const previous = lastVariant.get(name) ?? 0;
  const next = previous === 0 ? 1 + Math.floor(Math.random() * 3) : (previous + Math.floor(Math.random() * 2)) % 3 + 1;
  lastVariant.set(name, next);
  const variant = combatTexture('effects', `${name}-${next}`);
  return variant.image ? variant : combatTexture('effects', name);
}
export function preloadCombatArt(): void {
  for (const name of ['slash', 'impact']) for (let i = 1; i <= 3; i++) combatTexture('effects', `${name}-${i}`);
  for (const name of ['slash','impact','fire','ice','lightning','smoke','shockwave','shadow']) combatTexture('effects', name);
  for (const name of ['circle','cone','lane','landing','target','elite']) combatTexture('telegraphs', name);
  for (const name of ['burning','frozen','shocked','poisoned']) combatTexture('statuses', name);
}
export function combatTexture(group: string, name: string): THREE.Texture {
  const key = `${group}/${name}`;
  let texture = textures.get(key);
  if (!texture) {
    texture = trackedTexture(combatArtUrl(group, name));
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.set(key, texture);
  }
  return texture;
}

/** Decoration lies inside the exact geometry; it never defines the hit boundary. */
export function decorateTelegraph(mesh: THREE.Mesh, name: string, width: number, height = width, angle = 0): void {
  const art = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({
    map: combatTexture('telegraphs', name), transparent: true, opacity: .9,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false, alphaTest: .08,
  }));
  art.position.z = .015;
  art.rotation.z = angle;
  mesh.add(art);
}

export function disposeTelegraphArt(mesh: THREE.Object3D): void {
  for (const child of [...mesh.children]) {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => material.dispose());
    }
    mesh.remove(child);
  }
}
