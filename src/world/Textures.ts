import * as THREE from 'three';

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = false;
  return texture;
}

function fillPixel(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

function noiseTexture(base: string, secondary: string, density = 0.22): THREE.CanvasTexture {
  return canvasTexture((ctx, size) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (Math.random() < density) fillPixel(ctx, x, y, secondary);
      }
    }
  });
}

function brickTexture(base: string, mortar: string): THREE.CanvasTexture {
  return canvasTexture((ctx, size) => {
    ctx.fillStyle = mortar;
    ctx.fillRect(0, 0, size, size);
    const brickH = 4;
    const brickW = 8;
    for (let y = 0; y < size; y += brickH) {
      const offset = (y / brickH) % 2 === 0 ? 0 : -4;
      for (let x = offset; x < size; x += brickW) {
        ctx.fillStyle = base;
        ctx.fillRect(x, y, brickW - 1, brickH - 1);
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(x, y, brickW - 1, 1);
      }
    }
  });
}

function grassTexture(): THREE.CanvasTexture {
  return canvasTexture((ctx, size) => {
    ctx.fillStyle = '#6f9b4a';
    ctx.fillRect(0, 0, size, size);
    const greens = ['#5a8438', '#82b55a', '#4e7830', '#95c96b'];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (Math.random() < 0.35) fillPixel(ctx, x, y, greens[(Math.random() * greens.length) | 0]);
      }
    }
  });
}

function dirtTexture(): THREE.CanvasTexture {
  return canvasTexture((ctx, size) => {
    ctx.fillStyle = '#79553a';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (Math.random() < 0.32) fillPixel(ctx, x, y, Math.random() > 0.5 ? '#5f402b' : '#8e6848');
      }
    }
  });
}

function stoneTexture(): THREE.CanvasTexture {
  return canvasTexture((ctx, size) => {
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        ctx.fillStyle = '#767676';
        ctx.fillRect(x, y, 4, 4);
        ctx.fillStyle = '#999999';
        ctx.fillRect(x + 1, y + 1, 2, 2);
      }
    }
    for (let i = 0; i < 24; i++) fillPixel(ctx, (Math.random() * size) | 0, (Math.random() * size) | 0, '#6b6b6b');
  });
}

function lavaTexture(): THREE.CanvasTexture {
  return canvasTexture((ctx, size) => {
    ctx.fillStyle = '#1c0c07';
    ctx.fillRect(0, 0, size, size);
    const colors = ['#ff5a00', '#ff9c00', '#d62800', '#fff17a'];
    for (let i = 0; i < 54; i++) {
      const x = (Math.random() * size) | 0;
      const y = (Math.random() * size) | 0;
      fillPixel(ctx, x, y, colors[(Math.random() * colors.length) | 0]);
    }
  });
}

function glowTexture(base: string, glow: string): THREE.CanvasTexture {
  return canvasTexture((ctx, size) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.abs(x - size / 2) + Math.abs(y - size / 2);
        if (d < size / 2) fillPixel(ctx, x, y, glow);
      }
    }
  });
}

const cache = new Map<string, THREE.Texture>();

function configureTexture(texture: THREE.Texture): THREE.Texture {
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function get(key: string, url: string | null, make: () => THREE.Texture): THREE.Texture {
  const cached = cache.get(key);
  if (cached) return cached;

  const fallback = make();
  if (!url) {
    cache.set(key, fallback);
    return fallback;
  }

  const texture = configureTexture(new THREE.Texture());
  texture.image = fallback.image;
  texture.needsUpdate = true;
  cache.set(key, texture);

  const image = new Image();
  image.onload = () => {
    texture.image = image;
    texture.needsUpdate = true;
  };
  image.onerror = () => {
    const fallback = make();
    texture.image = fallback.image;
    texture.needsUpdate = true;
  };
  image.src = url;
  return texture;
}

export const BlockTextures = {
  grass: get('grass', '/textures/floor_ground_grass.png', grassTexture),
  dirt: get('dirt', '/textures/floor_ground_dirt.png', dirtTexture),
  stone: get('stone', '/textures/wall_stone.png', stoneTexture),
  brick: get('brick', '/textures/wall_brick_stone_center.png', () => brickTexture('#75504a', '#3d3d43')),
  dungeon: get('dungeon', '/textures/wall_brick_small_stone_depth.png', () => brickTexture('#3e5961', '#202a30')),
  mossy: get('mossy', '/textures/floor_ground_grass_overlay.png', () => noiseTexture('#586d55', '#7a9560', 0.34)),
  darkstone: get('darkstone', '/textures/wall_rock.png', () => brickTexture('#34343c', '#181820')),
  lavafloor: get('lavafloor', '/textures/floor_tiles_blue_large.png', lavaTexture),
  lava: get('lava', null, lavaTexture),
  void: get('void', '/textures/wall_timber.png', () => brickTexture('#2d1f4d', '#0d0a17')),
  voidfloor: get('voidfloor', null, () => noiseTexture('#241b3a', '#4c3b75', 0.28)),
  glow: get('glow', null, () => glowTexture('#271a43', '#b56bff')),
  portal: get('portal', null, () => glowTexture('#4a1e8e', '#d7a8ff')),
};
