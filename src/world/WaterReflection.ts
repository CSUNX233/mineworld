import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { PerformanceTierDetector } from '../core/Performance';

/** A shared horizontal planar reflection, not a painted environment image. */
export class WaterReflection {
  readonly texture: THREE.Texture;
  readonly matrix = new THREE.Matrix4();
  readonly ready = {value: 0};
  private reflector: Reflector;
  private nextFrame = 0;
  private inverse = new THREE.Matrix4();
  private lastCamera = new THREE.Matrix4();
  private lastProjection = new THREE.Matrix4();
  private interval: number;
  constructor(private surface: THREE.Mesh, private pockets: {x:number;z:number}[]) {
    const low=PerformanceTierDetector.tier==='low',resolution=low?128:256;
    this.interval=low?.25:.1;
    this.reflector=new Reflector(new THREE.PlaneGeometry(1,1),{textureWidth:resolution,textureHeight:resolution,multisample:0,clipBias:.002});
    this.reflector.rotation.x=-Math.PI/2;this.reflector.position.y=-.55;this.reflector.updateMatrixWorld(true);
    this.inverse.copy(this.reflector.matrixWorld).invert();
    // Byte render targets work on mobile WebGL2 without requiring float colour buffers.
    this.reflector.getRenderTarget().texture.type=THREE.UnsignedByteType;
    this.texture=this.reflector.getRenderTarget().texture;
  }
  update(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.Camera,now:number,dynamicScene=true):void{
    if(now<this.nextFrame)return;this.nextFrame=now+this.interval;
    camera.updateMatrixWorld();
    if(!dynamicScene&&this.ready.value&&this.lastCamera.equals(camera.matrixWorld)&&this.lastProjection.equals(camera.projectionMatrix))return;
    if(!this.pockets.some(p=>(p.x-camera.position.x)**2+(p.z-camera.position.z)**2<28**2)){this.ready.value=0;return;}
    camera.updateMatrixWorld();scene.updateMatrixWorld();
    const visible=this.surface.visible,shadowUpdate=renderer.shadowMap.needsUpdate;
    // The receiver must not sample the render target while it is being written.
    this.surface.visible=false;renderer.shadowMap.needsUpdate=false;
    try{
      this.reflector.onBeforeRender(renderer,scene,camera,this.reflector.geometry,this.reflector.material as THREE.Material,null!);
      const material=this.reflector.material as THREE.ShaderMaterial;
      this.matrix.copy(material.uniforms.textureMatrix.value).multiply(this.inverse);this.ready.value=1;
      this.lastCamera.copy(camera.matrixWorld);this.lastProjection.copy(camera.projectionMatrix);
    }finally{this.surface.visible=visible;renderer.shadowMap.needsUpdate=shadowUpdate;}
  }
  dispose():void{this.reflector.geometry.dispose();this.reflector.dispose();}
}

export function updateWaterReflection(world:THREE.Object3D,renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.Camera,now:number,dynamicScene=true):void{
  const atmosphere=world.children.find(child=>child.name==='chapter-atmosphere');
  (atmosphere?.userData.waterReflection as WaterReflection|undefined)?.update(renderer,scene,camera,now,dynamicScene);
}
