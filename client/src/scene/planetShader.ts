// One cheap ShaderMaterial for the selected system's spheres. Class picks a procedural look:
// lava glow, water sheen, gas bands, ice shimmer, bright star, grey moon, and so on.
// No textures, no lights, no post-processing: value noise and a Blinn-Phong term only.
import { ShaderMaterial, Vector3 } from 'three';
import type { PlanetClass } from '../types';

export const CLASS_INDEX: Record<PlanetClass, number> = {
  rocky: 0, iron: 1, water: 2, sub_neptune: 3, ice_giant: 4,
  gas_giant: 5, hot_jupiter: 6, lava: 7, carbon: 8, star: 9, moon: 10,
};

const vert = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vObjPos;
  void main() {
    vObjPos = position;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const frag = /* glsl */ `
  precision mediump float;
  uniform int uClass;
  uniform float uTime;
  uniform vec3 uLightPos;
  uniform float uSelected;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vObjPos;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    return 0.5 * noise(p) + 0.25 * noise(p * 2.03) + 0.125 * noise(p * 4.1);
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(uLightPos - vWorldPos);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float ndl = max(dot(N, L), 0.0);
    // Wrapped diffuse keeps the night side readable without real lights.
    float wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
    float diff = 0.12 + 0.88 * mix(wrap * wrap, ndl, 0.5);
    float spec = pow(max(dot(reflect(-L, N), V), 0.0), 24.0) * ndl;
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    vec3 p = normalize(vObjPos) * 3.0;
    float lat = normalize(vObjPos).y;
    vec3 col = vec3(0.0);
    vec3 emis = vec3(0.0);

    if (uClass == 0) { // rocky
      float n = fbm(p * 1.6);
      col = mix(vec3(0.40, 0.31, 0.24), vec3(0.64, 0.58, 0.48), n) * diff;
      col += vec3(0.5, 0.65, 0.9) * fres * 0.25;
    } else if (uClass == 1) { // iron
      float n = fbm(p * 2.2);
      col = mix(vec3(0.28, 0.27, 0.30), vec3(0.52, 0.48, 0.46), n) * diff + vec3(0.9) * spec * 0.9;
    } else if (uClass == 2) { // water
      float n = fbm(p * 2.0 + vec3(uTime * 0.05, 0.0, uTime * 0.03));
      vec3 sea = mix(vec3(0.02, 0.17, 0.45), vec3(0.08, 0.42, 0.74), n);
      col = sea * diff + vec3(0.65, 0.82, 1.0) * spec * 1.3 + vec3(0.3, 0.5, 0.9) * fres * 0.6;
    } else if (uClass == 3) { // sub_neptune
      float b = sin(lat * 10.0 + fbm(p) * 2.0) * 0.5 + 0.5;
      col = mix(vec3(0.42, 0.58, 0.80), vec3(0.70, 0.80, 0.92), b) * diff + vec3(0.6, 0.75, 1.0) * fres * 0.45;
    } else if (uClass == 4) { // ice_giant
      float b = sin(lat * 14.0 + fbm(p) * 1.5) * 0.5 + 0.5;
      float shimmer = noise(p * 18.0 + uTime * 0.6) * 0.15;
      col = mix(vec3(0.12, 0.48, 0.70), vec3(0.40, 0.82, 0.92), b) * diff + vec3(0.75, 0.95, 1.0) * (spec * 0.7 + fres * 0.4 + shimmer);
    } else if (uClass == 5) { // gas_giant
      float b = sin(lat * 18.0 + fbm(p * 1.3) * 3.0);
      vec3 c1 = vec3(0.80, 0.64, 0.46), c2 = vec3(0.56, 0.40, 0.30), c3 = vec3(0.92, 0.88, 0.78);
      col = mix(mix(c1, c2, b * 0.5 + 0.5), c3, smoothstep(0.7, 1.0, b)) * diff;
    } else if (uClass == 6) { // hot_jupiter
      float b = sin(lat * 16.0 + fbm(p * 1.3 + uTime * 0.04) * 3.0) * 0.5 + 0.5;
      col = mix(vec3(0.45, 0.10, 0.04), vec3(0.95, 0.45, 0.10), b) * diff;
      emis = vec3(0.95, 0.32, 0.06) * (0.30 + 0.30 * b);
    } else if (uClass == 7) { // lava
      float n = fbm(p * 2.6 + uTime * 0.02);
      float cracks = smoothstep(0.50, 0.62, n);
      col = vec3(0.12, 0.08, 0.07) * diff;
      float flicker = 0.85 + 0.15 * sin(uTime * 2.0 + n * 12.0);
      emis = mix(vec3(0.85, 0.22, 0.02), vec3(1.0, 0.80, 0.30), cracks) * (0.25 + 1.0 * cracks) * flicker;
    } else if (uClass == 8) { // carbon
      float glint = smoothstep(0.82, 0.96, noise(p * 30.0 + uTime * 0.35));
      col = vec3(0.08, 0.07, 0.11) * diff + vec3(0.9) * spec * 0.7 + vec3(0.85, 0.92, 1.0) * glint * (0.3 + ndl) * 1.4;
    } else if (uClass == 9) { // star
      float limb = pow(max(dot(N, V), 0.0), 0.45);
      float n = fbm(p * 2.0 + uTime * 0.08);
      emis = mix(vec3(1.0, 0.72, 0.30), vec3(1.0, 0.95, 0.80), n) * (0.55 + 0.75 * limb) * 1.5;
    } else { // moon
      float n = fbm(p * 3.0);
      float crater = smoothstep(0.62, 0.76, noise(p * 6.0));
      col = mix(vec3(0.34, 0.34, 0.36), vec3(0.62, 0.62, 0.64), n) * (1.0 - 0.35 * crater) * diff;
    }

    // Subtle rim when selected so the chosen world stands out from its siblings.
    col += vec3(1.0, 0.84, 0.3) * fres * 0.6 * uSelected;
    gl_FragColor = vec4(col + emis, 1.0);
  }
`;

export function makePlanetMaterial(cls: PlanetClass): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uClass: { value: CLASS_INDEX[cls] ?? 0 },
      uTime: { value: 0 },
      uLightPos: { value: new Vector3() },
      uSelected: { value: 0 },
    },
  });
}
