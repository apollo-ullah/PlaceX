// Every catalog object in one InstancedMesh of billboarded glow quads with per-instance colour.
// The vertex shader keeps each glow between MIN_PX and MAX_PX on screen so distant systems still
// read as points and nearby ones do not balloon. Colours are patched incrementally when claims
// change; the mesh itself is only rebuilt when the catalog list changes.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, Camera, Color, InstancedBufferAttribute, InstancedMesh, Matrix4,
  PlaneGeometry, ShaderMaterial, Vector3,
} from 'three';
import { useClaims, useObjects, usePlayer } from '../state';
import { CREWS, GOLD, UNCLAIMED } from '../types';
import { getLayout, visualRadius } from './layout';
import { IS_MOBILE } from './bus';

const MIN_PX = IS_MOBILE ? 4 : 4.5;
const MAX_PX = IS_MOBILE ? 32 : 44;
/** Glow half-size relative to the visual sphere radius. */
const GLOW_MULT = 2.6;

const vert = /* glsl */ `
  attribute float aSize;
  attribute float aPulse;
  uniform float uTime;
  uniform float uPixelScale; // world units per pixel at distance 1
  uniform float uMinPx;
  uniform float uMaxPx;
  varying vec3 vColor;
  varying vec2 vUv;
  varying float vPulse;
  void main() {
    vec3 center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec4 viewCenter = viewMatrix * vec4(center, 1.0);
    float dist = max(0.0001, -viewCenter.z);
    float pulse = aPulse * (0.5 + 0.5 * sin(uTime * 4.5));
    float worldSize = aSize * (1.0 + 0.45 * pulse);
    float px = worldSize / (dist * uPixelScale);
    px = clamp(px, uMinPx, uMaxPx);
    float size = px * dist * uPixelScale;
    vec4 pos = viewCenter + vec4(position.xy * size, 0.0, 0.0);
    gl_Position = projectionMatrix * pos;
    vColor = instanceColor;
    vUv = uv;
    vPulse = pulse;
  }
`;

const frag = /* glsl */ `
  precision mediump float;
  varying vec3 vColor;
  varying vec2 vUv;
  varying float vPulse;
  void main() {
    vec2 c = (vUv - 0.5) * 2.0;
    float d = length(c);
    if (d > 1.0) discard;
    float core = smoothstep(0.5, 0.0, d);
    float halo = exp(-d * d * 3.5) * 0.55;
    float glow = core * 1.25 + halo;
    vec3 col = vColor * glow * (1.0 + 0.7 * vPulse);
    // Core goes white-hot so crew colours still read as stars.
    col += vec3(1.0) * core * 0.35;
    gl_FragColor = vec4(col, 1.0);
  }
`;

interface Handle {
  mesh: InstancedMesh;
  material: ShaderMaterial;
  colorKey: string[];
  pulse: InstancedBufferAttribute;
}

/** Module-level handle so picking can run outside React. */
let handle: Handle | null = null;

const tmpV = new Vector3();
const tmpW = new Vector3();

/**
 * Screen-space pick: nearest instance to (sx, sy) in CSS pixels within its glow radius plus
 * `slopPx`. Returns the object id or null. Cheap enough to run on every tap and on hover.
 */
export function pickObjectAt(
  sx: number, sy: number, camera: Camera, width: number, height: number, slopPx: number,
): string | null {
  if (!handle) return null;
  const layout = getLayout();
  const p = layout.positions;
  const n = layout.list.length;
  const fovTan = Math.tan((((camera as { fov?: number }).fov ?? 60) * Math.PI) / 360);
  const pixelScale = (2 * fovTan) / height;
  const sizes = handle.mesh.geometry.getAttribute('aSize') as InstancedBufferAttribute;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < n; i++) {
    tmpV.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    // Depth in view space before projection, for the glow radius.
    const dz = tmpW.copy(tmpV).applyMatrix4(camera.matrixWorldInverse).z;
    if (dz >= -0.01) continue;
    tmpV.project(camera);
    if (tmpV.z > 1) continue;
    const x = ((tmpV.x + 1) / 2) * width;
    const y = ((1 - tmpV.y) / 2) * height;
    const dx = x - sx, dy = y - sy;
    const d = Math.sqrt(dx * dx + dy * dy);
    const glowPx = Math.min(MAX_PX, Math.max(MIN_PX, sizes.getX(i) / (-dz * pixelScale)));
    const hitR = glowPx + slopPx;
    if (d > hitR) continue;
    // Prefer visually larger (closer) hits when overlapping.
    const score = d - glowPx * 0.5;
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return best >= 0 ? layout.list[best].id : null;
}

