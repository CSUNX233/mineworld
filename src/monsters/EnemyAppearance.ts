import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { trackedTexture } from '../core/AssetLoading';

type Family = 'soldier' | 'caster' | 'guard' | 'brute' | 'beast' | 'slime' | 'spirit' | 'turret';
type Palette = readonly [number, number, number, number];
interface Design { family: Family; palette: Palette; prop?: string; scale?: number }
const ruins: Palette = [0xc3bd99, 0x52624c, 0x705445, 0xffcd74];
const foundry: Palette = [0xa46f49, 0x353c43, 0x654e40, 0xffb54f];
const sanctum: Palette = [0xd8d0b4, 0x467f7a, 0x9f8250, 0x94e6db];
const abyss: Palette = [0xb1a5c5, 0x47435e, 0x73647d, 0xe7b5ff];
const fortress: Palette = [0xd0c9af, 0x465c70, 0x96754b, 0xffd785];

/** Explicit coverage: role silhouettes and props are independent of combat stats. */
export const ENEMY_DESIGNS: Record<string, Design> = {
  slime: { family: 'slime', palette: [0x79a662, 0x3c6550, 0x536740, 0xe5f7a6] },
  zombie: { family: 'soldier', palette: ruins, prop: 'rag' },
  skeleton: { family: 'soldier', palette: [0xdbd1b4, 0x566475, 0x79543e, 0xffc675], prop: 'bow' },
  demon: { family: 'brute', palette: [0xa96761, 0x413c50, 0x6c4652, 0xffb059], prop: 'horns' },
  golem: { family: 'brute', palette: abyss, prop: 'crystals', scale: 1.12 },
  orc_warrior: { family: 'brute', palette: [0x81926a, 0x965a3d, 0x59483e, 0xffd077], prop: 'axe' },
  poison_spitter: { family: 'beast', palette: [0x88975b, 0x425947, 0x635444, 0xc8f376], prop: 'poison' },
  fire_elemental: { family: 'spirit', palette: [0xd0773e, 0x473937, 0x9c5140, 0xffd265], prop: 'flame' },
  shadow_wraith: { family: 'spirit', palette: abyss, prop: 'veil' },
  lich: { family: 'caster', palette: abyss, prop: 'crown' },
  ruin_acolyte: { family: 'caster', palette: ruins, prop: 'staff' },
  ruin_guardian: { family: 'guard', palette: ruins, prop: 'shield' },
  ruin_geomancer: { family: 'caster', palette: ruins, prop: 'stones' },
  valve_overseer: { family: 'brute', palette: foundry, prop: 'valve' },
  ram_beast: { family: 'beast', palette: foundry, prop: 'ram', scale: 1.1 },
  chain_smith: { family: 'brute', palette: foundry, prop: 'chains' },
  prism_sentry: { family: 'turret', palette: foundry, prop: 'prism' },
  sanctum_mourner: { family: 'soldier', palette: sanctum, prop: 'censer' },
  bell_acolyte: { family: 'brute', palette: sanctum, prop: 'bell' },
  epitaph_attendant: { family: 'caster', palette: sanctum, prop: 'tablet' },
  returning_blade: { family: 'soldier', palette: sanctum, prop: 'returning' },
  coffin_bearer: { family: 'brute', palette: sanctum, prop: 'coffin' },
  name_digger: { family: 'soldier', palette: sanctum, prop: 'spade' },
  ash_wanderer: { family: 'soldier', palette: abyss, prop: 'rag' },
  shade_hunter: { family: 'soldier', palette: abyss, prop: 'daggers' },
  facet_mage: { family: 'caster', palette: abyss, prop: 'prism' },
  eye_keeper: { family: 'caster', palette: abyss, prop: 'eye' },
  rift_weaver: { family: 'caster', palette: abyss, prop: 'spindle' },
  crystal_guard: { family: 'guard', palette: abyss, prop: 'crystals' },
  lost_soldier: { family: 'soldier', palette: fortress, prop: 'sword' },
  banner_captain: { family: 'guard', palette: fortress, prop: 'banner' },
  seal_engine: { family: 'brute', palette: fortress, prop: 'seal' },
  seal_scribe: { family: 'caster', palette: fortress, prop: 'scroll' },
  lock_arbalist: { family: 'soldier', palette: fortress, prop: 'crossbow' },
  linked_guard: { family: 'guard', palette: fortress, prop: 'linked' },
  oath_gatekeeper: { family: 'guard', palette: ruins, prop: 'oath', scale: 1.3 },
  furnace_regent: { family: 'brute', palette: foundry, prop: 'furnace', scale: 1.45 },
  bellkeeper: { family: 'caster', palette: sanctum, prop: 'greatbell', scale: 1.45 },
  boss: { family: 'brute', palette: abyss, prop: 'abyss', scale: 1.5 },
  ruins_warden: { family: 'guard', palette: fortress, prop: 'warden', scale: 1.5 },
};

