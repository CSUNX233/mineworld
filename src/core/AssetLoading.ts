import * as THREE from 'three';
import { equipmentArtPath, type ItemArtSource } from '../ui/EquipmentArt';
import { P4_ICON_IDS } from '../ui/P4Icons';

const images = new Map<string, Promise<HTMLImageElement>>();
const textures = new Map<THREE.Texture, { url: string; ready: Promise<void>; uploaded: WeakSet<THREE.WebGLRenderer> }>();
let foregroundLoads = 0;
const trackedRenderers = new WeakSet<THREE.WebGLRenderer>();

/** Decode before reporting readiness; failed requests are evicted so retry can recover. */
function loadImage(url: string, background = false, timeout = 30000): Promise<HTMLImageElement> {
  const cached = images.get(url);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.fetchPriority = background ? 'low' : 'high';
    const timer = setTimeout(() => finish(new Error(`Image timeout: ${url}`)), timeout);
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
  textures.set(texture, { url, ready, uploaded: new WeakSet() });
  texture.addEventListener('dispose', () => textures.delete(texture));
  void ready.catch(() => {}); // The loading gate reports errors, including startup requests.
  return texture;
}

export async function prepareTrackedTextures(renderer: THREE.WebGLRenderer): Promise<void> {
  if (!trackedRenderers.has(renderer)) {
    trackedRenderers.add(renderer);
    renderer.domElement.addEventListener('webglcontextrestored', () => {
      for (const entry of textures.values()) entry.uploaded.delete(renderer);
    });
  }
  await Promise.all([...textures].map(async ([texture, entry]) => {
    if (entry.uploaded.has(renderer)) return;
    await entry.ready.catch(() => {
      entry.ready = fillTexture(texture, entry.url);
      return entry.ready;
    });
    if (textures.has(texture)) {
      renderer.initTexture(texture);
      entry.uploaded.add(renderer);
    }
  }));
}

// Vite supplies the inventory, including future skill/equipment artwork. No original art sheets.
const uiPaths = Object.keys(import.meta.glob('/public/assets/ui/sunlit/**/*.webp', { query: '?url', import: 'default' }))
  .map(path => `${import.meta.env.BASE_URL}${path.replace('/public/', '')}`);

const assetUrl = (path: string): string => `${import.meta.env.BASE_URL}${path}`;
const essentialUiPaths = [
  'frame-navy', 'panel-parchment', 'icons-atlas', 'close', 'bar-track-frame',
  'bar-track-base', 'health', 'mana', 'experience', 'shield', 'bag-transparent', 'loading-camp',
].map(name => assetUrl(`assets/ui/sunlit/${name}.webp`));
for (const style of ['quantity', 'damage']) for (let digit = 0; digit < 10; digit++)
  essentialUiPaths.push(assetUrl(`assets/ui/sunlit/numerals/${style}/${digit}.webp`));
for (const name of ['attack-2', 'aim-thumb'])
  essentialUiPaths.push(assetUrl(`assets/ui/sunlit/attack/${name}.webp`));
for (const name of ['pause', 'view_toggle'])
  essentialUiPaths.push(assetUrl(`assets/ui/sunlit/p4/${name}.webp`));

export interface GameImageOptions {
  items?: Iterable<ItemArtSource>;
  /** Skill IDs or UI icon IDs currently visible in the HUD. */
  iconIds?: Iterable<string>;
}

const skillAliases: Record<string, string> = { frost_nova: 'frost', lightning_chain: 'lightning' };

/** Only common UI and artwork in the current loadout belongs in the entry gate. */
export async function preloadGameImages(onProgress: (done: number, total: number) => void, options: GameImageOptions = {}): Promise<void> {
  const visible = new Set(essentialUiPaths);
  for (const item of options.items ?? []) {
    const path = equipmentArtPath(item);
    if (path) visible.add(assetUrl(path));
  }
  for (const id of options.iconIds ?? []) {
    const name = skillAliases[id] ?? id;
    if (P4_ICON_IDS.has(id)) visible.add(assetUrl(`assets/ui/sunlit/p4/${id}.webp`));
    else if (['whirlwind', 'dash', 'fireball', 'detonate', 'frost', 'lightning'].includes(name))
      visible.add(assetUrl(`assets/ui/sunlit/skills/${name}.webp`));
  }
  const paths = [...visible];
  let next = 0;
  let done = 0;
  let requiredError: unknown;
  foregroundLoads++;
  try {
    onProgress(0, paths.length);
    await Promise.all(Array.from({ length: Math.min(6, paths.length) }, async () => {
      while (next < paths.length) {
        const url = paths[next++];
        // Every currently visible image is ready before play; unused background art is optional.
        await loadImage(url).catch(error => { requiredError ??= error; });
        onProgress(++done, paths.length);
      }
    }));
    if (requiredError) throw requiredError;
  } finally {
    foregroundLoads--;
  }
}

let backgroundPreload: Promise<void> | undefined;
function idle(): Promise<void> {
  return new Promise(resolve => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(() => resolve(), { timeout: 2000 });
    else setTimeout(resolve, 100);
  });
}

/** Call after the scene is released. One low-priority request at a time leaves gameplay bandwidth free. */
export function preloadRemainingGameImages(): void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (backgroundPreload || connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '')) return;
  backgroundPreload = (async () => {
    for (const url of uiPaths) {
      if (images.has(url)) continue;
      do { await idle(); } while (foregroundLoads > 0 || document.hidden);
      if (images.has(url)) continue;
      await loadImage(url, true, 8000).catch(() => {});
    }
  })().catch(() => {}).finally(() => { backgroundPreload = undefined; });
}
