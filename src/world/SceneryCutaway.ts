import * as THREE from 'three';

export const sceneryFocus = { value: new THREE.Vector3() };
export const sceneryCutaway = { value: 0 };

/** Shared dither treatment for static chapter architecture; keeps collision untouched. */
export function applySceneryCutaway(material: THREE.MeshLambertMaterial): void {
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
      if (ruinsCutaway > 0.5 && vRuinsWorld.y > 0.45 && along > 0.01 && along < 0.99 && away < 1.45) {
        if (mod(floor(gl_FragCoord.x) + 2.0 * floor(gl_FragCoord.y),4.0) > 0.5) discard;
      }`);
  };
}
