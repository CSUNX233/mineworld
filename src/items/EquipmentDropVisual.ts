import { trackedTexture } from '../core/AssetLoading';
import * as THREE from 'three';
import type { Item, Rarity } from '../types';
import { equipmentArtPath } from '../ui/EquipmentArt';
import { indexOf, UI_RARITY_COLORS } from '../ui/UiAssets';
import { combatTexture } from '../ui/CombatArt';

export const DROP_STYLES: Record<Rarity, { height: number; width: number; pickupDelay: number; sparks: number }> = {
  common: { height: 1.2, width: .12, pickupDelay: .35, sparks: 4 },
  magic: { height: 1.8, width: .17, pickupDelay: .4, sparks: 6 },
  rare: { height: 2.5, width: .22, pickupDelay: .5, sparks: 9 },
  epic: { height: 3.3, width: .3, pickupDelay: .65, sparks: 13 },
  mythic: { height: 5.5, width: .52, pickupDelay: 1.2, sparks: 32 },
  legendary: { height: 4.5, width: .4, pickupDelay: 1, sparks: 22 },
};
const plane = new THREE.PlaneGeometry(1, 1);
const textures = new Map<string, THREE.Texture>();
const white = new THREE.Color(0xffffff);

function iconTexture(item: Item): THREE.Texture {
  const path = equipmentArtPath(item);
  const atlasIndex = indexOf(item.icon);
  const key = path ?? `atlas-${atlasIndex}`;
  let texture = textures.get(key);
  if (!texture) {
    texture = trackedTexture(`${import.meta.env.BASE_URL}${path ?? 'assets/ui/sunlit/icons-atlas.webp'}`);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    if (!path) {
      texture.repeat.set(1 / 6, 1 / 4);
      texture.offset.set((atlasIndex % 6) / 6, (3 - Math.floor(atlasIndex / 6)) / 4);
    }
    textures.set(key, texture);
  }
  return texture;
}

/** Scene-only equipment presentation. Owns per-drop materials, never the shared textures/plane. */
export class EquipmentDropVisual {
  readonly group = new THREE.Group();
  readonly pickupDelay: number;
  private icon: THREE.Sprite;
  private beams: THREE.Mesh[] = [];
  private ring: THREE.Mesh;
  private crown: THREE.Sprite | null = null;
  private burst: THREE.Points;
  private velocities: Float32Array;
  private materials: THREE.Material[] = [];
  private age = 0;
  private mythic = false;
  private soulRings: THREE.Mesh[] = [];
  private phase = Math.random() * Math.PI * 2;
  private style: (typeof DROP_STYLES)[Rarity];
  private burstAlive = true;
  private disposed = false;

