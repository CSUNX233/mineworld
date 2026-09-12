import * as THREE from 'three';

const images = new Map<string, Promise<HTMLImageElement>>();
const textures = new Map<THREE.Texture, { url: string; ready: Promise<void> }>();

/** Decode before reporting readiness; failed requests are evicted so retry can recover. */
function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = images.get(url);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => finish(new Error(`Image timeout: ${url}`)), 30000);
    const finish = (error?: unknown) => {
      clearTimeout(timer);
      image.onload = image.onerror = null;
      if (error) reject(error);
      else resolve(image);
    };
    image.onload = () => image.decode().then(() => finish(), finish);
    image.onerror = () => finish(new Error(`Image failed: ${url}`));
    image.src = url;
  }).catch(error => { images.delete(url); throw error; });
  images.set(url, pending);
  return pending;
}

function fillTexture(texture: THREE.Texture, url: string): Promise<void> {
  return loadImage(url).then(image => { texture.image = image; texture.needsUpdate = true; });
}

/** Preserve synchronous material construction while tracking actual image readiness. */
export function trackedTexture(url: string): THREE.Texture {
  const texture = new THREE.Texture();
  const ready = fillTexture(texture, url);
  textures.set(texture, { url, ready });
  void ready.catch(() => {}); // The loading gate reports errors, including startup requests.
  return texture;
}

export async function prepareTrackedTextures(renderer: THREE.WebGLRenderer): Promise<void> {
  await Promise.all([...textures].map(async ([texture, entry]) => {
    await entry.ready.catch(() => {
      entry.ready = fillTexture(texture, entry.url);
      return entry.ready;
    });
    renderer.initTexture(texture);
  }));
}

// Vite supplies the inventory, including future skill/equipment artwork. No original art sheets.
const uiPaths = Object.keys(import.meta.glob('/public/assets/ui/sunlit/**/*.webp', { query: '?url', import: 'default' }))
  .map(path => `${import.meta.env.BASE_URL}${path.replace('/public/', '')}`);

export async function preloadGameImages(onProgress: (done: number, total: number) => void): Promise<void> {
  let next = 0;
  let done = 0;
  onProgress(0, uiPaths.length);
  await Promise.all(Array.from({ length: Math.min(6, uiPaths.length) }, async () => {
    while (next < uiPaths.length) {
      const url = uiPaths[next++];
      await loadImage(url).catch(() => loadImage(url));
      onProgress(++done, uiPaths.length);
    }
  }));
}
