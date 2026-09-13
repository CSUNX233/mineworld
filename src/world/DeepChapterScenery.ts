import { createLateScenery } from './LateChapterScenery';
import * as THREE from 'three';
import type { FloorData, Room } from '../types';
import { BlockKind } from './Block';
import { roomContainsCell, roomCenter } from './RoomGeometry';
import { sanctumThroneSlots } from '../data/SanctumChapter';
import { deepChapterKit } from './DeepChapterAssets';
import { deepChapterStyle } from './DeepChapterStyle';
import { ChapterLightPool, type ChapterLightSource } from './ChapterLightPool';
import { sceneryFocus } from './SceneryCutaway';
import { interactionModule } from './InteractionProps';
import { bakeScenery, applySceneryBake } from './SceneryBake';

const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
function hash(seed: number, x: number, z: number): number {
  let n = (seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Visual-only dressing of the generated grid, including irregular masks and real corridors. */
export function createDeepChapterScenery(data: FloorData, excluded: Set<string>): THREE.Group | null {
  if(data.floor>=16)return createLateScenery(data,excluded);
  const kit = deepChapterKit(data.floor), style = deepChapterStyle(data.floor);
  if (!style || !kit) return null;
  const foundry = style.chapter === 'foundry';
  const group = new THREE.Group(); group.name = 'deep-chapter-scenery';
  const material = kit.material.clone(); material.onBeforeCompile = kit.material.onBeforeCompile;
  material.color.setHex(style.tint);
  const glow = new THREE.MeshBasicMaterial({ color: style.glow, toneMapped: false });
  const coolGlow = new THREE.MeshBasicMaterial({ color: 0x80dfe5, side: THREE.DoubleSide, toneMapped: false });
  const floorMaterial = new THREE.MeshLambertMaterial({map: kit.material.map, color: style.tint});
  const waterMaterial = new THREE.MeshPhongMaterial({color: 0x608d85, specular: 0x9ddbd4, shininess: 50, transparent: true, opacity: .2, depthWrite: false});
  const ownedMaterials: THREE.Material[] = [material, floorMaterial, glow, coolGlow, waterMaterial];
  const sources: ChapterLightSource[] = [];
  const batches = new Map<string, {name: string; matrices: THREE.Matrix4[]}>();
  const pos = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const place = (name: string, x: number, z: number, y = 0, angle = 0, sx = 1, sy = 1, sz = 1) => {
    const key = `${name}:${Math.floor(x / 20)}:${Math.floor(z / 20)}`;
    let batch = batches.get(key); if (!batch) { batch = { name, matrices: [] }; batches.set(key, batch); }
    pos.set(x, y, z); scale.set(sx, sy, sz); rotation.setFromAxisAngle(up, angle);
    batch.matrices.push(new THREE.Matrix4().compose(pos, rotation, scale));
    if (kit.geometries.has(`${name}_glow`)) place(`${name}_glow`, x, z, y, angle, sx, sy, sz);
  };
  const kind = (x: number, z: number) => data.grid[z]?.[x];
  const walk = (x: number, z: number) => kind(x, z) === BlockKind.Floor || kind(x, z) === BlockKind.Portal;
  const wall = (x: number, z: number) => kind(x, z) === BlockKind.Wall;
  const key = (x: number, z: number) => `${x},${z}`;
  const roomCells = new Map<string, Room>();
  for (const room of data.rooms) for (let z = room.z; z < room.z + room.depth; z++) for (let x = room.x; x < room.x + room.width; x++) {
    if (roomContainsCell(room, x, z)) roomCells.set(key(x, z), room);
  }
  const protectedPoints = [data.spawn, data.portal, ...data.chests, ...(data.merchant ? [data.merchant] : []), ...data.rooms.flatMap(r => r.entrances ?? [])];
  const safeDecor = (x: number, z: number) => !protectedPoints.some(p => Math.hypot(p.x - x, p.z - z) < 2.2);
  const lowWalls = new Set<string>(), landmarkWalls = new Set<string>();
  const exteriorPositions: {x: number; z: number; width: number}[] = [];
  const boilerRooms = new Set<Room>();
  const report: {id: string; template: string; kind: string; landmark: string; count: number; monument: boolean}[] = [];
  let arches = 0, corridorTiles = 0, decor = 0;

  // Fit a larger facade entirely into solid exterior cells, trying each side independently.
  const exterior = (room: Room, name: string, halfWidth: number, sy = 1, sx = 1) => {
    const c = roomCenter(room);
    const candidates = [{x: c.x, z: room.z - 2, a: 0}, {x: c.x, z: room.z + room.depth + 2, a: Math.PI},
      {x: room.x - 2, z: c.z, a: Math.PI / 2}, {x: room.x + room.width + 2, z: c.z, a: -Math.PI / 2}];
    for (const p of candidates) {
      if (exteriorPositions.some(q => Math.hypot(q.x - p.x, q.z - p.z) < halfWidth + q.width + 1)) continue;
      let clear = true;
      for (let dx = -halfWidth; dx <= halfWidth; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!wall(Math.floor(p.x + Math.cos(p.a) * dx + Math.sin(p.a) * dz), Math.floor(p.z - Math.sin(p.a) * dx + Math.cos(p.a) * dz))) clear = false;
      }
      if (!clear) continue;
      place(name, p.x, p.z, 0, p.a, sx, sy, 1);
      exteriorPositions.push({x: p.x, z: p.z, width: halfWidth});
      if (name === 'furnace') sources.push({x: p.x + Math.sin(p.a), y: 2.8, z: p.z + Math.cos(p.a), color: style.glow, strength: 9});
      if (name === 'sealed_gate') sources.push({x: p.x + Math.sin(p.a), y: 1.8, z: p.z + Math.cos(p.a), color: 0x80dfe5, strength: 4});
      for (let z = room.z - 1; z <= room.z + room.depth; z++) for (let x = room.x - 1; x <= room.x + room.width; x++) {
        if (wall(x, z) && Math.hypot(x + .5 - p.x, z + .5 - p.z) < halfWidth + 1.5) lowWalls.add(key(x, z));
      }
      return true;
    }
    return false;
  };

  for (const room of data.rooms) {
    const candidates: {x: number; z: number; a: number}[] = [];
    for (let z = room.z - 1; z <= room.z + room.depth; z++) for (let x = room.x - 1; x <= room.x + room.width; x++) {
      if (!wall(x, z) || !safeDecor(x, z)) continue;
      const dir = directions.find(([dx, dz]) => walk(x + dx, z + dz) && roomCells.get(key(x + dx, z + dz)) === room);
      if (dir) candidates.push({x, z, a: Math.atan2(dir[0], dir[1])});
    }
    candidates.sort((a, b) => hash(data.seed, a.x, a.z) - hash(data.seed, b.x, b.z));
    const chosen: typeof candidates = [];
    const template = room.template ?? 'pillar-court';
    const prop = room.kind === 'treasure' ? 'supply_crate'
      : room.kind === 'start' || room.kind === 'sanctuary' ? (foundry ? 'tank' : 'tablet')
      : template === 'prism-gallery' ? 'prism'
      : template === 'resonance-workshop' ? 'coil'
      : foundry ? (style.landmark === 'hoist' ? 'tank' : style.landmark)
      : template === 'sanctum-inscription' || template === 'sanctum-ritual' ? 'tablet'
      : style.landmark === 'bell_gantry' ? 'ossuary' : style.landmark;
    for (const p of candidates) {
      if (chosen.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 4.2)) continue;
      chosen.push(p); landmarkWalls.add(key(p.x, p.z));
      const heightScale = prop === 'chimney' ? .60 : prop === 'ossuary' ? .85 : 1;
      place(prop, p.x + .5, p.z + .5, .56, p.a, prop === 'chimney' ? .50 : .85, heightScale, prop === 'chimney' ? .50 : .85);
      if (prop === 'coil' || prop === 'prism') sources.push({x: p.x + .5, y: 2.5, z: p.z + .5, color: 0x73d1de, strength: 3});
      if (chosen.length >= (data.floor === 13 ? 6 : 4)) break;
    }
    let monument = false;
    if (room.template === 'furnace-arena') {
      monument = exterior(room, 'furnace', 4, 1.35, 1.5) || exterior(room, 'furnace', 3, 1.15);
      exterior(room, 'sealed_gate', 1);
    }
    else if (room.template === 'sanctum-throne') monument = exterior(room, 'throne', 4, 1.3, 1.4) || exterior(room, 'throne', 3, 1.1);
    else if (data.floor === 7 && room.kind !== 'start' && room.kind !== 'sanctuary') monument = exterior(room, 'hoist', 2, 1.35);
    else if (data.floor === 14) monument = exterior(room, 'bell_gantry', 2, 1.05);
    report.push({id: room.id ?? '', template, kind: room.kind ?? '', landmark: prop, count: chosen.length, monument});
    if (room.template === 'pressure-ring') {
      const obstacles = [...roomCells].filter(([cell, r]) => {
        const [x, z] = cell.split(',').map(Number); return r === room && kind(x, z) === BlockKind.Obstacle;
      });
      if (obstacles.length === 9) {
        boilerRooms.add(room);
        const points = obstacles.map(([cell]) => cell.split(',').map(Number));
        const x = points.reduce((sum, p) => sum + p[0] + .5, 0) / points.length;
        const z = points.reduce((sum, p) => sum + p[1] + .5, 0) / points.length;
        place('tank', x, z, .56, 0, 2.65, 1.25, 2.65);
      }
    }
    if (room.template === 'sanctum-throne') for (const p of sanctumThroneSlots(room)) {
      // Same three optional mechanic slots; flat rectangles never introduce new collision.
      const geometry = new THREE.PlaneGeometry(2.8, 2.8);
      const mat = new THREE.MeshLambertMaterial({color: 0x817a58}); ownedMaterials.push(mat);
      const slot = new THREE.Mesh(geometry, mat); slot.rotation.x = -Math.PI / 2; slot.position.set(p.x, .018, p.z); group.add(slot);
      const inset = new THREE.Mesh(new THREE.PlaneGeometry(2.15, 2.15), new THREE.MeshLambertMaterial({color: 0x405650}));
      ownedMaterials.push(inset.material); inset.rotation.x = -Math.PI / 2; inset.position.set(p.x, .020, p.z); group.add(inset);
    }
  }

  // One bounded merged ground buffer per chunk; all irregular cells retain their exact footprint.
  const floors = new Map<string, {positions: number[]; uv: number[]}>();
  for (let z = 0; z < data.size; z++) for (let x = 0; x < data.size; x++) {
    const n = hash(data.seed, x, z), k = kind(x, z);
    if (walk(x, z) || k === BlockKind.Obstacle) {
      const chunk = `${Math.floor(x / 20)},${Math.floor(z / 20)}`;
      let floor = floors.get(chunk); if (!floor) { floor = {positions: [], uv: []}; floors.set(chunk, floor); }
      for (const [dx, dz] of [[0,0],[0,1],[1,0],[1,0],[0,1],[1,1]]) {
        floor.positions.push(x + dx, 0, z + dz);
        floor.uv.push(.025 + ((x % 4) + dx) / 4 * .44, .025 + ((z % 4) + dz) / 4 * .44);
      }
      if (walk(x, z) && !roomCells.has(key(x, z))) corridorTiles++;
      if (walk(x, z) && safeDecor(x, z)) {
        const side = directions.find(([dx, dz]) => wall(x + dx, z + dz));
        if (side && n < .14) { place('rubble', x + .5 + side[0] * .3, z + .5 + side[1] * .3, .005, n * 30, .65, .65, .65); decor++; }
        if (!foundry && side && n > .8 && safeDecor(x, z)) { place('puddle', x + .5 + side[0] * .15, z + .5 + side[1] * .15); decor++; }
        if (foundry && !roomCells.has(key(x, z)) && n < .25) { place('grate', x + .5, z + .5); decor++; }
      }
    }
    if (k === BlockKind.Obstacle && !excluded.has(key(x, z))) {
      const room = roomCells.get(key(x, z)), template = room?.template;
      const name = foundry ? template === 'pressure-ring' ? (room && boilerRooms.has(room) ? 'plinth' : 'tank') : template === 'impact-yard' || data.floor === 7 ? 'supply_crate' : template === 'prism-gallery' ? 'prism'
        : template === 'resonance-workshop' || template === 'foundry-combination' ? (n < .5 ? 'coil' : 'tank')
        : 'tank' : template === 'sanctum-procession' ? 'tomb' : 'tablet';
      place(name, x + .5, z + .5, 0, 0, .94, name === 'coil' ? .68 : name === 'prism' ? .9 : 1, .94);
    }
    if (!wall(x, z)) continue;
    const edge = directions.find(([dx, dz]) => walk(x + dx, z + dz));
    if (!edge) continue;
    const angle = Math.atan2(edge[0], edge[1]);
    const landmark = landmarkWalls.has(key(x, z)), low = lowWalls.has(key(x, z));
    const wallName = landmark ? 'plinth' : !foundry && n < (data.floor === 13 ? .75 : .32) && !low ? 'wall_niche' : 'wall';
    place(wallName, x + .5, z + .5, 0, angle, 1, landmark ? 1 : low ? .6 : style.wallHeight, 1);
    if (landmark || low) continue;
    if (foundry) { place('pipe', x + .5, z + .5, 0, angle, 1, style.wallHeight, 1); if (n < .16) place('valve', x + .5, z + .5, 0, angle); }
    if ((x + z) % 5 === 0 && safeDecor(x, z)) {
      place('pillar', x + .5, z + .5, 0, angle, 1, data.floor === 11 ? .72 : data.floor === 15 ? 1.14 : 1, 1);
      if (n < .48) place('banner', x + .5 + edge[0] * .44, z + .5 + edge[1] * .44, 1.5, angle, .85, 1, .85);
    }
    if ((x + z) % 4 === 1 && safeDecor(x, z)) {
      const lx = x + .5 + edge[0] * .62, lz = z + .5 + edge[1] * .62;
      place('lamp', lx, lz, 1.45, angle);
      sources.push({x: lx, y: 1.85, z: lz, color: foundry ? 0xffab56 : style.light, strength: foundry ? 13 : 7});
    }
  }

  const archPositions: {x: number; z: number}[] = [];
  for (const room of data.rooms) {
    const sockets: {x: number; z: number; a: number}[] = [];
    for (let x = room.x + 1; x < room.x + room.width - 1; x++) for (const z of [room.z - 1, room.z + room.depth]) {
      if (walk(x - 1, z) && walk(x, z) && walk(x + 1, z) && wall(x - 2, z) && wall(x + 2, z)) sockets.push({x, z, a: 0});
    }
    for (let z = room.z + 1; z < room.z + room.depth - 1; z++) for (const x of [room.x - 1, room.x + room.width]) {
      if (walk(x, z - 1) && walk(x, z) && walk(x, z + 1) && wall(x, z - 2) && wall(x, z + 2)) sockets.push({x, z, a: Math.PI / 2});
    }
    for (const p of sockets) {
      if (archPositions.some(a => Math.hypot(a.x - p.x, a.z - p.z) < 5)) continue;
      for (const side of [-1, 1]) {
        const x = p.x + .5 + Math.cos(p.a) * side * 2, z = p.z + .5 - Math.sin(p.a) * side * 2;
        for (const batch of batches.values()) if (batch.name === 'pillar') {
          batch.matrices = batch.matrices.filter(m => Math.abs(m.elements[12] - x) > .01 || Math.abs(m.elements[14] - z) > .01);
        }
      }
      place('arch', p.x + .5, p.z + .5, 0, p.a); archPositions.push(p); arches++;
    }
  }
  // Distant shapes are outside the grid and cannot affect routing or spawns.
  for (let i = 0; i < 6; i++) {
    const side = i % 4, along = data.size * (.25 + Math.floor(i / 4) * .5);
    const x = side === 1 ? data.size + 5 : side === 3 ? -5 : along;
    const z = side === 0 ? -5 : side === 2 ? data.size + 5 : along;
    place(foundry ? 'chimney' : 'ossuary', x, z, -.8, i, 1.4, 1.05 + i % 2 * .25, 1.4);
    if (!foundry) place('rock', x + 1.8, z, -1.4, i, 1.5, 1, 1.5);
  }

  const baked = bakeScenery(data, sources);
  applySceneryBake(material, baked, data.size, foundry);
  applySceneryBake(floorMaterial, baked, data.size, foundry);
  group.userData.bakedScenery = baked;
  group.userData.atmosphereLights = sources;
  for (const [chunk, floor] of floors) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(floor.positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(floor.uv, 2)); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, floorMaterial); mesh.name = `chapter-floor:${chunk}`; mesh.receiveShadow = true; group.add(mesh);
  }
  for (const [key, batch] of batches) {
    if (!batch.matrices.length) continue;
    const shared = batch.name === 'supply_crate' ? interactionModule('supply_crate', data.floor) : null;
    const geometry = shared?.geometry ?? kit.geometries.get(batch.name);
    if (!geometry) throw new Error(`Missing ${style.chapter} module: ${batch.name}`);
    const mat = batch.name === 'puddle' ? waterMaterial : batch.name.endsWith('_glow') ? ['coil_glow', 'prism_glow', 'sealed_gate_glow'].includes(batch.name) ? coolGlow : glow : shared?.material ?? material;
    const instances = new THREE.InstancedMesh(geometry, mat, batch.matrices.length); instances.name = key;
    batch.matrices.forEach((m, i) => instances.setMatrixAt(i, m)); instances.computeBoundingSphere();
    instances.castShadow = !batch.name.endsWith('_glow') && batch.name !== 'puddle'; instances.receiveShadow = true; group.add(instances);
  }
  const foundationMat = new THREE.MeshLambertMaterial({color: style.ground}); ownedMaterials.push(foundationMat);
  const foundation = new THREE.Mesh(new THREE.BoxGeometry(data.size + 24, 3, data.size + 24), foundationMat);
  foundation.position.set(data.size / 2, -2.5, data.size / 2); foundation.receiveShadow = true; group.add(foundation);
  const lights = new ChapterLightPool(sources, data.rooms); group.add(lights.group);
  group.userData.lightPool = lights; group.userData.ownedMaterials = ownedMaterials;
  group.userData.chapterArt = {floor: data.floor, theme: style.name, rooms: report, arches, corridorTiles, decorations: decor, lights: sources.length};
  return group;
}

export function updateDeepChapterScenery(group: THREE.Object3D, elapsed: number): void {
  (group.userData.lightPool as ChapterLightPool).update(elapsed, sceneryFocus.value);
}
export function disposeDeepChapterScenery(group: THREE.Object3D): void {
  (group.userData.bakedScenery as THREE.Texture).dispose();
  (group.userData.lightPool as ChapterLightPool).dispose();
  group.traverse(node => {
    if (node instanceof THREE.InstancedMesh) node.dispose();
    else if (node instanceof THREE.Mesh) node.geometry.dispose();
  });
  (group.userData.ownedMaterials as THREE.Material[]).forEach(m => m.dispose());
}
