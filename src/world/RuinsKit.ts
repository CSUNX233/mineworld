import { sceneryFocus as focus, sceneryCutaway as cutaway, applySceneryCutaway } from './SceneryCutaway';
import { interactionModule } from './InteractionProps';
import * as THREE from 'three';
import { loadImage } from '../core/AssetLoading';
import { PerformanceTierDetector } from '../core/Performance';
import { RuinsFirelight, type RuinsFire } from './RuinsFirelight';
import { placeRuinsRooms, ruinsObstacleArt } from './RuinsRoomArt';
import { roomContainsCell } from './RoomGeometry';
import type { FloorData } from '../types';
import { BlockKind } from './Block';
import { bakeScenery, applySceneryBake } from './SceneryBake';

const geometries = new Map<string, THREE.BufferGeometry>();
let material: THREE.MeshLambertMaterial | null = null;
let pavingMaterial: THREE.MeshLambertMaterial | null = null;
let pending: Promise<void> | null = null;

/** One downloaded Blender kit for all ruins floors; retry is possible after failure. */
export async function preloadRuinsKit(floor: number): Promise<void> {
  if (floor > 5 || material) return;
  if (!pending) pending = (async () => {
    const base = `${import.meta.env.BASE_URL}assets/world/ruins-kit/`;
    const [gltf, image, floorImage] = await Promise.all([
      loadKit(`${base}sunlit-ruins-kit.glb`),
      loadImage(`${base}material-atlas.png`),
      loadImage(`${base}paving.png`),
    ]);
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false; // glTF UV convention (unlike ordinary Three.js image maps).
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
    const paving = new THREE.Texture(floorImage);
    paving.colorSpace=THREE.SRGBColorSpace; paving.wrapS=paving.wrapT=THREE.RepeatWrapping;
    paving.magFilter=THREE.NearestFilter; paving.needsUpdate=true;
    pavingMaterial=new THREE.MeshLambertMaterial({map:paving,color:0xeee6d7});
    gltf.scene.updateMatrixWorld(true);
    const oldMaterials = new Set<THREE.Material>();
    const oldTextures = new Set<THREE.Texture>();
    gltf.scene.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld);
      // Blender -Y becomes glTF +Z. Normalize front-facing wall attachments to -Z.
      if(['banner','ivy','wall_torch','shield_barricade','weapon_rack','reliquary'].includes(node.name)) geometry.rotateY(Math.PI);
      geometries.set(node.name, geometry);
      node.geometry.dispose();
      for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
        oldMaterials.add(m);
        if (m.map) oldTextures.add(m.map);
      }
    });
    oldMaterials.forEach(m => m.dispose()); oldTextures.forEach(t => t.dispose());
    material = new THREE.MeshLambertMaterial({ map: texture, vertexColors: true });
    applySceneryCutaway(material);
  })().catch(error => { pending = null; throw error; });
  await pending;
}

async function loadKit(url: string) {
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  for(let attempt=0;;attempt++) {
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),30000);
    try {
      const response=await fetch(url,{signal:controller.signal});
      if(!response.ok) throw new Error(`Ruins model: HTTP ${response.status}`);
      const bytes=await response.arrayBuffer();
      return await new GLTFLoader().parseAsync(bytes,'');
    } catch(error) { if(attempt>=2) throw error; }
    finally {clearTimeout(timer);}
  }
}

export function updateRuinsCutaway(position: THREE.Vector3, firstPerson: boolean): void {
  focus.value.copy(position); focus.value.y += 1.1;
  cutaway.value = firstPerson ? 0 : 1;
}

