import * as THREE from 'three';
import { interactionModule } from './InteractionProps';
import type { PortalPlacement } from './PortalPlacement';

export class PortalVisual {
  readonly group=new THREE.Group();
  private membrane:THREE.Mesh;
  private runes:THREE.Mesh;
  private light=new THREE.PointLight(0x63b9ff,0,7,2);
  private particles:THREE.Points;
  private active=false;
  private fade=0;
  constructor(readonly placement:PortalPlacement,floor:number){
    this.group.name='ancient-waygate';this.group.position.set(placement.x,0,placement.z);this.group.rotation.y=placement.angle;
    const frame=interactionModule('portal_frame',floor),runes=interactionModule('portal_runes',floor);
    if(!frame||!runes)throw new Error('Portal model not preloaded');
    const stone=new THREE.Mesh(frame.geometry,frame.material);stone.castShadow=stone.receiveShadow=true;this.group.add(stone);
    this.runes=new THREE.Mesh(runes.geometry,new THREE.MeshBasicMaterial({color:0x615b45}));this.group.add(this.runes);
    const shape=new THREE.Shape();shape.moveTo(-.66,.17);shape.lineTo(.66,.17);shape.lineTo(.66,2.21);
    for(const [x,y] of [[.49,2.38],[.33,2.55],[.16,2.71],[0,2.87],[-.16,2.71],[-.33,2.55],[-.49,2.38],[-.66,2.21]])shape.lineTo(x,y);shape.closePath();
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{time:{value:0},strength:{value:0}},
      vertexShader:`varying vec2 gate;void main(){gate=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`uniform float time;uniform float strength;varying vec2 gate;
        void main(){vec2 p=floor(vec2(gate.x,gate.y-1.5)*36.0)/36.0;float a=atan(p.y,p.x);float r=length(p);
          float spiral=.5+.5*sin(a*2.0-r*13.0+time*.85);float width=min(.66,max(.025,2.87-gate.y));
          float edge=1.0-smoothstep(.015,.085,min(width-abs(gate.x),gate.y-.17));
          vec3 color=mix(vec3(.13,.16,.65),vec3(.21,.43,1.0),spiral*.6);color=mix(color,vec3(.35,.85,1.0),edge);
          gl_FragColor=vec4(color,strength*(.66+edge*.24));
          #include <colorspace_fragment>
        }`});
    this.membrane=new THREE.Mesh(new THREE.ShapeGeometry(shape),material);this.membrane.position.z=.045;this.membrane.visible=false;this.group.add(this.membrane);
    this.light.position.set(0,1.5,.75);this.light.castShadow=false;this.group.add(this.light);
    const positions=new Float32Array(32*3),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const motes=new THREE.PointsMaterial({color:0x95d8ff,size:.045,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
    this.particles=new THREE.Points(geometry,motes);this.particles.frustumCulled=false;this.particles.visible=false;this.group.add(this.particles);
  }
  setActive(active:boolean):void{this.active=active;this.membrane.visible=active||this.fade>.001;this.particles.visible=this.membrane.visible;}
  update(dt:number,elapsed:number):void{
    this.fade=THREE.MathUtils.damp(this.fade,this.active?1:0,6,dt);
    const material=this.membrane.material as THREE.ShaderMaterial;material.uniforms.time.value=elapsed;material.uniforms.strength.value=this.fade;
    (this.runes.material as THREE.MeshBasicMaterial).color.setHex(this.active?0x87cbff:0x615b45);
    this.light.intensity=this.fade*(10+Math.sin(elapsed*2)*.5);
    (this.particles.material as THREE.PointsMaterial).opacity=this.fade*.8;
    if(!this.active&&this.fade<.001){this.membrane.visible=this.particles.visible=false;return;}
    const positions=this.particles.geometry.attributes.position as THREE.BufferAttribute;
    for(let i=0;i<positions.count;i++){
      const t=(elapsed*.16+i*.61803398875)%1,y=.2+t*2.5;
      const width=Math.min(.60,Math.max(.06,2.82-y));
      positions.setXYZ(i,Math.sin(i*13.7+elapsed*.3)*width,y,.14+Math.sin(i*7.1)*.18);
    }
    positions.needsUpdate=true;
  }
  canEnter(position:THREE.Vector3):boolean{
    if(!this.active)return false;
    const dx=position.x-this.placement.x,dz=position.z-this.placement.z;
    const forward=dx*Math.sin(this.placement.angle)+dz*Math.cos(this.placement.angle);
    const side=dx*Math.cos(this.placement.angle)-dz*Math.sin(this.placement.angle);
    return forward>=-.35&&forward<=1.7&&Math.abs(side)<.72&&position.y<2;
  }
  dispose():void{
    this.membrane.geometry.dispose();(this.membrane.material as THREE.Material).dispose();
    (this.runes.material as THREE.Material).dispose();this.particles.geometry.dispose();(this.particles.material as THREE.Material).dispose();this.light.dispose();
  }
}