const atlas = trackedTexture(import.meta.env.BASE_URL + 'assets/actors/enemies/material-atlas.png');
atlas.colorSpace = THREE.SRGBColorSpace;
atlas.magFilter = atlas.minFilter = THREE.NearestFilter;
atlas.generateMipmaps = false;
const cache = new Map<string, THREE.BufferGeometry>();
type XYZ = [number, number, number];

/** Bake primitives, palette and atlas UVs once, then share one geometry per part/type. */
class Assembly {
  private pieces: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, color: number, pos: XYZ, size: XYZ = [1, 1, 1], tile = 1, rotation: XYZ = [0, 0, 0]): void {
    if (g.index) { const original = g; g = g.toNonIndexed(); original.dispose(); }
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...size));
    g.applyMatrix4(matrix);
    const c = new THREE.Color(color), colors = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const uv = g.getAttribute('uv');
    // Inset UVs avoid neighbouring tile bleeding.
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (tile % 2) * .5 + .01 + uv.getX(i) * .48, (tile < 2 ? .5 : 0) + .01 + uv.getY(i) * .48);
    this.pieces.push(g);
  }
  box(size: XYZ, pos: XYZ, color: number, tile = 1, rotation: XYZ = [0, 0, 0]): void { this.add(new THREE.BoxGeometry(1, 1, 1), color, pos, size, tile, rotation); }
  stone(size: XYZ, pos: XYZ, color: number, tile = 2): void { this.add(new THREE.IcosahedronGeometry(1, 0), color, pos, size, tile); }
  cone(radius: number, height: number, pos: XYZ, color: number, rotation: XYZ = [0, 0, 0]): void { this.add(new THREE.ConeGeometry(radius, height, 5), color, pos, [1, 1, 1], 2, rotation); }
  ring(radius: number, tube: number, pos: XYZ, color: number, rotation: XYZ = [0, 0, 0]): void { this.add(new THREE.TorusGeometry(radius, tube, 4, 8), color, pos, [1, 1, 1], 1, rotation); }
  cylinder(top: number, bottom: number, height: number, pos: XYZ, color: number): void { this.add(new THREE.CylinderGeometry(top, bottom, height, 6), color, pos); }
  finish(): THREE.BufferGeometry {
    const geometry = mergeGeometries(this.pieces, false)!;
    this.pieces.forEach(g => g.dispose());
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.userData.sharedEnemyGeometry = true;
    return geometry;
  }
}

