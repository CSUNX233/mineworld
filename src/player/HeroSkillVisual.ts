import * as THREE from 'three';
import type { SkillDefinition } from '../data/skills';
import { effectTexture } from '../ui/CombatArt';

/** A fixed reusable sprite bank, shared between the two camera views. */
export class HeroSkillVisual {
  readonly flame = new THREE.Group();
  castTime = 0;
  slashTime = 0;
  private readonly duration = .58;
  private readonly slashDuration = .34;
  private readonly sprites: THREE.Sprite[] = [];
  private readonly fire = new THREE.SpriteMaterial({map: effectTexture('fire'), transparent:true,
    blending:THREE.AdditiveBlending, depthWrite:false, toneMapped:false});
  private readonly glow = new THREE.SpriteMaterial({map: effectTexture('impact'), transparent:true,
    blending:THREE.AdditiveBlending, depthWrite:false, toneMapped:false});
  constructor() {
    this.flame.name = 'StarfirePalmEnergy'; this.flame.visible = false;
    for (let i=0;i<6;i++) {
      const sprite=new THREE.Sprite(i===0 ? this.glow : this.fire);
      sprite.renderOrder=1001; this.sprites.push(sprite); this.flame.add(sprite);
    }
  }
  trigger(skill: SkillDefinition): void {
    if (skill.tags.includes('melee') && !skill.tags.includes('defense')) {
      this.slashTime=this.slashDuration;
    } else {
      this.castTime=this.duration;
      this.glow.color.setHex(skill.element==='frost' ? 0x98eaff : skill.element==='shadow' ? 0xc29bff : 0xffe7a8);
    }
    this.refresh();
  }
  update(dt: number): void {
    this.castTime=Math.max(0,this.castTime-dt);
    this.slashTime=Math.max(0,this.slashTime-dt);
    this.refresh();
  }
  private refresh(): void {
    this.flame.visible=this.castTime>0;
    if (!this.flame.visible) return;
    const age=this.duration-this.castTime;
    const strength=Math.min(1,.35+age/.08)*Math.min(1,this.castTime/.20);
    this.fire.opacity=.85*strength;this.glow.opacity=.7*strength;
    for(let i=0;i<this.sprites.length;i++) {
      const sprite=this.sprites[i];
      const cycle=(age*2.6+i*.23)%1;
      sprite.position.set(i===0 ? 0 : Math.sin(i*2.4+age*9)*.025,
        i===0 ? 0 : cycle*.065, i===0 ? 0 : Math.cos(i*2.4)*.016);
      const size=i===0 ? .13 : (.08+(i%2)*.03)*(1-cycle*.5);
      sprite.scale.set(size*strength,size*(i===0 ? 1 : 1.5)*strength,1);
    }
  }
  /** Starts at contact, follows through, then returns; no gameplay wind-up delay. */
  get slashAmount(): number {
    if(this.slashTime<=0)return 0;
    const t=1-this.slashTime/this.slashDuration;
    return t<.36 ? .3+.7*Math.sin(t/.36*Math.PI/2) : Math.pow((1-t)/.64,2);
  }
  attach(socket: THREE.Object3D | undefined): void {
    if(socket && this.flame.parent!==socket)socket.add(this.flame);
  }
  reset(): void {this.castTime=this.slashTime=0;this.flame.visible=false;}
  dispose(): void {
    this.reset();this.flame.removeFromParent();this.flame.clear();
    this.fire.dispose();this.glow.dispose(); // textures belong to the shared combat-art cache.
  }
}
