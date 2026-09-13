import * as THREE from 'three';
import type { FloorData } from '../types';
import { PerformanceTierDetector } from '../core/Performance';
import { deepChapterStyle } from './DeepChapterStyle';

/** Outdoor sunlight; the enclosed foundry receives only ambient bounce and practical lamps. */
export function configureChapterLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer, data: FloorData): void {
  const ruins = data.floor <= 5;
  const chapter = deepChapterStyle(data.floor), modeled = ruins || !!chapter;
  const indoor = chapter?.chapter === 'foundry';
  const late=data.floor>=16&&data.floor<=25,abyss=late&&data.floor<=20;
  const fogColor = late?chapter!.fog:indoor ? 0x171c25 : chapter ? 0x566a66 : ruins ? 0xb2b79a : 0x090c12;
  scene.background = new THREE.Color(fogColor);
  scene.fog = new THREE.Fog(fogColor, modeled ? 28 : 18, modeled ? 80 : 62);
  const sun = scene.getObjectByName('chapter-sun') as THREE.DirectionalLight;
  const hemi = scene.getObjectByName('chapter-hemi') as THREE.HemisphereLight;
  let fill=scene.getObjectByName('chapter-fill') as THREE.AmbientLight|undefined;
  if(!fill){fill=new THREE.AmbientLight();fill.name='chapter-fill';scene.add(fill);}
  fill.color.setHex(abyss?0xc7b8df:late?0xd2dced:indoor?0xb7c5d8:ruins?0xe0d9bb:0xd4ded5);
  fill.intensity=abyss?.8:indoor?.65:modeled?.4:0;
  hemi.intensity = indoor ? 1.65 : modeled ? 1.1 : .9;
  hemi.color.setHex(indoor ? 0x9aaac2 : ruins ? 0xc5d9d1 : 0xc7dde0);
  hemi.groundColor.setHex(indoor ? 0x9c8977 : ruins ? 0x9ca382 : chapter ? 0x9a9e8b : 0x2a2f36);
  sun.intensity = abyss ? 1.5 : indoor ? 0 : modeled ? 3.1 : 1.4;
  sun.color.setHex(abyss?0xd9c6ff:ruins ? 0xffdf9d : chapter ? 0xffedcc : 0xfff0d0);
  renderer.toneMapping=modeled?THREE.ACESFilmicToneMapping:THREE.NoToneMapping;
  renderer.toneMappingExposure=indoor?1.4:modeled?1.14:1;
  const shadows = modeled && !indoor && PerformanceTierDetector.tier !== 'low';
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  sun.castShadow = shadows;
  if (modeled) {
    const c=data.size/2;
    sun.position.set(c-24,27,c-20); sun.target.position.set(c,0,c);
    if(!sun.target.parent) scene.add(sun.target);
    const reach=data.size*.75;
    Object.assign(sun.shadow.camera,{left:-reach,right:reach,top:reach,bottom:-reach,near:1,far:150});
    sun.shadow.camera.updateProjectionMatrix();
    const resolution=PerformanceTierDetector.tier==='high'?2048:1024;
    sun.shadow.mapSize.set(resolution,resolution);
    sun.shadow.bias=-.0004; sun.shadow.normalBias=.035;
  } else {
    sun.position.set(12,22,8); sun.target.position.set(0,0,0);
  }
  renderer.shadowMap.needsUpdate = shadows;
}
