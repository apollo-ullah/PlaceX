// Territory glow: every claimed object casts a soft halo in its owner's crew colour that covers
// roughly 50 ly of its neighbourhood (scaled through the same log compression as positions,
// then clamped so near systems do not flood the view). One InstancedMesh of additive sprites,
// rebuilt when the claim map changes (a few thousand matrix writes at most).
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, Color, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry,
  ShaderMaterial, Vector3,
} from 'three';
import { useClaims, useObjects, usePlayer } from '../state';
import { CREWS, GOLD } from '../types';
import { IS_MOBILE } from './bus';
import { LAYOUT, worldPosition } from './layout';

const TERRITORY_LY = 50;
const MAX_PX = IS_MOBILE ? 160 : 240;

const vert = /* glsl */ `
  attribute float aSize;
  uniform float uPixelScale;
  uniform float uMaxPx;
  varying vec3 vColor;
  varying vec2 vUv;
  void main() {
    vec3 center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec4 viewCenter = viewMatrix * vec4(center, 1.0);
    float dist = max(0.0001, -viewCenter.z);
    float px = min(aSize / (dist * uPixelScale), uMaxPx);
    float size = px * dist * uPixelScale;
    gl_Position = projectionMatrix * (viewCenter + vec4(position.xy * size, 0.0, 0.0));
    vColor = instanceColor;
    vUv = uv;
  }
`;
const frag = /* glsl */ `
  precision mediump float;
  varying vec3 vColor;
  varying vec2 vUv;
  void main() {
    float d = length((vUv - 0.5) * 2.0);
    if (d > 1.0) discard;
    float a = exp(-d * d * 5.0) * 0.16;
    gl_FragColor = vec4(vColor * a, 1.0);
  }
`;

/** Halo radius in scene units for an object at `distanceLy`: 50 ly through the local slope. */
function haloRadius(distanceLy: number): number {
  const slope = LAYOUT.A / (LAYOUT.R0 + Math.max(0, distanceLy)); // scene units per ly here
  return Math.min(5, Math.max(0.45, TERRITORY_LY * slope));
}

export function Territory() {
  const claims = useClaims();
  const me = usePlayer();
  const { byId, list } = useObjects();

  const material = useMemo(() => new ShaderMaterial({
    vertexShader: vert, fragmentShader: frag,
    uniforms: { uPixelScale: { value: 0.001 }, uMaxPx: { value: MAX_PX } },
    transparent: true, depthWrite: false, depthTest: true, blending: AdditiveBlending,
  }), []);
  const geometry = useMemo(() => new PlaneGeometry(2, 2), []);
  useEffect(() => () => { material.dispose(); geometry.dispose(); }, [material, geometry]);

  const mesh = useMemo(() => {
    const n = claims.size;
    if (n === 0 || list.length === 0) return null;
    const geo = geometry.clone();
    const sizes = new Float32Array(n);
    const colors = new Float32Array(n * 3);
    const m = new InstancedMesh(geo, material, n);
    const mat = new Matrix4();
    const pos = new Vector3();
    const c = new Color();
    let i = 0;
    for (const claim of claims.values()) {
      const obj = byId.get(claim.objectId);
      if (!obj) continue;
      worldPosition(obj, pos);
      mat.makeTranslation(pos.x, pos.y, pos.z);
      m.setMatrixAt(i, mat);
      sizes[i] = haloRadius(obj.distanceLy);
      c.set(claim.owner === me?.identity ? GOLD : CREWS[claim.ownerCrew]?.color ?? '#ffffff');
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      i++;
    }
    m.count = i;
    geo.setAttribute('aSize', new InstancedBufferAttribute(sizes, 1));
    m.instanceColor = new InstancedBufferAttribute(colors, 3);
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;
    m.renderOrder = -1;
    return m;
  }, [claims, byId, list, me?.identity, material, geometry]);

  useEffect(() => () => { mesh?.geometry.dispose(); }, [mesh]);

  useFrame(({ camera, size }) => {
    const fovTan = Math.tan((((camera as { fov?: number }).fov ?? 60) * Math.PI) / 360);
    material.uniforms.uPixelScale.value = (2 * fovTan) / size.height;
  });

  return mesh ? <primitive object={mesh} /> : null;
}
