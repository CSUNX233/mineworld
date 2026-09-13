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

  // Held equipment is part of the textured model. Keep only the combat signal.
  const color = monster.def.role === 'support' ? 0x8ee5b6 : monster.def.role === 'guardian' ? 0x9edce5 : 0xd6adf4;
  const cueMaterial = basicMaterial(color, .78);
  const cue = new THREE.Mesh(new THREE.TorusGeometry(.28, .035, 4, 12), cueMaterial);
  cue.position.y = (monster.visual.geometry.boundingBox?.max.y ?? 1.8) + .14;
  cue.rotation.x = Math.PI / 2;
  root.add(cue); signal = cue; material = cueMaterial;
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
