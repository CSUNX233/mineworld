import * as THREE from 'three';
import type { FloorData } from '../types';
import { PerformanceTierDetector } from '../core/Performance';

/** A single static sunlight shadow for architecture; no per-prop lights or bloom. */
export function configureChapterLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer, data: FloorData): void {
  const ruins = data.floor <= 5;
  scene.background = new THREE.Color(ruins ? 0xc3cfbf : 0x090c12);
  scene.fog = new THREE.Fog(ruins ? 0xc3cfbf : 0x090c12, ruins ? 28 : 18, ruins ? 80 : 62);
  const sun = scene.getObjectByName('chapter-sun') as THREE.DirectionalLight;
  const hemi = scene.getObjectByName('chapter-hemi') as THREE.HemisphereLight;
  hemi.intensity = ruins ? 1.05 : .9;
  hemi.groundColor.setHex(ruins ? 0x555a50 : 0x2a2f36);
  sun.intensity = ruins ? 2.6 : 1.4;
  sun.color.setHex(ruins ? 0xffe6bd : 0xfff0d0);
  renderer.toneMapping=ruins?THREE.ACESFilmicToneMapping:THREE.NoToneMapping;
  renderer.toneMappingExposure=ruins?1.12:1;
  const shadows = ruins && PerformanceTierDetector.tier !== 'low';
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  sun.castShadow = shadows;
  if (ruins) {
    const c=data.size/2;
    sun.position.set(c-18,32,c-14); sun.target.position.set(c,0,c);
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