/** Stable decoration hash: never consumes the gameplay RNG or mutates FloorData. */
function noise(seed: number, x: number, z: number): number {
  let n = (seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function createRuinsKit(data: FloorData, excluded: Set<string>): THREE.Group | null {
  if (data.floor > 5 || !material) return null;
  const group = new THREE.Group(); group.name = 'ruins-kit';
  const fires:RuinsFire[]=[];
  const lowDetail = PerformanceTierDetector.tier === 'low';
  // Chunk each module type for frustum culling on mobile; GPU resources remain cached.
  const batches = new Map<string, { name: string; matrices: THREE.Matrix4[]; colors: THREE.Color[] }>();
  const rotation = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3(), scale = new THREE.Vector3();
  const place = (name: string, x: number, z: number, y = 0, angle = 0, sx = 1, sy = 1, sz = 1, tint = 1) => {
    const key = `${name}:${Math.floor(x / 20)}:${Math.floor(z / 20)}`;
    let batch = batches.get(key);
    if (!batch) { batch = { name, matrices: [], colors: [] }; batches.set(key, batch); }
    rotation.setFromAxisAngle(axis, angle); pos.set(x, y, z); scale.set(sx, sy, sz);
    batch.matrices.push(new THREE.Matrix4().compose(pos, rotation, scale));
    batch.colors.push(new THREE.Color(tint, tint, tint));
  };
  const kind = (x: number, z: number) => data.grid[z]?.[x];
  const walk = (x: number, z: number) => kind(x, z) === BlockKind.Floor || kind(x, z) === BlockKind.Portal;
  const wall = (x: number, z: number) => kind(x, z) === BlockKind.Wall;
  const around = [[0,-1],[1,0],[0,1],[-1,0]];
  const nearRoomAt=(x:number,z:number)=>data.rooms.some(r=>x>=r.x-1&&x<=r.x+r.width&&z>=r.z-1&&z<=r.z+r.depth);
  const highAt=(x:number,z:number)=>{const n=noise(data.seed,x,z);return nearRoomAt(x,z)&&(x+z)%5!==0&&n>.4&&n<.65;};
  const shadowPositions: number[] = [];
  const floorPositions: number[] = [], floorUV: number[] = [];
  const protectedPoints=[data.spawn,data.portal,...data.chests,...data.rooms.flatMap(r=>r.entrances??[]),...(data.merchant?[data.merchant]:[])];
  let floorDecorations=0;
  const shadow = (x: number, z: number, w: number, d: number) => {
    // Low contrast contact shade, not a realtime shadow map.
    shadowPositions.push(x,.009,z, x+w,.009,z, x,.009,z+d, x+w,.009,z, x+w,.009,z+d, x,.009,z+d);
  };
  for (let z = 0; z < data.size; z++) for (let x = 0; x < data.size; x++) {
    const n = noise(data.seed, x, z), k = kind(x,z);
    if (walk(x,z) || k === BlockKind.Obstacle) {
      for(const [dx,dz] of [[0,0],[0,1],[1,0],[1,0],[0,1],[1,1]]) {
        floorPositions.push(x+dx,0,z+dz); floorUV.push((x+dx)/4,(z+dz)/4);
      }
      // Walkable decoration is shallow and hugs room edges; corridors, objectives
      // and the middle of combat spaces stay clear. It never enters collision data.
      if(k===BlockKind.Floor && n < (lowDetail ? .28 : .48)
        && data.rooms.some(r=>x>=r.x&&x<r.x+r.width&&z>=r.z&&z<r.z+r.depth)
        && !protectedPoints.some(p=>Math.hypot(p.x-x,p.z-z)<2.5)) {
        const edge=around.find(([dx,dz])=>wall(x+dx,z+dz));
        const neighbor=around.find(([dx,dz])=>kind(x+dx,z+dz)===BlockKind.Obstacle&&!excluded.has(`${x+dx},${z+dz}`));
        const side=edge??neighbor;
        if(side) {
          const px=x+.5+side[0]*.25,pz=z+.5+side[1]*.25;
          const pick=noise(data.seed^0x52ab,x,z);
          place(pick<.5?'moss':pick<.8?'rubble':'flowers',px,pz,.008,pick*6.28,.85,.7,.85);
          floorDecorations++;
        }
      }
      continue;
    }
    if (!wall(x,z)) continue;
    const edges = around.filter(([dx,dz]) => walk(x+dx,z+dz));
    if (edges.length) {
      const nearRoom = nearRoomAt(x,z);
      const highWall=highAt(x,z);
      place(highWall?'wall_high':'wall',x+.5,z+.5);
      for(const [dx,dz] of [[1,0],[0,1]]) {
        const nx=x+dx,nz=z+dz;
        if(wall(nx,nz)&&around.some(([ax,az])=>walk(nx+ax,nz+az)))
          place('wall_joint',x+.5+dx*.5,z+.5+dz*.5,0,dz?Math.PI/2:0,1,highWall&&highAt(nx,nz)?3.33/2.13:1,1);
      }
      const [dx,dz] = edges[0];
      const angle = Math.atan2(-dx,-dz);
      if(nearRoom && n>.76 && fires.every(f=>Math.hypot(f.x-x-.5,f.z-z-.5)>5)) {
        // Bracket remains on the solid wall; flame projects into the room above head level.
        place('wall_torch',x+.5,z+.5,2.1,angle);
        fires.push({x:x+.5+dx*.8,y:2.51,z:z+.5+dz*.8});
      }
      if (n > (lowDetail ? .82 : .62)) place('ivy',x+.5,z+.5,0,angle);
      const wallTop=highWall?3.34:2.14;
      if(highWall&&n>.48)place('fallen_fragment',x+.5,z+.5,wallTop,n*6.28,.85,.7,.85);
      if (n < .34) place('flowers',x+.5,z+.5,wallTop);
      if(n > (lowDetail ? .8 : .55)) { place('moss',x+.5,z+.5,wallTop); place('shrub',x+.5,z+.5,wallTop,0,.75,.7,.75); }
      shadow(x-.25,z-.1,1.65,1.8);
      // Tall silhouettes outside the walkable boundary; reduced density on corridors.
      if (nearRoom && (x+z)%5 === 0) {
        place('pillar',x+.5,z+.5,0,0,1,1+n*.18,1);
        if (n > .35) place('banner',x+.5,z+.5,.6,angle);
        else place('brazier',x+.5,z+.5,4.96*(1+n*.18));
        place('ivy',x+.5,z+.5,2.1,angle+Math.PI/2,.8,1.1,.8);
      }
    } else if (around.some(([dx,dz]) => walk(x+dx*2,z+dz*2))) {
      place('moss',x+.5,z+.5);
      if(n>.55)place('fallen_fragment',x+.5,z+.5,0,n*6.28,.7,.8,.7);
      if(n<.65) place('shrub',x+.5,z+.5,0,0,1.7,1.6,1.7);
      if(n>.45) place('flowers',x+.5,z+.5,.2,0,1.4,1.4,1.4);
    } else if (n > .94) {
      let clear = true;
      for(let dz=-3;dz<=3;dz++) for(let dx=-3;dx<=3;dx++) if(!wall(x+dx,z+dz)) clear=false;
      if(clear && (x+z)%3===0) place('tree',x+.5,z+.5,0,n*6.28);
    }
  }
  // Cover only the actual obstacles. Breakable supply racks keep their own renderer.
  for(let z=0;z<data.size;z++) for(let x=0;x<data.size;x++) {
    if(kind(x,z)!==BlockKind.Obstacle || excluded.has(`${x},${z}`)) continue;
    place(ruinsObstacleArt(data.rooms.find(r=>roomContainsCell(r,x,z)),x,z),x+.5,z+.5);
    place('ivy',x+.5,z+.5);
    shadow(x-.15,z-.1,1.45,1.6);
  }
  // Detect real three-cell corridor throats. No assumed central room sockets.
  for(const r of data.rooms.filter(r=>r.kind==='start'||r.kind==='sanctuary')) {
    let found=false;
    for(let z=r.z;z<r.z+r.depth&&!found;z++)for(let x=r.x;x<r.x+r.width&&!found;x++) {
      if(!walk(x,z)||!around.some(([dx,dz])=>wall(x+dx,z+dz))
        ||protectedPoints.some(p=>Math.hypot(p.x-x,p.z-z)<3)
        ||fires.some(f=>Math.hypot(f.x-x-.5,f.z-z-.5)<4))continue;
      place('campfire',x+.5,z+.5);
      fires.push({x:x+.5,y:.3,z:z+.5,camp:true}); found=true;
    }
  }
  const arches: {x:number;z:number}[] = [];
  for (const r of data.rooms) {
    const candidates: {x:number;z:number;angle:number}[] = [];
    for(let x=r.x+1;x<r.x+r.width-1;x++) for(const z of [r.z-1,r.z+r.depth]) {
      if(walk(x,z)&&walk(x-1,z)&&walk(x+1,z)&&wall(x-2,z)&&wall(x+2,z)) candidates.push({x,z,angle:0});
    }
    for(let z=r.z+1;z<r.z+r.depth-1;z++) for(const x of [r.x-1,r.x+r.width]) {
      if(walk(x,z)&&walk(x,z-1)&&walk(x,z+1)&&wall(x,z-2)&&wall(x,z+2)) candidates.push({x,z,angle:Math.PI/2});
    }
    for(const p of candidates) {
      if(arches.some(a=>Math.hypot(a.x-p.x,a.z-p.z)<5)) continue;
      arches.push(p);
      place('arch',p.x+.5,p.z+.5,1.2,p.angle);
      for(const side of [-1,1]) {
        const px=p.x+.5+Math.cos(p.angle)*side*2, pz=p.z+.5-Math.sin(p.angle)*side*2;
        // Socket piers replace generic decorations at the same cell, avoiding
        // overlapping shafts and floating braziers from the earlier wall pass.
        for(const name of ['pillar','banner','ivy','brazier']) {
          const batch=batches.get(`${name}:${Math.floor(px/20)}:${Math.floor(pz/20)}`);
          if(!batch) continue;
          for(let i=batch.matrices.length-1;i>=0;i--) {
            const e=batch.matrices[i].elements;
            if(Math.abs(e[12]-px)<.01&&Math.abs(e[14]-pz)<.01) {batch.matrices.splice(i,1);batch.colors.splice(i,1);}
          }
        }
        place('pillar',px,pz,0,0,1,1.25,1);
        place('banner',px,pz,1.4,p.angle);
        place('ivy',px,pz,3.8,p.angle+Math.PI/2,.85,1,.85);
      }
    }
  }
  group.userData.chapterArt=placeRuinsRooms(data,place,(x,z)=>{
    let replaceWall=false;
    for(const batch of batches.values()) {
      if(batch.name==='wall_joint') {
        for(const m of batch.matrices)if(Math.hypot(m.elements[12]-x,m.elements[14]-z)<.6)m.elements[5]=1;
      }
      if(!['wall_high','pillar','banner','ivy','brazier','flowers','moss','shrub','fallen_fragment'].includes(batch.name))continue;
      for(let i=batch.matrices.length-1;i>=0;i--) {
        const e=batch.matrices[i].elements;
        if(Math.abs(e[12]-x)<.01&&Math.abs(e[14]-z)<.01) {
          if(batch.name==='wall_high')replaceWall=true;
          batch.matrices.splice(i,1);batch.colors.splice(i,1);
        }
      }
    }
    if(replaceWall)place('wall',x,z);
  });
  // A shallow foundation reaches past the grid, so distant ruins stand on land.
  const ground=new THREE.Mesh(new THREE.BoxGeometry(data.size+32,3,data.size+32),new THREE.MeshLambertMaterial({color:0x69744c}));
  ground.position.set(data.size/2,-2.5,data.size/2);ground.name='ruins-land-foundation';ground.receiveShadow=true;group.add(ground);
  const baked=bakeScenery(data,fires.map(f=>({...f,color:0xffa94b,strength:f.camp?7:5.5})));
  const litMaterial=material.clone();litMaterial.onBeforeCompile=material.onBeforeCompile;
  const litPaving=pavingMaterial!.clone();
  applySceneryBake(litMaterial,baked,data.size,false);applySceneryBake(litPaving,baked,data.size,false);
  group.userData.bakedScenery=baked;group.userData.litMaterial=litMaterial;
  group.userData.atmosphereLights=fires.map(f=>({...f,color:0xffad53}));
  for(const [key,batch] of batches) {
    if(!batch.matrices.length) continue;
    const interactive = batch.name === 'supply_crate' ? interactionModule('supply_crate') : null;
    const geometry = interactive?.geometry ?? geometries.get(batch.name);
    if(!geometry) throw new Error(`Missing ruins module: ${batch.name}`);
    const mesh = new THREE.InstancedMesh(geometry,interactive?.material ?? litMaterial,batch.matrices.length);
    mesh.name=key;
    mesh.castShadow = !['moss','flowers'].includes(batch.name);
    mesh.receiveShadow = true;
    batch.matrices.forEach((m,i)=>{mesh.setMatrixAt(i,m);mesh.setColorAt(i,batch.colors[i]);});
    mesh.computeBoundingSphere(); group.add(mesh);
  }
  if(floorPositions.length && pavingMaterial) {
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(floorPositions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(floorUV,2));
    geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,litPaving);
    mesh.name='ruins-paving'; mesh.receiveShadow=true; group.add(mesh);
  }
  if(shadowPositions.length) {
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(shadowPositions,3));
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0x31392a,transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide}));
    mesh.name='ruins-contact-shade'; group.add(mesh);
  }
  group.userData.archCount=arches.length;
  group.userData.floorDecorations=floorDecorations;
  if(fires.length) {
    const firelight=new RuinsFirelight(fires,data.rooms);
    group.add(firelight.group);group.userData.firelight=firelight;
  }
  group.userData.fireCount=fires.length;
  return group;
}

export function updateRuinsFirelight(group:THREE.Object3D,elapsed:number):void {
  (group.userData.firelight as RuinsFirelight|undefined)?.update(elapsed,focus.value);
}

/** Release floor-specific buffers only; module geometry/atlas stay warm for next floor. */
export function disposeRuinsKit(group: THREE.Object3D): void {
  (group.userData.bakedScenery as THREE.Texture|undefined)?.dispose();
  (group.userData.litMaterial as THREE.Material|undefined)?.dispose();
  const firelight=group.userData.firelight as RuinsFirelight|undefined;
  if(firelight){firelight.group.removeFromParent();firelight.dispose();}
  group.traverse(node=>{
    if(node instanceof THREE.InstancedMesh) node.dispose();
    else if(node instanceof THREE.Mesh) {
      node.geometry.dispose();
      if(node.material!==pavingMaterial) (node.material as THREE.Material).dispose();
    }
  });
}
