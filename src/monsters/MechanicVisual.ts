import * as THREE from 'three';
import { decorateTelegraph } from '../ui/CombatArt';
import type { Monster } from './Monster';

export type MechanicVisualPhase = 'idle' | 'casting' | 'exposed';

interface RoleVisual {
  role: 'support' | 'guardian' | 'controller';
  root: THREE.Group;
  signal: THREE.Object3D;
  material: THREE.Material;
}

const visuals = new WeakMap<Monster, RoleVisual>();

function basicMaterial(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
}

export function attachMechanicVisual(monster: Monster): void {
  if (!monster.def.role || visuals.has(monster)) return;
  const root = new THREE.Group();
  root.name = `mechanic-${monster.def.role}`;
  let signal: THREE.Object3D;
  let material: THREE.Material;

  if (['ram_beast','chain_smith','prism_sentry'].includes(monster.def.id)) {
    const accent = basicMaterial(monster.def.id === 'prism_sentry' ? 0xbde5ff : monster.def.id === 'chain_smith' ? 0x77e5bc : 0xf0bd7c);
    if(monster.def.id === 'ram_beast') {
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.4,.65,.7),new THREE.MeshLambertMaterial({color:0x8a6141}));
      head.position.set(0,.7,.55);root.add(head);
      for(const x of [-.65,.65]) {const horn=new THREE.Mesh(new THREE.ConeGeometry(.16,.65,5),accent);horn.rotation.x=Math.PI/2;horn.position.set(x,.85,1);root.add(horn);}
      signal=head;
    } else if(monster.def.id === 'chain_smith') {
      for(const x of [-.65,.65]) {const spool=new THREE.Mesh(new THREE.TorusGeometry(.3,.11,5,12),accent);spool.position.set(x,1.4,0);root.add(spool);}
      const crown=new THREE.Mesh(new THREE.BoxGeometry(.7,.15,.7),accent);crown.position.y=2.15;root.add(crown);signal=crown;
    } else {
      const lens=new THREE.Mesh(new THREE.OctahedronGeometry(.4),accent);lens.scale.set(1.6,.6,.8);lens.position.set(0,1.75,.45);root.add(lens);signal=lens;
      for(let i=0;i<3;i++) {const leg=new THREE.Mesh(new THREE.BoxGeometry(.13,.9,.13),accent);leg.position.set(Math.sin(i*Math.PI*2/3)*.6,.45,Math.cos(i*Math.PI*2/3)*.6);root.add(leg);}
    }
    material=accent;
  } else if (monster.def.id === 'valve_overseer') {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, 1.3, 8), new THREE.MeshLambertMaterial({color: 0x896844}));
    tank.position.set(0, 1.1, -.4);
    const rod = new THREE.Mesh(new THREE.BoxGeometry(.12, 1.8, .12), basicMaterial(0xd6bb86));
    rod.position.set(.65, 1.25, 0);
    const wheelMaterial = basicMaterial(0xffb84c);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(.3, .075, 5, 8), wheelMaterial);
    wheel.position.set(.65, 2.1, 0);
    root.add(tank, rod, wheel);
    signal = wheel; material = wheelMaterial;
  } else if (monster.def.role === 'guardian') {
    const shieldMaterial = new THREE.MeshLambertMaterial({ color: 0x77c9e8, emissive: 0x153b55, emissiveIntensity: 0.35, transparent: true });
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.35, 0.14), shieldMaterial);
    shield.position.set(0, 1.05, 0.62);
    const crest = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), basicMaterial(0xd9f7ff));
    crest.position.set(0, 1.05, 0.72);
    root.add(shield, crest);
    signal = shield;
    material = shieldMaterial;
  } else if (monster.def.role === 'support') {
    const haloMaterial = basicMaterial(0x75f0a5, 0.78);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 6, 20), haloMaterial);
    halo.position.y = 2.25;
    halo.rotation.x = Math.PI / 2;
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.45, 6), new THREE.MeshLambertMaterial({ color: 0xe6d98d }));
    staff.position.set(0.48, 1.12, 0.12);
    root.add(halo, staff);
    signal = halo;
    material = haloMaterial;
  } else {
    const focusMaterial = basicMaterial(0xe080ff, 0.82);
    const focus = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), focusMaterial);
    focus.position.y = 2.15;
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.045, 5, 20), focusMaterial.clone());
    orbit.position.y = 2.15;
    orbit.rotation.x = Math.PI / 2;
    root.add(focus, orbit);
    signal = focus;
    material = focusMaterial;
  }
  monster.group.add(root);
  visuals.set(monster, { role: monster.def.role, root, signal, material });
}

export function setMechanicVisualPhase(monster: Monster, phase: MechanicVisualPhase, elapsed = 0): void {
  const visual = visuals.get(monster);
  if (!visual) return;
  const casting = phase === 'casting';
  const exposed = phase === 'exposed';
  visual.signal.scale.setScalar(casting ? 1.2 + Math.sin(elapsed * 10) * 0.12 : exposed ? 0.72 : 1);
  visual.root.visible = !monster.dead;
  if ('opacity' in visual.material) (visual.material as THREE.MeshBasicMaterial).opacity = exposed ? 0.3 : casting ? 1 : 0.78;
  if (visual.role === 'guardian') {
    visual.root.rotation.y = 0;
    visual.root.position.y = exposed ? -0.52 : 0;
  } else if (!['valve_overseer','ram_beast','chain_smith','prism_sentry'].includes(monster.def.id)) {
    visual.root.rotation.y += casting ? 0.035 : 0.008;
  }
}

export function createTetherVisual(): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x65ff9b, transparent: true, opacity: 0.9 }));
}

export function updateTetherVisual(line: THREE.Line, from: { x: number; z: number }, to: { x: number; z: number }): void {
  const attribute = line.geometry.getAttribute('position') as THREE.BufferAttribute;
  attribute.setXYZ(0, from.x, 1.25, from.z);
  attribute.setXYZ(1, to.x, 1.1, to.z);
  attribute.needsUpdate = true;
}

export type ZoneVisualPhase = 'warning' | 'active';

export function createZoneVisual(x: number, z: number, radius: number, phase: ZoneVisualPhase): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0.055, z);
  const material = basicMaterial(phase === 'warning' ? 0xffb347 : 0xb62fff, phase === 'warning' ? 0.52 : 0.68);
  const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.05, radius - 0.14), radius, 32), material);
  ring.rotation.x = -Math.PI / 2;
  decorateTelegraph(ring, 'circle', radius * 1.9);
  group.add(ring);
  if (phase === 'active') {
    const fill = new THREE.Mesh(new THREE.CircleGeometry(Math.max(0.05, radius - 0.16), 32), basicMaterial(0x7d1eb2, 0.2));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = -0.01;
    group.add(fill);
  }
  return group;
}

export function disposeMechanicObject(object: THREE.Object3D): void {
  object.traverse(child => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    materials.forEach(material => material.dispose());
  });
}
