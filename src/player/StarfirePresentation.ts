import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Item } from '../types';
import { HeroMotionState } from './HeroMotionState';
import { HeroSkillVisual } from './HeroSkillVisual';
import type { SkillDefinition } from '../data/skills';

const BASE = `${(import.meta.env?.BASE_URL ?? '/')}assets/actors/starfire/`;
import { weaponKind as heroWeaponKind } from '../items/WeaponKind';
export { weaponKind as heroWeaponKind } from '../items/WeaponKind';
export function disposeHeroObject(root: THREE.Object3D): void {
  const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>(), skeletons = new Set<THREE.Skeleton>();
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    geometry.add(o.geometry);
    if (o instanceof THREE.SkinnedMesh) skeletons.add(o.skeleton);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      materials.add(m);
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); skeletons.forEach(s => s.dispose());
  root.removeFromParent();
}
interface MotionPlayer {
  position: THREE.Vector3; velocity: THREE.Vector3; onGround: boolean; alive: boolean;
  motionInput: number; visualVerticalSpeed: number;
}
/** Separate world actor and purpose-built camera hands; only the visible rig is posed. */
export class StarfirePresentation {
  readonly motion = new HeroMotionState();
  ready = false;
  failed = false;
  private disposed = false;
  private root: THREE.Group | null = null;
  private fpRoot: THREE.Group | null = null;
  private fpBones = new Map<string, THREE.Bone>();
  private camera: THREE.PerspectiveCamera | null = null;
  private fp = false;
  private opacity = 1;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private meshes: THREE.Mesh[] = [];
  private materials = new Set<THREE.Material>();
  private bones = new Map<string, THREE.Bone>();
  private worldPose: { bone: THREE.Bone; value: THREE.Quaternion }[] = [];
  private fpPose: { bone: THREE.Bone; value: THREE.Quaternion }[] = [];
  private fpPositions: { bone: THREE.Bone; value: THREE.Vector3 }[] = [];
  private staffPose: { bone: THREE.Bone; delta: THREE.Quaternion }[] = [];
  private fpTracks: { action: THREE.AnimationAction; bone: THREE.Bone; restInverse: THREE.Quaternion; sample: THREE.QuaternionLinearInterpolant }[] = [];
  private readonly identity = new THREE.Quaternion();
  private readonly delta = new THREE.Quaternion();
  private weapons = new Map<string, THREE.Group>();
  private item: Item | null = null;
  private kind: 'staff' | 'sword' | null = null;
  private previous = new THREE.Vector3();
  private initialized = false;
  private phase = 0;
  private readonly q = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3(1, 0, 0);
  private readonly foreground = new THREE.Scene();
  private readonly cameraMount = new THREE.Group();
  private visualMoving = 0;
  private visualLanding = 0;
  private swingProgress = -1;
  private skillVisual: HeroSkillVisual | null = null;
  private readonly slashAxis = new THREE.Vector3(0,0,1);
  constructor(private parent: THREE.Group, private onReady: () => void) {
    this.cameraMount.matrixAutoUpdate = false;
    this.foreground.add(this.cameraMount, new THREE.HemisphereLight(0xffeed8, 0x69738b, 2));
    const key = new THREE.DirectionalLight(0xfff0d9, 2.2);
    key.position.set(-1, 2, 3); this.cameraMount.add(key);
    if (typeof window !== 'undefined') void this.load();
  }
  bindCamera(camera: THREE.PerspectiveCamera): void { this.camera = camera; }
  private async load(): Promise<void> {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const results = await Promise.allSettled(['starfire-motion.glb', 'proxy-sword.glb', 'proxy-staff.glb', 'starfire-first-person.glb'].map(f => loader.loadAsync(BASE + f)));
    if (this.disposed || results.some(r => r.status === 'rejected')) {
      for (const r of results) if (r.status === 'fulfilled') disposeHeroObject(r.value.scene);
      this.failed = !this.disposed; return;
    }
    const gltfs = results.map(r => (r as PromiseFulfilledResult<Awaited<ReturnType<GLTFLoader['loadAsync']>>>).value);
    const gltf = gltfs[0];
    if (!gltf.scene.getObjectByName('SF_Grip_R') || !gltf.animations.some(a => a.name === 'Run')) {
      gltfs.forEach(g => disposeHeroObject(g.scene)); this.failed = true; return;
    }
    this.fpRoot = gltfs[3].scene; this.fpRoot.name = 'StarfireFirstPersonHands';
    this.fpRoot.traverse(o => { if (o instanceof THREE.Bone) this.fpBones.set(o.name,o); });
    this.root = gltf.scene; this.root.name = 'StarfireHero';
    this.root.traverse(o => {
      if (o instanceof THREE.Bone) { this.bones.set(o.name, o); this.worldPose.push({bone:o,value:o.quaternion.clone()}); }
      if (o instanceof THREE.Mesh) {
        this.meshes.push(o); o.frustumCulled = false; o.castShadow = true;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) this.materials.add(m);
      }
    });
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const clip of gltf.animations) {
      if (clip.name === 'Staff_Hold') {
        for (const track of clip.tracks) {
          const name = track.name.replace(/\.quaternion$/, '');
          const bone = this.bones.get(name);
          if (bone && /^(upper_armR|forearmR|handR)$/.test(name) && track.name.endsWith('.quaternion'))
            this.staffPose.push({bone, delta: new THREE.Quaternion().fromArray(gltf.animations.find(c=>c.name==='Idle')?.tracks.find(t=>t.name===track.name)?.values ?? bone.quaternion.toArray()).invert().multiply(new THREE.Quaternion().fromArray(track.values))});
        }
        continue;
      }
      if (clip.name === 'FP_Pose') {
        for (const track of clip.tracks) {
          if (track.name.endsWith('.position')) {
            const bone = this.fpBones.get(track.name.replace(/\.position$/, ''));
            if (bone) this.fpPositions.push({bone,value:new THREE.Vector3().fromArray(track.values)});
          }
          const name = track.name.replace(/\.quaternion$/, '');
          const bone = this.fpBones.get(name);
          if (bone && /^(upper_arm|forearm|hand|clavicle|f_index|f_middle|f_ring|f_pinky|thumb)/.test(name) && track.name.endsWith('.quaternion'))
            this.fpPose.push({ bone, value: new THREE.Quaternion().fromArray(track.values) });
        }
        continue;
      }
      const action = this.mixer.clipAction(clip); action.play(); action.setEffectiveWeight(0);
      this.actions.set(clip.name, action);
      for (const track of clip.tracks) {
        const name = track.name.replace(/\.quaternion$/, '');
        const bone = this.fpBones.get(name);
        if (bone && /^(upper_arm|forearm|hand)/.test(name) && track.name.endsWith('.quaternion')) {
          this.fpTracks.push({ action, bone, restInverse: new THREE.Quaternion().fromArray(gltf.animations.find(c=>c.name==='Idle')?.tracks.find(t=>t.name===track.name)?.values ?? bone.quaternion.toArray()).invert(),
            sample: new THREE.QuaternionLinearInterpolant(track.times, track.values, 4, new Float32Array(4)) });
        }
      }
    }
    this.fpRoot.traverse(o => { if (o instanceof THREE.Mesh) { this.meshes.push(o); o.frustumCulled=false; for (const m of Array.isArray(o.material) ? o.material : [o.material]) this.materials.add(m); } });
    this.weapons.set('sword', gltfs[1].scene); this.weapons.set('staff', gltfs[2].scene);
    for (const w of this.weapons.values()) w.traverse(o => {
      if (o instanceof THREE.Mesh) {
        this.meshes.push(o);o.frustumCulled=false;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) this.materials.add(m);
      }
    });
    // The inherited socket predates the rigged hand replacement. Place its visual
    // origin at the measured palm center, just outside the palm-facing surface.
    for (const [root,bones,name] of [[this.root,this.bones,'SF_Skill_L'],[this.fpRoot,this.fpBones,'FP_Skill_L']] as const) {
      const socket=root.getObjectByName(name),hand=bones.get('handL');
      if(socket && hand) {hand.add(socket);socket.position.set(.001,.065,-.045);socket.quaternion.identity();}
    }
    this.skillVisual = new HeroSkillVisual();
    this.ready = true; this.onReady(); this.setWeapon(this.item); this.setView(this.fp, this.opacity);
  }
  setWeapon(item: Item | null): void {
    this.item = item; this.kind = heroWeaponKind(item);
    if (!this.root) return;
    for (const w of this.weapons.values()) w.removeFromParent();
    const weapon = this.kind ? this.weapons.get(this.kind) : null;
    if (weapon) (this.fp ? this.fpRoot?.getObjectByName('FP_Grip_R') : this.root.getObjectByName('SF_Grip_R'))?.add(weapon);
  }
  setView(firstPerson: boolean, opacity: number): void {
    const changed = this.fp !== firstPerson;
    if (!changed && this.opacity === opacity && this.root?.parent === this.parent && this.fpRoot?.parent === this.cameraMount) return;
    this.fp = firstPerson; this.opacity = opacity;
    if (!this.root) return;
    if (this.root.parent !== this.parent) this.parent.add(this.root);
    this.root.position.set(0,-.018,0); this.root.rotation.set(0,0,0); this.root.scale.setScalar(1);
    this.root.visible = !firstPerson && opacity > .02;
    if (this.fpRoot && this.camera) {
      if (this.fpRoot.parent !== this.cameraMount) this.cameraMount.add(this.fpRoot);
      this.fpRoot.rotation.set(0,Math.PI,0);this.fpRoot.scale.setScalar(.8);
      this.fpRoot.position.set(0,-1.55,-.22);this.fpRoot.visible=firstPerson;
    }
    const weapon=this.kind ? this.weapons.get(this.kind) : null;
    const grip=firstPerson ? this.fpRoot?.getObjectByName('FP_Grip_R') : this.root.getObjectByName('SF_Grip_R');
    if (weapon && grip && weapon.parent!==grip) grip.add(weapon);
    this.skillVisual?.attach((firstPerson ? this.fpRoot : this.root)?.getObjectByName(firstPerson ? 'FP_Skill_L' : 'SF_Skill_L'));
    for (const mesh of this.meshes) {
      mesh.visible = true;
      mesh.castShadow = !firstPerson; mesh.renderOrder = firstPerson ? 1000 : 0;
    }
    for (const m of this.materials) {
      const transparent = !firstPerson && opacity < .99;
      if (m.transparent !== transparent) { m.transparent = transparent; m.needsUpdate = true; }
      m.opacity = firstPerson ? 1 : opacity; m.depthTest = true; m.depthWrite = !transparent;
    }
    // Sample the shared clock immediately: switching cannot expose a stale hidden pose.
    this.poseVisible();
  }
  /** Separate final pass keeps world transparency behind correctly occluded fingers. */
  renderFirstPerson(renderer: THREE.WebGLRenderer): void {
    if (!this.ready || !this.fp || !this.camera || !this.fpRoot) return;
    this.cameraMount.matrix.copy(this.camera.matrixWorld);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.foreground, this.camera);
    renderer.autoClear = autoClear;
  }
  resetMotion(): void { this.motion.reset(); this.initialized = false; this.phase = 0; this.stopSkillVisual(); }
  stopSkillVisual(): void { this.skillVisual?.reset(); }
  playSkill(skill: SkillDefinition): void {
    if(!this.ready)return;
    this.skillVisual?.trigger(skill);this.poseVisible();
  }
  update(dt: number, player: MotionPlayer): void {
    if (!this.ready || !this.root || !this.mixer) return;
    if (!player.alive) { this.stopSkillVisual(); return; } // Retain last pose; no recovery after death.
    this.skillVisual?.update(dt);
    const distance = this.initialized ? Math.hypot(player.position.x-this.previous.x, player.position.z-this.previous.z) : 0;
    this.previous.copy(player.position); this.initialized = true;
    const speed = dt > 0 && distance < 2 ? distance/dt : 0;
    this.motion.update(dt,player.onGround,player.visualVerticalSpeed,speed,player.motionInput,player.alive);
    this.phase += dt * Math.max(.35, this.motion.speed / 3.4) / .88;
    const run = THREE.MathUtils.smoothstep(this.motion.speed, 3, 6.5);
    const moving = THREE.MathUtils.smoothstep(this.motion.speed, .1, 1.3) * (player.motionInput > .02 ? 1 : 0);
    const landing = this.motion.landing > 0;
    const ground = player.onGround;
    const landWeight = landing ? Math.min(1, this.motion.landing / .07) * (1-moving*.65) : 0;
    for (const [name, action] of this.actions) {
      let weight = 0;
      if (ground) {
        if (name === 'Idle') weight = (1-moving)*(1-landWeight);
        if (name === 'Walk') weight = moving*(1-run)*(1-landWeight);
        if (name === 'Run') weight = moving*run*(1-landWeight);
        if (name === this.motion.state && landing) weight = landWeight;
      } else if (name === this.motion.state) weight = 1;
      const next = THREE.MathUtils.damp(action.getEffectiveWeight(),weight,30,dt);
      action.setEffectiveWeight(next < .001 ? 0 : next);
      const duration = action.getClip().duration;
      action.paused = true;
      action.time = name === 'Walk' || name === 'Run' ? (this.phase%1)*duration
        : name === 'Idle' ? (this.phase*.3%1)*duration : Math.min(this.motion.stateTime,duration-.00001);
    }
    this.visualMoving = moving; this.visualLanding = landWeight; this.swingProgress = -1;
    this.poseVisible();
  }
  private poseVisible(): void {
    if (!this.fp) {
      // Mixer skips unchanged properties; remove last frame's visual overlays first.
      for (const p of this.worldPose) p.bone.quaternion.copy(p.value);
      this.mixer?.update(0);
      for (const p of this.worldPose) p.value.copy(p.bone.quaternion);
      if (this.kind === 'staff') for (const p of this.staffPose) p.bone.quaternion.multiply(p.delta);
    }
    if (this.fp && this.fpRoot) {
      for (const p of this.fpPositions) p.bone.position.copy(p.value);
      for (const p of this.fpPose) p.bone.quaternion.copy(p.value);
      for (const track of this.fpTracks) {
        const weight = track.action.getEffectiveWeight();
        if (weight < .001) continue;
        this.q.fromArray(track.sample.evaluate(track.action.time));
        this.delta.copy(track.restInverse).multiply(this.q);
        this.q.copy(this.identity).slerp(this.delta, weight * .24);
        track.bone.quaternion.multiply(this.q);
      }
      this.fpRoot.position.y = -1.55 + Math.sin(this.phase*Math.PI*4)*.008*this.visualMoving - this.visualLanding*.035;
    }
    const arm=(this.fp ? this.fpBones : this.bones).get(this.fp ? 'forearmR' : 'upper_armR');
    const slash=this.skillVisual?.slashAmount ?? 0;
    if(arm && slash>0) {
      const strike=this.fp ? this.fpBones.get('handR')! : arm;
      strike.quaternion.multiply(this.q.setFromAxisAngle(this.axis,-slash*.6));
      strike.quaternion.multiply(this.q.setFromAxisAngle(this.slashAxis,-slash*1.2));
    } else if(arm && this.swingProgress>=0) {
      arm.quaternion.multiply(this.q.setFromAxisAngle(this.axis,-Math.sin(this.swingProgress*Math.PI)*.65));
    }
    (this.fp ? this.fpRoot : this.root)?.updateMatrixWorld(true);
  }
  /** Stage B compatibility with the existing attack timer; authored combat is Stage C. */
  swing(progress: number, angle: number): void {
    if (!this.root) return;
    this.swingProgress = progress;
    this.poseVisible();
    void angle;
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.skillVisual?.dispose();this.skillVisual=null;
    this.mixer?.stopAllAction();
    if (this.root) { this.mixer?.uncacheRoot(this.root); for (const w of this.weapons.values()) w.removeFromParent();disposeHeroObject(this.root); }
    if (this.fpRoot) disposeHeroObject(this.fpRoot);this.fpRoot=null;this.fpBones.clear();
    this.weapons.forEach(disposeHeroObject);this.weapons.clear();this.actions.clear();this.meshes.length=0;this.materials.clear();this.bones.clear();this.fpPose.length=0;this.fpTracks.length=0;this.staffPose.length=0;
    this.fpPositions.length=0; this.worldPose.length=0; this.root = null; this.mixer = null; this.ready = false;
  }
}
