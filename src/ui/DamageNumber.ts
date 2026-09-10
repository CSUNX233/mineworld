import { pixelText } from './PixelNumbers';
import * as THREE from 'three';

interface Entry {
  element: HTMLDivElement;
  worldPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
}

export class DamageNumberSystem {
  private entries: Entry[] = [];

  constructor(private root: HTMLElement, private camera: THREE.PerspectiveCamera) {}

  spawn(
    worldPosition: THREE.Vector3,
    text: string,
    color: string,
    crit = false,
    scale = 1,
  ): void {
    const element = document.createElement('div');
    element.className = 'damage-number';
    element.appendChild(pixelText(text, 'damage'));
    element.style.color = color;
    element.style.fontSize = `${Math.round((crit ? 28 : 19) * scale)}px`;
    if (crit) {
      element.style.textShadow = '0 0 8px #fff, 0 2px 4px #000';
    }
    this.root.appendChild(element);
    this.entries.push({
      element,
      worldPosition: worldPosition.clone(),
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.8, 1.5 + Math.random() * 0.7, (Math.random() - 0.5) * 0.8),
      life: crit ? 1.15 : 0.85,
    });
  }

  update(dt: number): void {
    const rendererSize = new THREE.Vector2(window.innerWidth, window.innerHeight);
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      entry.life -= dt;
      entry.worldPosition.add(entry.velocity.clone().multiplyScalar(dt));
      entry.velocity.y += 1.2 * dt;

      const projected = entry.worldPosition.clone().project(this.camera);
      const visible = projected.z < 1 && projected.z > -1;
      if (!visible || entry.life <= 0) {
        entry.element.remove();
        this.entries.splice(i, 1);
        continue;
      }
      const x = (projected.x * 0.5 + 0.5) * rendererSize.x;
      const y = (-projected.y * 0.5 + 0.5) * rendererSize.y;
      entry.element.style.left = `${x}px`;
      entry.element.style.top = `${y}px`;
      entry.element.style.opacity = String(Math.max(0, Math.min(1, entry.life * 1.6)));
    }
  }

  clear(): void {
    this.entries.forEach((entry) => entry.element.remove());
    this.entries = [];
  }
}
