import * as THREE from 'three';

/**
 * Clay material: MeshStandardMaterial (high roughness, no metal) patched with
 *  - uFade:      dithered (screen-door) opacity, so ghosted elements never need sorting
 *  - uTint/Mix:  state tint (approved / reported / rejected ...)
 *  - uBlueprint: global switch to a "plano" look (edges only, blueprint lines)
 */
export const globalUniforms = {
  uBlueprint: { value: 0 },
  uBpColor: { value: new THREE.Color('#e6f3ff') },
};

export type ClayMaterial = THREE.MeshStandardMaterial & {
  userData: {
    uFade: { value: number };
    uTint: { value: THREE.Color };
    uTintMix: { value: number };
    base: THREE.Color;
  };
};

export function clay(color: THREE.ColorRepresentation, opts: THREE.MeshStandardMaterialParameters = {}): ClayMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, ...opts }) as ClayMaterial;
  m.userData.uFade = { value: 1 };
  m.userData.uTint = { value: new THREE.Color('#ffffff') };
  m.userData.uTintMix = { value: 0 };
  m.userData.base = new THREE.Color(color);

  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFade = m.userData.uFade;
    shader.uniforms.uTint = m.userData.uTint;
    shader.uniforms.uTintMix = m.userData.uTintMix;
    shader.uniforms.uBlueprint = globalUniforms.uBlueprint;
    shader.uniforms.uBpColor = globalUniforms.uBpColor;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vXUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvXUv = uv;');

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vXUv;
uniform float uFade; uniform vec3 uTint; uniform float uTintMix;
uniform float uBlueprint; uniform vec3 uBpColor;
float xEdge(){
  float e = min(min(vXUv.x, 1.0 - vXUv.x), min(vXUv.y, 1.0 - vXUv.y));
  float fw = max(fwidth(e), 1e-4);
  return 1.0 - smoothstep(fw * 0.6, fw * 1.8, e);
}`
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
float xLine = xEdge();
float xAlpha = uFade * mix(1.0, xLine, uBlueprint);
float xNoise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
if (xAlpha < 0.999 && xAlpha <= xNoise) discard;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb, uTint, uTintMix);`
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
gl_FragColor.rgb = mix(gl_FragColor.rgb, uBpColor * (0.55 + 0.45 * xLine), uBlueprint);`
      );
  };
  m.customProgramCacheKey = () => 'xaner-clay';
  return m;
}
