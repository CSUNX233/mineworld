import * as THREE from 'three';
import type { FloorData } from '../types';
import { PerformanceTierDetector } from '../core/Performance';
import { deepChapterStyle } from './DeepChapterStyle';

/** A single static sunlight shadow for architecture; no per-prop lights or bloom. */
export function configureChapterLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer, data: FloorData): void {
  const ruins = data.floor <= 5;
  const chapter = deepChapterStyle(data.floor), modeled = ruins || !!chapter;
  const fogColor = chapter?.fog ?? (ruins ? 0xc3cfbf : 0x090c12);
  scene.background = new THREE.Color(fogColor);
  scene.fog = new THREE.Fog(fogColor, modeled ? 28 : 18, modeled ? 80 : 62);
  const sun = scene.getObjectByName('chapter-sun') as THREE.DirectionalLight;
  const hemi = scene.getObjectByName('chapter-hemi') as THREE.HemisphereLight;
  hemi.intensity = chapter?.ambient ?? (ruins ? 1.05 : .9);
  hemi.groundColor.setHex(chapter?.ground ?? (ruins ? 0x555a50 : 0x2a2f36));
  sun.intensity = chapter?.sunIntensity ?? (ruins ? 2.6 : 1.4);
  sun.color.setHex(chapter?.sun ?? (ruins ? 0xffe6bd : 0xfff0d0));
  renderer.toneMapping=modeled?THREE.ACESFilmicToneMapping:THREE.NoToneMapping;
  renderer.toneMappingExposure=chapter?.exposure ?? (ruins?1.12:1);
  const shadows = modeled && PerformanceTierDetector.tier !== 'low';
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  sun.castShadow = shadows;
  if (modeled) {
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
