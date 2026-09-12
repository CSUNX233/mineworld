import * as THREE from 'three';
import { loadImage } from '../core/AssetLoading';

type Surface = 'floor' | 'wall';
const textures = new Map<string, THREE.Texture>();
const pending = new Map<string, Promise<void>>();
const chapter = (floor: number): string | null => floor >= 1 && floor <= 5 ? 'ruins' : floor >= 6 && floor <= 10 ? 'foundry' : null;

/** Load only the current chapter, before the loading screen releases the scene. */
export async function preloadChapterTextures(floor: number): Promise<void> {
  const id = chapter(floor);
  if (!id) return;
  await Promise.all((['floor', 'wall'] as const).map(surface => {
    const key = `${id}-${surface}`;
    if (textures.has(key)) return Promise.resolve();
    if (!pending.has(key)) {
      pending.set(key, loadImage(`${import.meta.env.BASE_URL}assets/world/chapters/${key}.webp`).then(image => {
        const texture = new THREE.Texture(image);
        texture.needsUpdate = true;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestMipmapLinearFilter;
        // Mirrored edges stay continuous even when generated tiles do not match exactly.
        texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
        textures.set(key, texture);
      }).finally(() => { pending.delete(key); }));
    }
    return pending.get(key)!;
  }));
}

/** Callers clone cached maps so disposing a floor never disposes the shared asset. */
export function getChapterTexture(floor: number, surface: Surface): THREE.Texture | undefined {
  const id = chapter(floor);
  return id ? textures.get(`${id}-${surface}`) : undefined;
}
