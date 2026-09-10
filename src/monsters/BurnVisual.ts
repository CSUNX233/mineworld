import * as THREE from 'three';

/** Fixed, reusable particles and a billboard; no objects allocated per fire tick. */
export class BurnVisual {
  private readonly flames = new THREE.Group();
  private readonly particles: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly canvas = document.createElement('canvas');
  private readonly texture: THREE.CanvasTexture;
  private readonly label: THREE.Sprite;
  private clock = 0;
  private interval = 0;
  private pendingDamage = 0;
  private labelTime = 0;
  private lastText = '';

  constructor(parent: THREE.Group) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 8; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: i % 2 ? 0xff6a16 : 0xffd05a,
        transparent: true, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      this.particles.push(mesh);
      this.flames.add(mesh);
    }
    this.canvas.width = 256;
    this.canvas.height = 64;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.texture, transparent: true, depthTest: true, depthWrite: false,
    }));
    this.label.userData.ownsTexture = true;
    this.label.scale.set(1.8, .45, 1);
    this.flames.visible = this.label.visible = false;
    parent.add(this.flames, this.label);
  }

  update(dt: number, burning: boolean, damage: number, dead: boolean, headHeight: number): void {
    this.clock += dt;
    this.interval += dt;
    this.labelTime = Math.max(0, this.labelTime - dt);
    this.pendingDamage += damage;
    if (this.pendingDamage > 0 && (this.interval >= .5 || !burning || dead)) {
      const amount = this.pendingDamage < 1 ? this.pendingDamage.toFixed(1) : String(Math.round(this.pendingDamage));
      this.draw(`燃烧 −${amount}`);
      this.pendingDamage = 0;
      this.interval = 0;
      this.labelTime = .65;
    } else if (burning && this.labelTime <= 0) this.draw('燃烧中');
    this.label.visible = burning || this.labelTime > 0;
    this.label.position.set(0, headHeight + .75 + (this.labelTime > 0 ? (.65 - this.labelTime) * .3 : 0), 0);
    this.flames.visible = burning && !dead;
    if (!this.flames.visible) return;
    const height = Math.max(1, headHeight * .65);
    const width = headHeight > 3 ? .7 : .42;
    this.particles.forEach((particle, index) => {
      const phase = (this.clock * 1.3 + index / this.particles.length) % 1;
      const angle = index * 2.4 + this.clock * .4;
      particle.position.set(Math.cos(angle) * width, .15 + phase * height, Math.sin(angle) * width);
      particle.scale.set(.12 * (1 - phase) + .05, .3 * (1 - phase) + .08, .12);
      particle.rotation.z = Math.sin(this.clock * 5 + index) * .2;
      particle.material.opacity = (1 - phase) * .85;
    });
  }

  private draw(text: string): void {
    if (text === this.lastText) return;
    this.lastText = text;
    const context = this.canvas.getContext('2d')!;
    context.clearRect(0, 0, 256, 64);
    context.font = 'bold 32px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = 5;
    context.strokeStyle = '#29130b';
    context.strokeText(text, 128, 32);
    context.fillStyle = '#ffb347';
    context.fillText(text, 128, 32);
    this.texture.needsUpdate = true;
  }
}