export function Objects() {
  const { list } = useObjects();
  const claims = useClaims();
  const me = usePlayer();
  const ref = useRef<InstancedMesh>(null);

  const built = useMemo<Handle | null>(() => {
    if (list.length === 0) return null;
    const layout = getLayout();
    const n = list.length;
    const geometry = new PlaneGeometry(2, 2);
    const sizes = new Float32Array(n);
    const pulse = new InstancedBufferAttribute(new Float32Array(n), 1);
    pulse.setUsage(35048 /* DynamicDrawUsage */);
    for (let i = 0; i < n; i++) sizes[i] = visualRadius(list[i]) * GLOW_MULT;
    geometry.setAttribute('aSize', new InstancedBufferAttribute(sizes, 1));
    geometry.setAttribute('aPulse', pulse);

    const material = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uTime: { value: 0 },
        uPixelScale: { value: 0.001 },
        uMinPx: { value: MIN_PX },
        uMaxPx: { value: MAX_PX },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: AdditiveBlending,
    });

    const mesh = new InstancedMesh(geometry, material, n);
    mesh.frustumCulled = false;
    const m = new Matrix4();
    const p = layout.positions;
    for (let i = 0; i < n; i++) {
      m.makeTranslation(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    const colors = new Float32Array(n * 3).fill(1);
    mesh.instanceColor = new InstancedBufferAttribute(colors, 3);
    mesh.instanceColor.setUsage(35048 /* DynamicDrawUsage */);
    const colorKey = new Array<string>(n).fill('');
    return { mesh, material, colorKey, pulse };
  }, [list]);

  useEffect(() => {
    handle = built;
    return () => {
      if (handle === built) handle = null;
      if (built) { built.mesh.geometry.dispose(); built.material.dispose(); }
    };
  }, [built]);

  // Incremental recolour: only instances whose ownership key changed are written.
  useEffect(() => {
    if (!built) return;
    const { mesh, colorKey, pulse } = built;
    const color = mesh.instanceColor!;
    const c = new Color();
    const myId = me?.identity ?? null;
    let dirty = false;
    for (let i = 0; i < list.length; i++) {
      const claim = claims.get(list[i].id);
      const key = claim ? (claim.owner === myId ? 'gold' : claim.ownerCrew) : 'white';
      if (colorKey[i] === key) continue;
      colorKey[i] = key;
      if (key === 'white') c.set(UNCLAIMED);
      else if (key === 'gold') c.set(GOLD);
      else c.set(CREWS[key as keyof typeof CREWS]?.color ?? UNCLAIMED);
      color.setXYZ(i, c.r, c.g, c.b);
      pulse.setX(i, key === 'gold' ? 1 : 0);
      dirty = true;
    }
    if (dirty) { color.needsUpdate = true; pulse.needsUpdate = true; }
  }, [built, claims, me?.identity, list]);

  useFrame(({ camera, size, clock }) => {
    if (!built) return;
    const cam = camera as { fov?: number };
    const fovTan = Math.tan(((cam.fov ?? 60) * Math.PI) / 360);
    built.material.uniforms.uPixelScale.value = (2 * fovTan) / size.height;
    built.material.uniforms.uTime.value = clock.elapsedTime;
  });

  if (!built) return null;
  return <primitive ref={ref} object={built.mesh} />;
}
