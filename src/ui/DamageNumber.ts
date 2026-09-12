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
  private pool: HTMLDivElement[] = [];
  private projected = new THREE.Vector3();

  constructor(private root: HTMLElement, private camera: THREE.PerspectiveCamera) {}

  spawn(
    worldPosition: THREE.Vector3,
    text: string,
    color: string,
    crit = false,
    scale = 1,
  ): void {
    const element = this.pool.pop() ?? document.createElement('div');
    element.className = crit ? 'damage-number damage-critical' : 'damage-number';
    element.replaceChildren(pixelText(text, 'damage'));
    element.style.cssText = 'left:0;top:0;';
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
    const width = window.innerWidth, height = window.innerHeight;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      entry.life -= dt;
      entry.worldPosition.addScaledVector(entry.velocity, dt);
      entry.velocity.y += 1.2 * dt;

      const projected = this.projected.copy(entry.worldPosition).project(this.camera);
      const visible = projected.z < 1 && projected.z > -1;
      if (!visible || entry.life <= 0) {
        entry.element.remove();
        if (this.pool.length < 128) this.pool.push(entry.element);
        this.entries.splice(i, 1);
        continue;
      }
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      entry.element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      entry.element.style.opacity = String(Math.max(0, Math.min(1, entry.life * 1.6)));
    }
  }

  clear(): void {
    this.entries.forEach((entry) => entry.element.remove());
    this.entries = [];
    this.pool = [];
  }
}