function bodyGeometry(id: string, d: Design): THREE.BufferGeometry {
  const a = new Assembly(), [plate, cloth, leather, glow] = d.palette;
  const dark = 0x252b36, bone = 0xe0d3ad;
  const heavy = d.family === 'brute' || d.family === 'guard';
  const w = heavy ? .68 : .48;
  if (d.family === 'slime') {
    a.stone([.58,.42,.56],[0,.42,0],plate,3);
    a.stone([.27,.18,.26],[.16,.7,-.08],0xb3c984,3);
    for (const x of [-.18,.18]) a.box([.12,.13,.035],[x,.5,.48],dark);
    a.box([.15,.04,.04],[0,.32,.51],dark);
  } else if (d.family === 'beast') {
    a.stone([.62,.48,.86],[0,.66,-.06],cloth,3);
    a.stone([.55,.39,.39],[0,.69,.64],plate,3);
    for (const x of [-.44,.44]) for (const z of [-.52,.42]) {
      a.box([.24,.36,.23],[x,.23,z],leather,3,[0,0,x*.3]);
      a.box([.25,.13,.36],[x,.07,z+.09],plate);
    }
    for (const x of [-.23,.23]) a.box([.12,.07,.08],[x,.81,.98],glow);
    if (d.prop === 'ram') {
      a.box([1,.3,.23],[0,.69,1],plate);
      for (const x of [-.48,.48]) a.cone(.18,.65,[x,.85,.95],bone,[Math.PI/2,0,0]);
      for (const z of [-.48,-.05,.38]) a.box([.85,.15,.25],[0,1.06,z],plate);
    } else {
      for (const x of [-.32,.32]) a.stone([.26,.3,.4],[x,1,-.3],glow,3);
      a.cylinder(.19,.25,.28,[0,.57,.94],leather);
      a.box([.26,.12,.04],[0,.6,1.1],dark);
    }
  } else if (d.family === 'turret') {
    for (let i=0;i<3;i++) { const t=i*Math.PI*2/3;
      a.box([.15,.64,.18],[Math.sin(t)*.38,.33,Math.cos(t)*.38],plate,1,[Math.cos(t)*.45,0,-Math.sin(t)*.45]);
      a.box([.32,.13,.35],[Math.sin(t)*.5,.065,Math.cos(t)*.5],leather);
    }
    a.cylinder(.4,.5,.3,[0,.8,0],plate);
    a.stone([.45,.47,.38],[0,1.17,0],cloth);
    a.ring(.29,.095,[0,1.16,.36],plate);
    a.stone([.22,.22,.12],[0,1.16,.4],0xa9e5f1);
  } else if (d.family === 'spirit') {
    a.cone(.5,1.1,[0,1,0],cloth,[Math.PI,0,0]);
    a.stone([.4,.5,.33],[0,1.5,0],plate,3);
    for (const x of [-.48,.48]) a.stone([.16,.31,.17],[x,1.17,.1],plate,3);
    for (const x of [-.13,.13]) a.box([.095,.09,.05],[x,1.61,.29],glow);
    for (const x of [-.27,0,.27]) a.cone(.16,.58,[x,1.95-Math.abs(x),-.04],d.prop==='flame'?glow:plate);
  } else {
    // Tapered chest, angular mask, layered cloth: never a cube-headed humanoid.
    a.add(new THREE.CylinderGeometry(w*.75,w*.6,.62,4),cloth,[0,1.08,0],[1,1,.65],0,[0,Math.PI/4,0]);
    a.box([w+.05,.12,.35],[0,.8,0],leather,0);
    a.box([.16,.15,.06],[0,.8,.21],plate);
    if (d.family === 'caster') {
      a.add(new THREE.CylinderGeometry(.27,.43,.66,6),cloth,[0,.48,0],[1,1,.8],0);
      for (const x of [-.21,0,.21]) a.box([.13,.44,.06],[x,.52,.32],plate,0,[0,0,-x*.22]);
      a.cone(.36,.47,[0,1.87,-.02],cloth);
      a.box([.57,.83,.1],[0,1.11,-.24],cloth,0);
    } else for (const x of [-.19,.19]) {
      a.box([heavy?.24:.18,.51,.22],[x,.43,0],cloth,0,[0,0,-x*.18]);
      a.box([heavy?.29:.23,.2,.38],[x,.13,.08],leather);
      a.stone([.16,.14,.13],[x,.61,.12],plate);
      a.box([.17,.38,.08],[x,.65,.23],cloth,0,[0,0,-x*.5]);
    }
    a.stone([.25,.31,.23],[0,1.68,.025],plate);
    a.box([.3,.1,.045],[0,1.7,.23],dark);
    for (const x of [-.095,.095]) a.box([.054,.049,.052],[x,1.7,.25],glow);
    a.cone(.11,.25,[0,1.53,.24],plate,[Math.PI,0,0]);
    for (const s of [-1,1]) {
      a.stone([heavy?.28:.19,.19,.25],[s*(w*.5+.11),1.35,0],plate);
      a.box([heavy?.25:.16,.42,.19],[s*(w*.5+.14),1.08,.035],cloth,0,[.12,0,s*.12]);
      a.box([heavy?.27:.18,.22,.23],[s*(w*.5+.17),.86,.1],leather);
      a.stone([.115,.14,.12],[s*(w*.5+.17),.68,.12],plate,2);
    }
    if (heavy) {
      a.box([w*.83,.32,.09],[0,1.22,.24],plate);
      a.stone([.14,.15,.05],[0,1.24,.31],glow);
    }
  }
  const prop = d.prop;
  const staff = ['staff','stones','crown','tablet','eye','spindle','scroll','prism','greatbell'].includes(prop ?? '') && d.family !== 'turret';
  if (staff) {
    a.box([.07,1.65,.07],[.59,1.04,.17],leather);
    a.ring(.2,.045,[.59,1.93,.17],plate);
    a.stone([.12,.22,.12],[.59,1.94,.17],glow);
  }
  if (['sword','axe','spade','daggers','warden'].includes(prop ?? '')) {
    const x=.6;
    a.box([.09,.48,.1],[x,.69,.23],leather);
    a.box([prop==='spade'?.28:.13,.66,.065],[x,1.22,.23],bone);
    a.box([.32,.07,.1],[x,.9,.23],plate);
    if(prop==='axe') a.box([.48,.33,.1],[x+.12,1.4,.23],plate);
    if(prop==='daggers') a.box([.09,.52,.08],[-x,1.02,.3],bone,1,[.4,0,.22]);
  }
  if (prop==='bow' || prop==='crossbow') {
    a.box([.12,.13,.7],[.56,1.04,.36],leather);
    if(prop==='bow') {
      a.ring(.4,.055,[.56,1.1,.25],leather,[0,Math.PI/2,0]);
      a.box([.022,.79,.02],[.56,1.1,.26],bone);
      for(let i=0;i<3;i++) a.box([.05,.08,.04],[-.12+i*.12,1.7,.245],dark);
    } else a.box([.8,.075,.11],[.56,1.08,.55],plate);
  }
  if (d.family==='guard' && prop!=='oath') {
    a.box([.62,.96,.14],[-.49,1,.35],plate);
    a.box([.43,.69,.06],[-.49,1,.44],cloth);
    a.box([.07,.76,.045],[-.49,1,.49],glow);
    if(prop==='linked') for(const y of [.73,1.13]) a.ring(.12,.035,[-.83,y,.42],leather);
  }
  if (['horns','abyss'].includes(prop ?? '')) for(const s of [-1,1]) {
    a.cone(.17,.56,[s*.3,2.02,0],plate,[0,0,-s*.65]);
    a.cone(.16,.48,[s*.72,1.55,-.1],plate,[0,0,-s*.85]);
  }
  if (['crystals','stones','abyss'].includes(prop ?? '')) for(let i=0;i<3;i++) {
    a.cone(.19,.65+i*.12,[(i-1)*.3,1.57,-.29],i===1?glow:plate,[0,0,(i-1)*-.45]);
  }
  if (['rag','veil','crown','daggers','greatbell','abyss','warden'].includes(prop ?? '')) {
    a.box([.6,.82,.07],[0,1.12,-.28],cloth,0,[.16,0,0]);
    for(const x of [-.23,0,.23]) a.cone(.14,.4,[x,.65,-.35],cloth,[Math.PI,0,0]);
  }
  if (['banner','oath','warden'].includes(prop ?? '')) {
    a.box([.055,1.65,.055],[-.23,1.73,-.25],leather);
    a.box([.7,.54,.05],[.1,2.19,-.26],prop==='oath'?0x985247:cloth,0);
    a.box([.08,.4,.06],[.1,2.21,-.225],plate);
  }
  if (['crown','warden','greatbell'].includes(prop ?? '')) for(const x of [-.2,0,.2]) a.cone(.08,.27,[x,1.98,0],leather);
  if (prop==='valve' || prop==='furnace') {
    for(const x of prop==='furnace'?[-.43,.43]:[0]) {
      a.cylinder(.21,.21,1.05,[x,1.29,-.35],plate);
      a.cylinder(.12,.12,.25,[x,1.94,-.35],dark);
    }
    if(prop==='valve') {a.box([.07,1.25,.07],[.62,1.25,.15],plate);a.ring(.29,.065,[.62,1.91,.15],glow);}
    else {a.ring(.38,.13,[0,1.1,.31],leather); for(const x of [-.77,.77]) a.box([.4,.42,.4],[x,.78,.13],plate);}
  }
  if(prop==='chains') for(const x of [-.58,.58]) {
    a.ring(.23,.07,[x,1.42,0],plate);
    for(let i=0;i<3;i++) a.ring(.1,.035,[x,1.14-i*.17,.2],leather,[0,i%2*Math.PI/2,0]);
  }
  if(prop==='bell' || prop==='greatbell') {
    const big=prop==='greatbell';
    a.cylinder(big?.4:.2,big?.58:.3,big?.95:.5,[big?0:-.55,big?1.35:1,-.35],leather);
    a.ring(big?.52:.28,.045,[big?0:-.55,big?.91:.76,-.35],plate,[Math.PI/2,0,0]);
    a.box([.07,1.2,.08],[.54,1,.2],leather);a.box([.43,.23,.26],[.54,1.63,.2],plate);
  }
  if(prop==='coffin') {
    a.box([.72,1.38,.35],[0,1.25,-.37],leather);
    a.box([.57,1.17,.07],[0,1.25,-.58],plate);
    a.box([.075,.92,.05],[0,1.25,-.63],cloth);
    a.box([.37,.07,.05],[0,1.51,-.63],cloth);
  }
  if(['tablet','scroll','seal'].includes(prop ?? '')) {
    a.box([.36,.54,.13],[-.57,1.13,.27],plate,2,[0,0,-.1]);
    for(let y=0;y<3;y++) a.box([.24,.035,.025],[-.57,.99+y*.12,.35],leather);
    if(prop==='seal') a.cylinder(.33,.33,.35,[.6,.65,.2],plate);
  }
  if(prop==='eye') {a.ring(.22,.06,[-.55,1.42,.25],leather);a.stone([.15,.13,.1],[-.55,1.42,.28],glow);}
  if(prop==='spindle') for(const x of [-.4,.4]) a.ring(.23,.035,[x,1.64,-.13],plate,[0,Math.PI/3,0]);
  if(prop==='censer') {a.box([.035,.48,.035],[.57,1.03,.25],leather);a.stone([.16,.19,.16],[.57,.69,.25],leather);}
  if(prop==='greatbell') {
    // The bell silhouette sits above the shoulders so it reads from the front too.
    a.cylinder(.26,.45,.62,[0,1.91,-.06],leather);
    a.ring(.42,.055,[0,1.62,-.06],plate,[Math.PI/2,0,0]);
    a.box([.27,.11,.045],[0,1.73,.34],dark);
    a.box([.12,.045,.05],[0,1.73,.37],glow);
    for(const s of [-1,1]) {
      a.box([.07,.98,.07],[s*.57,1.69,-.3],plate);
      a.cylinder(.09,.16,.29,[s*.57,2.2,-.3],leather);
    }
  }
  if(prop==='abyss') for(const s of [-1,1]) {
    a.box([.68,.84,.075],[s*.6,1.28,-.37],cloth,0,[.1,s*.35,-s*.38]);
    a.cone(.25,.78,[s*.95,.94,-.48],plate,[Math.PI,0,-s*.25]);
    a.stone([.16,.14,.12],[s*.84,1.51,-.32],glow);
  }
  if(prop==='warden') for(const s of [-1,1]) {
    a.box([.3,.5,.28],[s*.57,1.58,-.02],plate);
    a.box([.13,.32,.035],[s*.57,1.59,.145],cloth);
    a.cone(.12,.36,[s*.22,2.04,.02],plate);
  }
  const geometry = a.finish();
  geometry.scale(d.scale ?? 1,d.scale ?? 1,d.scale ?? 1);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

function material(flash: { value: number }): THREE.MeshPhongMaterial {
  const m = new THREE.MeshPhongMaterial({ map: atlas, vertexColors: true, flatShading: true, shininess: 12, specular: 0x302d29 });
  m.userData.enemyFlash = flash;
  m.onBeforeCompile = shader => {
    shader.uniforms.enemyFlash = flash;
    shader.fragmentShader = 'uniform float enemyFlash;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace(/vMapUv/g, '((floor(vMapUv * 64.0) + 0.5) / 64.0)'));
    shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), enemyFlash);');
  };
  m.customProgramCacheKey = () => 'pixel-enemy-white-flash-v1';
  return m;
}

