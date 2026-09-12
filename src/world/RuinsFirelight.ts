import * as THREE from 'three';
import { PerformanceTierDetector } from '../core/Performance';
import { combatTexture } from '../ui/CombatArt';

export interface RuinsFire { x: number; y: number; z: number; camp?: boolean }

/** Fixed scenery positions, a small shared light pool, no shadow maps per flame. */
export class RuinsFirelight {
  readonly group = new THREE.Group();
  private flames: THREE.InstancedMesh;
  private lights: THREE.PointLight[];
  private slots: number[];
  private nextSelection = 0;
  private matrix = new THREE.Matrix4();
  private quaternion = new THREE.Quaternion();
  private position = new THREE.Vector3();
  private scale = new THREE.Vector3();

  constructor(private sources: RuinsFire[]) {
    this.group.name='ruins-firelight';
    const geometry=new THREE.PlaneGeometry(1,1);
    const material=new THREE.MeshBasicMaterial({map:combatTexture('effects','fire'),transparent:true,opacity:.42,alphaTest:.03,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
    this.flames=new THREE.InstancedMesh(geometry,material,sources.length*3);
    this.flames.name='decorative-flames';
    this.flames.frustumCulled=false;
    this.group.add(this.flames);
    const count=PerformanceTierDetector.tier==='low'?1:2;
    this.lights=Array.from({length:count},()=>{
      const light=new THREE.PointLight(0xffa94b,0,5.2,2);
      light.castShadow=false; this.group.add(light); return light;
    });
    this.slots=Array(count).fill(-1);
    this.update(0,new THREE.Vector3());
  }

  update(elapsed:number, viewer:THREE.Vector3):void {
    if(elapsed>=this.nextSelection || elapsed===0) {
      this.nextSelection=elapsed+.3;
      const nearest=this.sources.map((s,i)=>({i,d:(s.x-viewer.x)**2+(s.z-viewer.z)**2}))
        .filter(s=>s.d<14*14).sort((a,b)=>a.d-b.d);
      this.slots=this.lights.map((_,i)=>nearest[i]?.i??-1);
    }
    this.sources.forEach((source,i)=>{
      const wave=Math.sin(elapsed*7.1+i*2.3)*.06+Math.sin(elapsed*11.7+i)*.025;
      const size=source.camp?1.3:1;
      for(let j=0;j<3;j++) {
        const width=(.48+wave)*size, height=(.62+wave)*size;
        this.position.set(source.x+Math.sin(elapsed*3+i+j)*.012,source.y+height/2-.05,source.z);
        this.quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,j*Math.PI/3);
        this.scale.set(width,height,width);
        this.matrix.compose(this.position,this.quaternion,this.scale);
        this.flames.setMatrixAt(i*3+j,this.matrix);
      }
    });
    this.flames.instanceMatrix.needsUpdate=true;
    this.lights.forEach((light,i)=>{
      const index=this.slots[i],source=this.sources[index];
      if(!source){light.intensity=0;return;}
      light.position.set(source.x,source.y+(source.camp?.45:.2),source.z);
      light.intensity=(source.camp?3:3.4)*(1+Math.sin(elapsed*7.1+index*2.3)*.045);
    });
  }

  dispose():void {
    this.flames.dispose();this.flames.geometry.dispose();
    (this.flames.material as THREE.Material).dispose();
    this.lights.forEach(light=>light.dispose());
  }
}
