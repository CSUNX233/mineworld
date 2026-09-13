import * as THREE from 'three';
import type { FloorData } from '../types';
import { BlockKind } from './Block';

export interface BakeLight { x: number; z: number; color: number; strength?: number }
/** Small per-floor analytic light/occlusion atlas, computed once for the generated layout. */
export function bakeScenery(data: FloorData, sources: readonly BakeLight[]): THREE.DataTexture {
  const resolution = data.size * 3, pixels = new Uint8Array(resolution * resolution * 4);
  const lights = sources.map(s => ({...s, tint: new THREE.Color(s.color)}));
  // Destructible obstacles are excluded so opening racks/panels cannot leave baked dark stripes.
  const solid = (x: number,z: number) => data.grid[z]?.[x] === BlockKind.Wall;
  for(let iz=0;iz<resolution;iz++) for(let ix=0;ix<resolution;ix++) {
    const x=(ix+.5)/3,z=(iz+.5)/3, cx=Math.floor(x),cz=Math.floor(z);
    let shade=0;
    for(let dz=-2;dz<=2;dz++) for(let dx=-2;dx<=2;dx++) {
      if((dx===0&&dz===0)||!solid(cx+dx,cz+dz))continue;
      const distance=Math.hypot(Math.max(cx+dx-x,0,x-cx-dx-1),Math.max(cz+dz-z,0,z-cz-dz-1));
      shade=Math.max(shade,Math.exp(-distance*2)*.4);
    }
    let red=0,green=0,blue=0;
    for(const light of lights) {
      const dx=light.x-x,dz=light.z-z,d2=dx*dx+dz*dz;
      if(d2>49)continue;
      // Keep bounce local: walls between the lamp and receiver stop it.
      let blocked=false;const steps=Math.ceil(Math.sqrt(d2)*2);
      for(let step=1;step<steps-1;step++) {
        const sx=Math.floor(x+dx*step/steps),sz=Math.floor(z+dz*step/steps);
        if((sx!==cx||sz!==cz)&&solid(sx,sz)){blocked=true;break;}
      }
      if(blocked)continue;
      const energy=(light.strength??5.5)*.09/(1+d2*.32);
      red+=light.tint.r*energy;green+=light.tint.g*energy;blue+=light.tint.b*energy;
    }
    const index=(iz*resolution+ix)*4;
    pixels[index]=Math.min(255,red*255);pixels[index+1]=Math.min(255,green*255);pixels[index+2]=Math.min(255,blue*255);pixels[index+3]=(1-shade)*255;
  }
  const map=new THREE.DataTexture(pixels,resolution,resolution);map.magFilter=map.minFilter=THREE.LinearFilter;map.needsUpdate=true;return map;
}

export function applySceneryBake(material: THREE.MeshLambertMaterial | THREE.MeshPhongMaterial, texture: THREE.Texture, size: number, indoor: boolean): void {
  const prior=material.onBeforeCompile;
  material.onBeforeCompile=(shader,renderer)=>{
    prior.call(material,shader,renderer);
    shader.uniforms.sceneryBake={value:texture};shader.uniforms.sceneryBakeSize={value:size};
    shader.vertexShader='varying vec3 vBakeWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec4 bakePosition=vec4(transformed,1.0);
      #ifdef USE_INSTANCING
        bakePosition=instanceMatrix*bakePosition;
      #endif
      vBakeWorld=(modelMatrix*bakePosition).xyz;`);
    shader.fragmentShader='varying vec3 vBakeWorld; uniform sampler2D sceneryBake; uniform float sceneryBakeSize;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
      vec4 baked=texture2D(sceneryBake,clamp(vBakeWorld.xz/sceneryBakeSize,0.001,0.999));
      float contact=mix(baked.a,1.0,smoothstep(0.0,2.8,vBakeWorld.y));
      reflectedLight.indirectDiffuse*=contact;
      reflectedLight.directDiffuse*=mix(0.78,1.0,contact);
      float bounceHeight=mix(1.0,0.18,smoothstep(0.3,3.8,vBakeWorld.y));
      reflectedLight.indirectDiffuse+=diffuseColor.rgb*baked.rgb*bounceHeight*${indoor?'0.65':'0.35'};
    `);
  };
  material.customProgramCacheKey=()=>`scenery-bake-v1-${indoor}-${!!material.userData.sceneryCutaway}`;
}
