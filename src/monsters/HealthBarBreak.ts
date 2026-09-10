import * as THREE from 'three';

const FLASH_TIME = 0.055;
const FALL_TIME = 0.38;
const MAX_FRAGMENTS = 12;
const FILL_WIDTH = 0.93;
const FILL_HEIGHT = 0.65;

interface Fragment {
  sprite: THREE.Sprite;
  age: number;
  width: number;
  midpoint: number;
  drift: number;
}

/** Billboard-space chips: turning the monster must not rotate the lost HP segment. */
export class HealthBarBreak {
  private fragments: Fragment[] = [];

  constructor(private readonly bar: THREE.Sprite) {}

  spawn(before: number, after: number): void {
    const width = (before - after) * FILL_WIDTH;
    if (width <= 0) return;
    if (this.fragments.length >= MAX_FRAGMENTS) this.remove(0);
    const material = new THREE.SpriteMaterial({
      color: 0xffffff, transparent: true, depthTest: false,
      depthWrite: false, toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(width, FILL_HEIGHT, 1);
    sprite.renderOrder = 12;
    // Sprite.center positions the chip along camera-right even under a rotated parent.
    const midpoint = -FILL_WIDTH / 2 + (before + after) * FILL_WIDTH / 2;
    sprite.center.set(0.5 - midpoint / width, 0.5);
    this.bar.add(sprite);
    this.fragments.push({ sprite, width, midpoint, age: 0,
      drift: (Math.random() - 0.35) * 0.25 });
  }

  update(dt: number): void {
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const chip = this.fragments[i];
      chip.age += dt;
      const t = chip.age - FLASH_TIME;
      if (t >= FALL_TIME) { this.remove(i); continue; }
      if (t <= 0) continue;
      const progress = t / FALL_TIME;
      // A tiny upward kick, then a sharp fall. Quantized travel keeps the pixel feel.
      const x = chip.midpoint + Math.round(chip.drift * t * 160) / 160;
      const y = Math.round((0.8 * t - 24 * t * t) * 24) / 24;
      chip.sprite.center.set(0.5 - x / chip.width, 0.5 - y / FILL_HEIGHT);
      // Avoid rotating around an off-center billboard pivot: shear-free block fragments.
      chip.sprite.material.opacity = 1 - Math.max(0, (progress - 0.55) / 0.45);
      chip.sprite.material.color.setHex(progress < 0.3 ? 0xffffff : 0xe8efff);
    }
  }

  private remove(index: number): void {
    const [{ sprite }] = this.fragments.splice(index, 1);
    sprite.removeFromParent();
    sprite.material.dispose();
  }
}