  constructor(item: Item, lowDetail = false) {
    this.mythic = item.rarity === 'mythic';
    this.style = DROP_STYLES[item.rarity];
    this.pickupDelay = this.style.pickupDelay;
    const color = new THREE.Color(UI_RARITY_COLORS[item.rarity]);
    const iconMaterial = new THREE.SpriteMaterial({ map: iconTexture(item), transparent: true,
      depthTest: true, depthWrite: false, toneMapped: false, alphaTest: .12 });
    this.materials.push(iconMaterial);
    this.icon = new THREE.Sprite(iconMaterial);
    this.icon.scale.set(.85, .85, 1);
    this.icon.renderOrder = 3;
    this.group.add(this.icon);

    // Three stepped bands, crossed planes: readable from all horizontal angles, no real lights.
    for (let band = 0; band < 3; band++) for (let cross = 0; cross < 2; cross++) {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .2,
        depthWrite: false, depthTest: true, side: THREE.DoubleSide, toneMapped: false,
        blending: THREE.AdditiveBlending });
      this.materials.push(material);
      const beam = new THREE.Mesh(plane, material);
      beam.rotation.y = cross * Math.PI / 2;
      beam.position.y = this.style.height * (band + .5) / 3;
      beam.scale.set(this.style.width * (1 - band * .18), this.style.height / 3, 1);
      beam.userData.band = band;
      this.beams.push(beam); this.group.add(beam);
    }
    const ringMaterial = new THREE.MeshBasicMaterial({ map: combatTexture('effects', 'shockwave'), color,
      transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.materials.push(ringMaterial);
    this.ring = new THREE.Mesh(plane, ringMaterial);
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = .035;
    this.group.add(this.ring);

    if (item.rarity === 'legendary' || this.mythic) {
      const material = new THREE.SpriteMaterial({ map: combatTexture('effects', 'impact'), color: 0xffd58a,
        transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
        blending: THREE.AdditiveBlending });
      this.materials.push(material);
      this.crown = new THREE.Sprite(material); this.crown.position.y = 1.1;
      this.group.add(this.crown);
    }
    if (this.mythic) for (let i=0;i<3;i++) {
      const material = new THREE.MeshBasicMaterial({map:combatTexture('effects','shockwave'),color:i===1?0xffd68a:0xff2857,
        transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});
      this.materials.push(material);
      const halo = new THREE.Mesh(plane,material);
      halo.rotation.x=-Math.PI/2; this.soulRings.push(halo); this.group.add(halo);
    }
    const count = Math.ceil(this.style.sparks * (lowDetail ? .55 : 1));
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2;
      const speed = .7 + Math.random() * (item.rarity === 'legendary' ? 2 : 1);
      this.velocities.set([Math.cos(angle) * speed, 1.5 + Math.random() * 2, Math.sin(angle) * speed], i * 3);
      positions[i * 3 + 1] = .25;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({ color, size: item.rarity === 'legendary' ? .1 : .065,
      transparent: true, opacity: 1, depthWrite: false, depthTest: true, toneMapped: false,
      blending: THREE.AdditiveBlending });
    this.materials.push(particleMaterial);
    this.burst = new THREE.Points(geometry, particleMaterial);
    this.burst.frustumCulled = false;
    this.group.add(this.burst);
    this.update(0, 0, true);
  }

  update(dt: number, distance: number, detailed: boolean): void {
    this.age += dt;
    if (this.burstAlive && this.age > 1.2) {
      this.group.remove(this.burst); this.burst.geometry.dispose(); this.burstAlive = false;
    }
    this.group.visible = distance < 45;
    if (!this.group.visible) return;
    const landing = Math.min(1, this.age / .42);
    this.icon.position.y = .7 + Math.sin(this.age * 1.5 + this.phase) * .075 + Math.sin(landing * Math.PI) * .42;
    const size = .85 * (.7 + .3 * Math.min(1, this.age / .2));
    this.icon.scale.set(size, size, 1);
    this.icon.material.color.copy(white);
    const pulse = 1 + Math.sin(this.age * 1.8 + this.phase) * .1;
    for (const beam of this.beams) {
      beam.visible = detailed;
      if (this.mythic) {
        const wave = Math.sin(this.age*2.8 + beam.userData.band*1.6);
        (beam.material as THREE.MeshBasicMaterial).color.setRGB(1,.05+Math.max(0,wave)*.5,.16+Math.max(0,-wave)*.35);
        beam.rotation.y += dt*.45;
      }
      const band = beam.userData.band as number;
      (beam.material as THREE.MeshBasicMaterial).opacity = (.29 - band * .08) * pulse
        * (1 + Math.max(0, 1 - this.age / .7) * 1.6);
    }
    for (let i=0;i<this.soulRings.length;i++) {
      const halo=this.soulRings[i], cycle=(this.age*.4+i/3)%1;
      halo.visible=detailed;
      halo.position.y=.06+cycle*2.4;
      halo.rotation.z=this.age*(i%2?-.7:.7);
      halo.scale.setScalar((1.6-cycle*.9)*(1+Math.max(0,1-this.age)*2));
      (halo.material as THREE.MeshBasicMaterial).opacity=(1-cycle)*.65;
    }
    this.ring.visible = detailed;
    const settle = this.crown ? 1.5 : .9;
    const ringSize = settle * pulse + Math.sin(Math.min(1, this.age / 1.1) * Math.PI) * (this.crown ? 1.8 : .5);
    this.ring.scale.setScalar(ringSize);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = this.age < .75 ? .9 * (1 - this.age / 1.1) : .35;
    if (this.crown) {
      this.crown.visible = this.age < 1.1 && detailed;
      this.crown.scale.setScalar(.8 + Math.min(this.age, .6) * 3);
      this.crown.material.opacity = Math.max(0, 1 - this.age / 1.1);
    }
    if (this.burstAlive) {
        this.burst.visible = detailed;
        const attribute = this.burst.geometry.getAttribute('position') as THREE.BufferAttribute;
        const positions = attribute.array as Float32Array;
        for (let i = 0; i < positions.length; i += 3) {
          this.velocities[i + 1] -= dt * 4;
          positions[i] += this.velocities[i] * dt;
          positions[i + 1] = Math.max(.06, positions[i + 1] + this.velocities[i + 1] * dt);
          positions[i + 2] += this.velocities[i + 2] * dt;
        }
        attribute.needsUpdate = true;
        (this.burst.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - this.age / 1.2);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    if (this.burstAlive) this.burst.geometry.dispose();
    this.materials.forEach(material => material.dispose());
    this.group.clear();
  }
}
