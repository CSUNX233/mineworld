import * as THREE from 'three';

export const sceneryFocus = { value: new THREE.Vector3() };
export const sceneryCutaway = { value: 0 };
const ray = new THREE.Raycaster();
const direction = new THREE.Vector3();
const hits: THREE.Intersection[] = [];
let lastRoot: THREE.Object3D | undefined;
let blockers: THREE.Object3D[] = [];
let nextProbe = 0;
let occluded = false;

/** Probe actual visible architecture, rather than fading every wall near the player. */
export function updateSceneryCutaway(position: THREE.Vector3, firstPerson: boolean, camera: THREE.Camera, world: THREE.Object3D, dt: number): void {
  sceneryFocus.value.copy(position).y += 1.1;
  const root = world.children.find(child => child.name === 'ruins-kit' || child.name === 'deep-chapter-scenery');
  if (root !== lastRoot) {
    lastRoot = root; blockers = []; nextProbe = 0; occluded = false; sceneryCutaway.value = 0;
    root?.traverse(node => {
      if (node instanceof THREE.Mesh && !Array.isArray(node.material) && node.material.userData.sceneryCutaway) blockers.push(node);
    });
  }
  if (firstPerson || !root) { sceneryCutaway.value = 0; occluded = false; nextProbe = 0; return; }
  nextProbe -= dt;
  if (nextProbe <= 0) {
    nextProbe = .1;
    direction.subVectors(sceneryFocus.value, camera.position);
    const distance = direction.length();
    ray.set(camera.position, direction.normalize()); ray.near = .08; ray.far = Math.max(.08, distance - .2);
    root.updateWorldMatrix(true, true);
    hits.length = 0; ray.intersectObjects(blockers, false, hits);
    occluded = distance > .3 && hits.some(hit => hit.point.y > .45);
  }
  sceneryCutaway.value = THREE.MathUtils.lerp(sceneryCutaway.value, occluded ? 1 : 0, 1 - Math.exp(-dt * 12));
}

/** Shared dither treatment for static chapter architecture; keeps collision untouched. */
export function applySceneryCutaway(material: THREE.MeshLambertMaterial | THREE.MeshPhongMaterial): void {
  material.userData.sceneryCutaway = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.ruinsFocus = sceneryFocus; shader.uniforms.ruinsCutaway = sceneryCutaway;
    shader.vertexShader = 'varying vec3 vRuinsWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 ruinsPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        ruinsPosition = instanceMatrix * ruinsPosition;
      #endif
      vRuinsWorld = (modelMatrix * ruinsPosition).xyz;`);
    shader.fragmentShader = 'varying vec3 vRuinsWorld; uniform vec3 ruinsFocus; uniform float ruinsCutaway;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      vec3 sight = ruinsFocus - cameraPosition;
      float along = dot(vRuinsWorld - cameraPosition, sight) / max(dot(sight,sight), 0.01);
      float away = distance(vRuinsWorld, cameraPosition + sight * clamp(along,0.0,1.0));
      float mask = (1.0 - smoothstep(0.35, 0.72, away)) * ruinsCutaway;
      if (mask > 0.001 && vRuinsWorld.y > 0.45 && along > 0.01 && along < 0.98) {
        float dither = fract(dot(mod(floor(gl_FragCoord.xy), 4.0), vec2(0.25, 0.5625)));
        if (dither < mask * 0.75) discard;
      }`);
  };
}