export function createEnemyAppearance(id: string): THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhongMaterial> {
  const d = ENEMY_DESIGNS[id];
  if (!d) throw new Error(`Missing enemy design: ${id}`);
  if (!cache.has(id)) cache.set(id, bodyGeometry(id,d));
  const flash = { value: 0 };
  const mesh = new THREE.Mesh(cache.get(id)!, material(flash));
  mesh.name = 'enemy-model'; mesh.userData.enemyAppearance = true;
  mesh.castShadow = mesh.receiveShadow = true;
  const part = (name: string, build: (a: Assembly) => void, pos: XYZ) => {
    const key = id+':'+name;
    if (!cache.has(key)) { const a = new Assembly(); build(a); cache.set(key,a.finish()); }
    const child = new THREE.Mesh(cache.get(key)!,material(flash));
    child.name=name; child.position.set(...pos); child.castShadow=child.receiveShadow=true;mesh.add(child); return child;
  };
  if(id==='oath_gatekeeper') {
    part('oath-shield',a=>{a.box([.9,1.25,.18],[0,0,0],d.palette[0]);a.box([.68,1,.04],[0,0,.115],d.palette[1]);a.box([.09,.88,.05],[0,0,.15],d.palette[3]);},[-.75,1.15,.65]);
    part('oath-sword',a=>{a.box([.16,1.4,.1],[0,.2,0],0xe0d3ad);a.box([.1,.38,.14],[0,-.62,0],d.palette[2]);a.box([.44,.09,.15],[0,-.4,0],d.palette[2]);},[.8,1.2,.55]);
  }
  if(id==='furnace_regent') part('furnace-core',a=>a.stone([.32,.32,.15],[0,0,0],0xffffff),[0,1.6,.64]);
  if(id==='returning_blade') part('held-blade',a=>a.add(new THREE.TorusGeometry(.44,.075,4,10,Math.PI*1.5),d.palette[0],[0,0,0]),[.52,1.12,.38]);
  return mesh;
}

export function setEnemyOpacity(mesh: THREE.Object3D, opacity: number): void {
  mesh.traverse(child => { if (!(child instanceof THREE.Mesh)) return;
    const m = child.material as THREE.MeshPhongMaterial;
    m.transparent=opacity<1; m.opacity=opacity; m.depthWrite=opacity===1;
  });
}
