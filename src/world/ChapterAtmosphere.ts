import * as THREE from 'three';
import type { FloorData } from '../types';
import { BlockKind } from './Block';
import { WaterReflection } from './WaterReflection';
import { createChapterVapor } from './ChapterVapor';

/** Background only: no physics, navigation, damage or random-stream changes. */
export function createChapterAtmosphere(data: FloorData, lights: {x:number;y:number;z:number;color:number}[] = []): THREE.Group {
  const group=new THREE.Group();group.name='chapter-atmosphere';
  const indoor=data.floor>=6&&data.floor<=10, ruins=data.floor<=5;
  const positions:number[]=[],land:number[]=[],banks:number[]=[],shore:{x:number;z:number}[]=[];
  const walk=(x:number,z:number)=>[BlockKind.Floor,BlockKind.Portal,BlockKind.Obstacle].includes(data.grid[z]?.[x]);
  const pools=new Set<string>();
  for(let z=-16;z<data.size+16;z++)for(let x=-16;x<data.size+16;x++) {
    // Isolated low-lying pockets, never a sea replacing the land backdrop.
    const pocket=Math.sin(x*.16+data.seed%11)*Math.cos(z*.14+data.floor);
    if(pocket<(indoor?.66:.72))continue;
    let clear=true;
    for(let dz=-2;dz<=2&&clear;dz++)for(let dx=-2;dx<=2;dx++)if(walk(x+dx,z+dz)){clear=false;break;}
    if(!clear)continue;
    pools.add(`${x},${z}`);
  }
  for(let z=-16;z<data.size+16;z++)for(let x=-16;x<data.size+16;x++){
    const wet=pools.has(`${x},${z}`),target=wet?positions:land;
    for(const [dx,dz] of [[0,0],[0,1],[1,0],[1,0],[0,1],[1,1]])target.push(x+dx,wet?-.55:-.13,z+dz);
    if(wet)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      if(pools.has(`${x+dx},${z+dz}`))continue;
      const ax=x+(dx===1?1:0),az=z+(dz===1?1:0),bx=ax+(dz?1:0),bz=az+(dx?1:0);
      banks.push(ax,-.13,az,ax,-.6,az,bx,-.13,bz,bx,-.13,bz,ax,-.6,az,bx,-.6,bz);
      if((x*7+z*11)%5===0)shore.push({x:ax,z:az});
    }
  }
  const terrainCanvas=document.createElement('canvas');terrainCanvas.width=terrainCanvas.height=128;
  const ctx=terrainCanvas.getContext('2d')!;
  for(let z=0;z<128;z+=2)for(let x=0;x<128;x+=2){
    const n=((Math.imul(x+31,73856093)^Math.imul(z+57,19349663))>>>0)%29;
    const shade=180+n*2;ctx.fillStyle=`rgb(${shade},${shade},${shade})`;ctx.fillRect(x,z,2,2);
  }
  const terrainMap=new THREE.CanvasTexture(terrainCanvas);terrainMap.wrapS=terrainMap.wrapT=THREE.RepeatWrapping;terrainMap.magFilter=THREE.NearestFilter;terrainMap.colorSpace=THREE.SRGBColorSpace;
  group.userData.terrainMap=terrainMap;
  for(const [vertices,color,name] of [[land,indoor?0x454348:ruins?0x79825a:0x72776a,'land'],[banks,indoor?0x40372f:0x656b57,'pool-banks']] as const){
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();
    const uv:number[]=[];for(let i=0;i<vertices.length;i+=3)uv.push(vertices[i]/6,vertices[i+2]/6);geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    const ground=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({color,map:terrainMap,side:name==='land'?THREE.FrontSide:THREE.DoubleSide}));ground.name=name;ground.receiveShadow=true;group.add(ground);
  }
  if(shore.length){
    const rocks=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.5,0),new THREE.MeshLambertMaterial({color:indoor?0x474042:ruins?0x81866c:0x899081,flatShading:true}),shore.length);
    const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),position=new THREE.Vector3(),scale=new THREE.Vector3();
    shore.forEach((p,i)=>{position.set(p.x,-.08,p.z);scale.set(.7+(i%3)*.25,.4+(i%2)*.2,.65);q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,i);rocks.setMatrixAt(i,matrix.compose(position,q,scale));});
    rocks.name='background-shore-rocks';rocks.castShadow=rocks.receiveShadow=true;rocks.computeBoundingSphere();group.add(rocks);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const material=new THREE.ShaderMaterial({uniforms:{time:{value:0},reflectionMap:{value:null},reflectionMatrix:{value:new THREE.Matrix4()},reflectionReady:{value:0},lava:{value:indoor?1:0},deep:{value:new THREE.Color(ruins?0x234d48:0x183d43)},shallow:{value:new THREE.Color(ruins?0x678a6a:0x527d79)}},
    vertexShader:`uniform mat4 reflectionMatrix;varying vec4 reflectionUv;varying vec2 p;varying vec3 worldPosition;void main(){p=position.xz;worldPosition=(modelMatrix*vec4(position,1.0)).xyz;reflectionUv=reflectionMatrix*vec4(worldPosition,1.0);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`uniform sampler2D reflectionMap;uniform float reflectionReady;uniform float time;uniform float lava;uniform vec3 deep;uniform vec3 shallow;varying vec2 p;varying vec4 reflectionUv;varying vec3 worldPosition;
      void main(){vec2 q=floor(p*9.0)/9.0;float ripple=sin(q.x*2.8+sin(q.y*1.9)+time*.55)*sin(q.y*2.2-time*.32);
      vec3 color;
      if(lava>.5){float crack=pow(1.0-abs(sin(q.x*.9+sin(q.y*.7)+time*.035)*sin(q.y*.85+cos(q.x*.55))),7.0);color=mix(vec3(.055,.025,.018),vec3(.95,.19,.012),crack);}
      else{color=mix(deep,shallow,.25+ripple*.08);color+=vec3(.015,.018,.012)*pow(max(0.0,ripple),12.0);
        if(reflectionReady>.5&&reflectionUv.w>0.0){vec2 uv=reflectionUv.xy/reflectionUv.w;uv+=vec2(ripple,sin(q.y+time*.4))*.002;
          if(all(greaterThan(uv,vec2(.004)))&&all(lessThan(uv,vec2(.996)))){vec2 blur=vec2(.0025,0.0);vec3 reflected=(texture2D(reflectionMap,uv+blur).rgb+texture2D(reflectionMap,uv-blur).rgb+texture2D(reflectionMap,uv+blur.yx).rgb+texture2D(reflectionMap,uv-blur.yx).rgb)*.25;
            float fresnel=pow(1.0-abs(normalize(cameraPosition-worldPosition).y),3.0);color=mix(color,reflected,.32+fresnel*.48);}}
      }
      gl_FragColor=vec4(color,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  const surface=new THREE.Mesh(geometry,material);surface.name=indoor?'background-lava':'background-water';group.add(surface);group.userData.surface=material;
  if(!indoor&&pools.size){
    const reflection=new WaterReflection(surface,[...pools].map(key=>{const [x,z]=key.split(',').map(Number);return{x:x+.5,z:z+.5};}));
    material.uniforms.reflectionMap.value=reflection.texture;material.uniforms.reflectionMatrix.value=reflection.matrix;material.uniforms.reflectionReady=reflection.ready;
    group.userData.waterReflection=reflection;
  }
  if(lights.length){
    const haloMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:`varying vec2 uvHalo;varying vec3 hue;void main(){uvHalo=uv;hue=instanceColor;vec4 center=modelViewMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0);center.xy+=position.xy;gl_Position=projectionMatrix*center;}`,
      fragmentShader:`varying vec2 uvHalo;varying vec3 hue;void main(){float r=length(uvHalo-.5)*2.0;float a=pow(max(0.0,1.0-r),3.0)*.24;gl_FragColor=vec4(hue,a);}`});
    const halos=new THREE.InstancedMesh(new THREE.PlaneGeometry(1.55,1.55),haloMaterial,lights.length);
    const matrix=new THREE.Matrix4();lights.forEach((light,i)=>{halos.setMatrixAt(i,matrix.makeTranslation(light.x,light.y+.12,light.z));halos.setColorAt(i,new THREE.Color(light.color));});
    halos.name='practical-light-halos';halos.frustumCulled=false;group.add(halos);
  }
  if(!indoor){
    const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{horizon:{value:new THREE.Color(ruins?0xb2b79a:0x566a66)},zenith:{value:new THREE.Color(ruins?0x748c93:0x3e5966)}},
      vertexShader:`varying vec3 skyDirection;void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`uniform vec3 horizon;uniform vec3 zenith;varying vec3 skyDirection;void main(){vec3 d=normalize(skyDirection);vec3 col=mix(horizon,zenith,smoothstep(0.0,.8,d.y));float sun=dot(d,normalize(vec3(-24.0,27.0,-20.0)));col+=vec3(1.0,.83,.52)*(pow(max(0.0,sun),40.0)*.16+smoothstep(.9992,.9998,sun)*1.7);gl_FragColor=vec4(col,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`});
    const sky=new THREE.Mesh(new THREE.SphereGeometry(data.size+130,24,12),skyMaterial);sky.position.set(data.size/2,0,data.size/2);sky.name='outdoor-sky';sky.renderOrder=-10;group.add(sky);
    const shaftMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
      vertexShader:`varying vec2 beamUv;void main(){beamUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`varying vec2 beamUv;void main(){float edge=pow(sin(beamUv.x*3.14159),2.0);float end=smoothstep(0.0,.15,beamUv.y)*(1.0-smoothstep(.75,1.0,beamUv.y));gl_FragColor=vec4(1.0,.88,.65,edge*end*.055);}`});
    for(const room of data.rooms){
      const x=room.x+room.width*.48,z=room.z+room.depth*.45;
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([x-7,11,z-6,x-5,11,z-6,x+3,.25,z+3,x-5,11,z-6,x+5,.25,z+3,x+3,.25,z+3],3));
      geo.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,1,1,0,0,1,1,1,0,0,0],2));
      const shaft=new THREE.Mesh(geo,shaftMaterial);shaft.name='sunlight-shaft';group.add(shaft);
    }
  }
  if(indoor){
    const shellMaterial=new THREE.MeshLambertMaterial({color:0x252a30,side:THREE.DoubleSide});
    const box=(x:number,y:number,z:number,w:number,h:number,d:number)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),shellMaterial);mesh.position.set(x,y,z);group.add(mesh);};
    const c=data.size/2,span=data.size+20;
    box(c,8,-10,span,18,1);box(c,8,data.size+10,span,18,1);box(-10,8,c,1,18,span);box(data.size+10,8,c,1,18,span);
    // Interior-facing ceiling: visible from the player's camera, open in an exterior inspection view.
    const ceiling=new THREE.Mesh(new THREE.PlaneGeometry(span,span),new THREE.MeshBasicMaterial({color:0x242b34,map:terrainMap,side:THREE.BackSide}));
    ceiling.rotation.x=-Math.PI/2;ceiling.position.set(c,9,c);ceiling.name='enclosed-boiler-ceiling';group.add(ceiling);
  }
  const vapor=createChapterVapor(data.floor,lights,[...pools].map(key=>{const [x,z]=key.split(',').map(Number);return{x:x+.5,z:z+.5};}));
  group.add(vapor);group.userData.vaporMaterial=vapor.material;
  return group;
}
export function updateChapterAtmosphere(group:THREE.Object3D,elapsed:number):void{
  (group.userData.surface as THREE.ShaderMaterial).uniforms.time.value=elapsed;
  (group.userData.vaporMaterial as THREE.ShaderMaterial).uniforms.time.value=elapsed;
}
export function disposeChapterAtmosphere(group:THREE.Object3D):void{
  (group.userData.waterReflection as WaterReflection|undefined)?.dispose();
  (group.userData.terrainMap as THREE.Texture).dispose();
  const materials=new Set<THREE.Material>();group.traverse(node=>{if(node instanceof THREE.Mesh){if(node instanceof THREE.InstancedMesh)node.dispose();node.geometry.dispose();for(const m of Array.isArray(node.material)?node.material:[node.material])materials.add(m);}});materials.forEach(m=>m.dispose());
}
