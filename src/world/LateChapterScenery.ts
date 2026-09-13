import * as THREE from 'three';
import type { FloorData } from '../types';
import { BlockKind } from './Block';
import { deepChapterKit } from './DeepChapterAssets';
import { ChapterLightPool, type ChapterLightSource } from './ChapterLightPool';
import { bakeScenery, applySceneryBake } from './SceneryBake';
import { lateGroundHeight } from './LateElevation';
import { hasLateContent } from '../data/LateChapter';

/** Instances and merged floor chunks share one atlas; geometry never changes collision cells. */
export function createLateScenery(data:FloorData,excluded:Set<string>):THREE.Group|null {
  if(!hasLateContent(data))return null;
  const kit=deepChapterKit(data.floor);if(!kit)return null;
  const abyss=data.floor<=20,group=new THREE.Group();group.name='deep-chapter-scenery';
  const material=kit.material.clone();material.onBeforeCompile=kit.material.onBeforeCompile;
  material.emissive.setHex(abyss?0x393040:0x08090b);material.emissiveIntensity=abyss?.38:.15;
  const ground=new THREE.MeshLambertMaterial({map:kit.material.map});
  const glow=new THREE.MeshBasicMaterial({color:abyss?0xffc675:0xffd894,toneMapped:false});
  const sources:ChapterLightSource[]=[];
  const batches=new Map<string,THREE.Matrix4[]>(),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),s=new THREE.Vector3(),p=new THREE.Vector3();
  const put=(name:string,x:number,z:number,y=0,a=0,sx=1,sy=1,sz=1)=>{
    const key=`${name}:${Math.floor(x/20)}:${Math.floor(z/20)}`;let list=batches.get(key);if(!list){list=[];batches.set(key,list);}
    list.push(matrix.compose(p.set(x,y,z),q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,a),s.set(sx,sy,sz)).clone());
  };
  const walk=(x:number,z:number)=>[BlockKind.Floor,BlockKind.Portal,BlockKind.Obstacle].includes(data.grid[z]?.[x]);
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  const safe=(x:number,z:number)=>![data.spawn,data.portal,...data.chests,...(data.merchant?[data.merchant]:[]),...data.rooms.flatMap(r=>r.entrances??[])].some(c=>Math.hypot(c.x+.5-x,c.z+.5-z)<2.5);
  const floors=new Map<string,{pos:number[];uv:number[]}>();let decor=0,wallCount=0;
  for(let z=0;z<data.size;z++)for(let x=0;x<data.size;x++){
    if(walk(x,z)){
      const key=`${Math.floor(x/20)}:${Math.floor(z/20)}`;let f=floors.get(key);if(!f){f={pos:[],uv:[]};floors.set(key,f);}
      // Quarter-cell triangles follow broad stepped platforms without intersecting flat floor.
      const elevated=lateGroundHeight(data,x+.5,z+.5)>0||dirs.some(([dx,dz])=>lateGroundHeight(data,x+dx,z+dz)>0),n=elevated?4:1;
      for(let iz=0;iz<n;iz++)for(let ix=0;ix<n;ix++)for(const [dx,dz] of [[0,0],[0,1],[1,0],[1,0],[0,1],[1,1]]){
        const px=x+(ix+dx)/n,pz=z+(iz+dz)/n;
        f.pos.push(px,lateGroundHeight(data,px,pz),pz);
        f.uv.push(.025+((x%4)+(ix+dx)/n)/4*.44,.025+((z%4)+(iz+dz)/n)/4*.44);
      }
      if(data.grid[z][x]===BlockKind.Obstacle&&!excluded.has(`${x},${z}`))put('pillar',x+.5,z+.5,0,0,.7,.5,.7);
      const edge=dirs.find(([dx,dz])=>data.grid[z+dz]?.[x+dx]===BlockKind.Wall);
      const noise=((Math.imul(x+13,73856093)^Math.imul(z+7,19349663)^data.seed)>>>0)%100;
      if(edge&&safe(x+.5,z+.5)&&noise<16){put(noise<10?'rubble':'grass',x+.5+edge[0]*.28,z+.5+edge[1]*.28,0,noise,.65,.65,.65);decor++;}
      continue;
    }
    const edges=dirs.filter(([dx,dz])=>walk(x+dx,z+dz));if(!edges.length)continue;
    put('wall',x+.5,z+.5);wallCount++;
    put('wall',x+.5,z+.5,-6,0,1,6/(abyss?3.2:3.4),1);
    const [dx,dz]=edges[0],a=Math.atan2(-dx,-dz);
    if((x+z)%6===0&&safe(x+.5,z+.5))put('pillar',x+.5,z+.5,0,a);
    if((x+z)%8===3&&safe(x+.5,z+.5))put('wall_banner',x+.5+dx*.59,z+.5+dz*.59,1.4,a,.7,.8,.7);
    if((x+z)%7===2&&safe(x+.5,z+.5)){
      const lx=x+.5+dx*.58,lz=z+.5+dz*.58;
      put('lamp',lx,lz,1.05,a,.6,.6,.6);put('lamp_glow',lx,lz,1.05,a,.6,.6,.6);
      sources.push({x:lx,y:1.8,z:lz,color:abyss?0xffc070:0xffd694,strength:8});
    }
  }
  // Frame actual wide openings, grouping adjacent entrance cells into one opening.
  let arches=0;
  for(const r of data.rooms){
    const used:{x:number;z:number}[]=[];
    for(const c of r.entrances??[]){
      if(used.some(p=>Math.hypot(p.x-c.x,p.z-c.z)<6))continue;
      const horizontal=Math.abs(c.z-r.z)<2||Math.abs(c.z-(r.z+r.depth-1))<2;
      const a=horizontal?0:Math.PI/2;
      let cx=c.x+.5,cz=c.z+.5;
      // Only install posts in solid cells, otherwise keep doorway clear.
      const distances=[-1,1].map(sign=>{
        for(let d=1;d<=8;d++){const x=Math.floor(cx+Math.cos(a)*sign*d),z=Math.floor(cz-Math.sin(a)*sign*d);if(data.grid[z]?.[x]===BlockKind.Wall)return d;}return 0;
      });
      if(distances.some(d=>d===0)||distances[0]+distances[1]<6||distances[0]+distances[1]>9||used.length>=2)continue;
      const shift=(distances[1]-distances[0])/2;
      cx+=Math.cos(a)*shift;cz-=Math.sin(a)*shift;
      put('arch',cx,cz,0,a,(distances[0]+distances[1])/5.9,1,1);used.push({x:cx,z:cz});arches++;
    }
    const cx=r.x+r.width/2;
    // Rear landmarks on verified non-walkable space, with facing into the room.
    if(r.kind==='exit'||r.template?.includes('eye')||r.template?.includes('seal')||r.template?.includes('trial')){
      const z=r.z-2;
      if(Array.from({length:9},(_,i)=>Math.floor(cx)-4+i).every(x=>!walk(x,z))){
        put('monument',cx,z,0,0,r.kind==='exit'?1.6:1,r.kind==='exit'?1.5:1,1);
        put('gate_facade',cx,z,0,0,r.kind==='exit'?1.5:1,r.kind==='exit'?1.3:1,1);
      }
    }
    if(r.template?.endsWith('trial')){
      const z=r.center?.z??r.z+r.depth/2,y=lateGroundHeight(data,cx,z);
      put('plinth',cx,z,y,0,.8,.5,.8);
      put(abyss?'enemy_crystal_guard':'enemy_linked_guard',cx,z,y+.25,0,1.25,1.25,1.25);
    }
    // Low-contrast inlaid octagon identifies each courtyard, never a danger telegraph.
    if(!['start','treasure','sanctuary'].includes(r.kind??'')){
      const radius=Math.min(r.width,r.depth)*.28,cz=r.z+r.depth/2;
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4,b=(i+1)*Math.PI/4;
        const x1=cx+Math.sin(a)*radius,z1=cz+Math.cos(a)*radius,x2=cx+Math.sin(b)*radius,z2=cz+Math.cos(b)*radius;
        const mx=(x1+x2)/2,mz=(z1+z2)/2;
        put('inlay',mx,mz,lateGroundHeight(data,mx,mz)+.008,Math.atan2(x2-x1,z2-z1),1,1,Math.hypot(x2-x1,z2-z1));
      }
    }
  }
  for(let i=0;i<8;i++){const side=i%4,along=data.size*(.2+Math.floor(i/4)*.55);put('distant_tower',side===0?-7:side===1?data.size+7:along,side===2?-7:side===3?data.size+7:along,-1,i,.9,1+i%3*.3,.9);}
  const baked=bakeScenery(data,sources);applySceneryBake(material,baked,data.size,false);applySceneryBake(ground,baked,data.size,false);
  for(const [key,f] of floors){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(f.pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(f.uv,2));g.computeVertexNormals();const m=new THREE.Mesh(g,ground);m.name=`late-floor:${key}`;m.receiveShadow=true;group.add(m);}
  for(const [key,items]of batches){const name=key.split(':')[0],g=kit.geometries.get(name);if(!g)throw new Error(`Missing late module ${name}`);const m=new THREE.InstancedMesh(g,name.endsWith('_glow')?glow:material,items.length);items.forEach((matrix,i)=>m.setMatrixAt(i,matrix));m.name=key;m.computeBoundingSphere();m.castShadow=!name.endsWith('_glow');m.receiveShadow=true;group.add(m);}
  const lightPool=new ChapterLightPool(sources,data.rooms);group.add(lightPool.group);
  group.userData.lightPool=lightPool;group.userData.bakedScenery=baked;group.userData.ownedMaterials=[material,ground,glow];group.userData.atmosphereLights=sources;
  group.userData.chapterArt={floor:data.floor,theme:data.theme.name,rooms:data.rooms.map(r=>({id:r.id,template:r.template})),arches,wallCount,decorations:decor};
  return group;
}
