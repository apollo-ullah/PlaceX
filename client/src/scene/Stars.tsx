// Background stars as one Points draw call on a sky sphere that follows the camera.
// Loads /data/stars.json ([x, y, z, mag][] in light years) and falls back to a deterministic
// procedural field concentrated along the real galactic plane.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3,
} from 'three';
import { LAYOUT } from './layout';

type StarRow = [number, number, number, number];

let starsPromise: Promise<StarRow[]> | null = null;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic placeholder sky: 5,000 stars, 55 percent hugging the galactic plane. */
export function proceduralStars(count = 5000, seed = 1337): StarRow[] {
  const rnd = mulberry32(seed);
  // North galactic pole, J2000: RA 192.859 deg, Dec 27.128 deg, in the catalog's xyz convention.
  const ra = (192.859 * Math.PI) / 180, dec = (27.128 * Math.PI) / 180;
  const n = new Vector3(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec));
  const u = new Vector3(0, 0, 1).cross(n).normalize();
  const v = new Vector3().crossVectors(n, u).normalize();
  const out: StarRow[] = [];
  const gauss = () => {
    const a = rnd() || 1e-9, b = rnd();
    return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
  };
  for (let i = 0; i < count; i++) {
    const inBand = rnd() < 0.55;
    const l = rnd() * Math.PI * 2;
    const b = inBand ? gauss() * 0.14 : Math.asin(rnd() * 2 - 1);
    const d = Math.sqrt(rnd()) * 900 + 20;
    const cb = Math.cos(b);
    const x = (Math.cos(l) * u.x + Math.sin(l) * v.x) * cb + n.x * Math.sin(b);
    const y = (Math.cos(l) * u.y + Math.sin(l) * v.y) * cb + n.y * Math.sin(b);
    const z = (Math.cos(l) * u.z + Math.sin(l) * v.z) * cb + n.z * Math.sin(b);
    const mag = inBand ? 3.5 + rnd() * 3 : 0.5 + Math.pow(rnd(), 0.6) * 6;
    out.push([x * d, y * d, z * d, mag]);
  }
  return out;
}

export function loadStars(): Promise<StarRow[]> {
  if (starsPromise) return starsPromise;
  starsPromise = fetch('/data/stars.json')
    .then(async r => {
      if (!r.ok) throw new Error(`stars.json ${r.status}`);
      const ct = r.headers.get('content-type') ?? '';
      if (!ct.includes('json')) throw new Error('stars.json is not json');
      const data = (await r.json()) as unknown;
      if (!Array.isArray(data) || data.length < 100 || !Array.isArray(data[0])) throw new Error('bad stars.json');
      return data as StarRow[];
    })
    .catch(() => proceduralStars());
  return starsPromise;
}

const vert = /* glsl */ `
  attribute float aSize;
  attribute float aBright;
  attribute float aTint;
  uniform float uDpr;
  varying float vBright;
  varying float vTint;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uDpr;
    vBright = aBright;
    vTint = aTint;
  }
`;

const frag = /* glsl */ `
  precision mediump float;
  varying float vBright;
  varying float vTint;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float a = smoothstep(1.0, 0.15, d);
    vec3 warm = vec3(1.0, 0.92, 0.80);
    vec3 cool = vec3(0.78, 0.86, 1.0);
    vec3 col = mix(warm, cool, vTint) * vBright * a;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function Stars() {
  const [rows, setRows] = useState<StarRow[] | null>(null);
  const ref = useRef<Points>(null);

  useEffect(() => {
    let alive = true;
    loadStars().then(r => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, []);

  const geometry = useMemo(() => {
    if (!rows) return null;
    const n = rows.length;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const bright = new Float32Array(n);
    const tint = new Float32Array(n);
    const R = LAYOUT.SKY_RADIUS;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const [x, y, z, mag] = rows[i];
      const len = Math.hypot(x, y, z);
      if (!isFinite(len) || len < 1e-6) continue;
      pos[k * 3] = (x / len) * R;
      pos[k * 3 + 1] = (y / len) * R;
      pos[k * 3 + 2] = (z / len) * R;
      const m = isFinite(mag) ? mag : 6;
      size[k] = Math.min(6, Math.max(1.2, 4.6 - 0.6 * m));
      bright[k] = Math.min(1, Math.max(0.22, 1.35 - 0.16 * m));
      // No colour data: pseudo-random tint seeded from position keeps the sky lively.
      tint[k] = Math.abs(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719)) ;
      k++;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos.subarray(0, k * 3), 3));
    g.setAttribute('aSize', new BufferAttribute(size.subarray(0, k), 1));
    g.setAttribute('aBright', new BufferAttribute(bright.subarray(0, k), 1));
    g.setAttribute('aTint', new BufferAttribute(tint.subarray(0, k), 1));
    return g;
  }, [rows]);

  const material = useMemo(() => new ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: { uDpr: { value: 1 } },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
  }), []);

  useEffect(() => () => { material.dispose(); geometry?.dispose(); }, [material, geometry]);

  useFrame(({ camera, viewport }) => {
    const p = ref.current;
    if (!p) return;
    p.position.copy(camera.position);
    material.uniforms.uDpr.value = viewport.dpr;
  });

  if (!geometry) return null;
  return <points ref={ref} geometry={geometry} material={material} frustumCulled={false} renderOrder={-10} />;
}
