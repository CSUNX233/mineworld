import * as THREE from 'three';
import { PerformanceTierDetector } from '../core/Performance';

interface Emitter { x:number; y:number; z:number; smoke:boolean; color:number }

/** Slow local billboards; never a full-screen fog overlay or a gameplay hazard. */
export function createChapterVapor(floor:number, lights:readonly {x:number;y:number;z:number}[], pools:readonly {x:number;z:number}[]):THREE.InstancedMesh {
  const indoor=floor>=6&&floor<=10,ruins=floor<=5,low=PerformanceTierDetector.tier==='low';
  const emitters:Emitter[]=[];
  if(indoor||ruins){
    const limit=low?4:8,stride=Math.max(1,Math.ceil(lights.length/limit));
    lights.forEach((p,i)=>{if(i%stride===0)emitters.push({...p,y:p.y+.35,smoke:true,color:indoor?0x8d8882:0xb6b6a4});});
  }
  // Space emitters apart so adjacent water cells do not stack into a dense curtain.
  const selected:{x:number;z:number}[]=[];
  const ranked=pools.map(p=>({p,d:lights.length?Math.min(...lights.map(light=>(light.x-p.x)**2+(light.z-p.z)**2)):0})).sort((a,b)=>a.d-b.d);
  for(const {p} of ranked){
    if(selected.some(q=>(q.x-p.x)**2+(q.z-p.z)**2<8**2))continue;
    selected.push(p);emitters.push({...p,y:indoor?.1:-.1,smoke:indoor,color:indoor?0xa09184:ruins?0xc4cfb7:0xabc5c0});
    if(selected.length>=(low?5:10))break;
  }
  const geometry=new THREE.PlaneGeometry(1,1),count=emitters.length*2;
  const parameters=new Float32Array(count*2);
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0}},
    vertexShader:`uniform float time;attribute vec2 vaporData;varying vec2 vaporUv;varying vec3 tint;varying float opacity;
      void main(){vaporUv=uv;tint=instanceColor;float smoke=vaporData.y;float age=fract(time*mix(.035,.075,smoke)+vaporData.x);
        vec4 center=modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0);
        center.x+=sin(vaporData.x*17.0+age*2.5)*mix(1.0,.28,smoke);center.z+=cos(vaporData.x*11.0+age*2.0)*.3;
        center.y+=mix(.12,age*2.8,smoke);
        float range=distance(center.xyz,cameraPosition);opacity=sin(age*3.14159)*mix(.085,.16,smoke)*(1.0-smoothstep(35.0,60.0,range));
        vec4 mvPosition=viewMatrix*center;
        mvPosition.xy+=position.xy*vec2(mix(4.2,1.1+age*1.2,smoke),mix(.65,1.25+age*.65,smoke));
        gl_Position=projectionMatrix*mvPosition;
      }`,
    fragmentShader:`uniform float time;varying vec2 vaporUv;varying vec3 tint;varying float opacity;
      void main(){vec2 q=vaporUv*2.0-1.0;float cloud=exp(-dot(q,q)*3.8);
        cloud*=.78+.13*sin(q.x*6.0+q.y*4.0+time*.4)+.09*cos(q.y*8.0-q.x*3.0-time*.25);
        float edge=1.0-smoothstep(.55,1.0,length(q));gl_FragColor=vec4(tint,cloud*edge*opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.name='chapter-local-smoke-mist';
  const matrix=new THREE.Matrix4();emitters.forEach((e,i)=>{for(let j=0;j<2;j++){
    const index=i*2+j;mesh.setMatrixAt(index,matrix.makeTranslation(e.x,e.y,e.z));mesh.setColorAt(index,new THREE.Color(e.color));
    parameters[index*2]=(i*.61803398875+j*.5)%1;parameters[index*2+1]=e.smoke?1:0;
  }});
  geometry.setAttribute('vaporData',new THREE.InstancedBufferAttribute(parameters,2));
  mesh.computeBoundingSphere();if(mesh.boundingSphere)mesh.boundingSphere.radius+=6;
  return mesh;
}
