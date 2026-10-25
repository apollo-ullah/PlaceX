// Delight effects: warp streaks for Teleport, claim rockets from Earth, flags left behind,
// and ripples at a claimed object.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry,
  DoubleSide, Group, Line, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial,
  PlaneGeometry, RingGeometry, ShaderMaterial, SphereGeometry, Vector3,
} from 'three';
import { clamp01, easeOutCubic, rig, useFx, type Beacon, type Ripple, type Rocket } from './bus';

/* ---------------------------------- warp streaks ---------------------------------- */

const STREAKS = 260;

const streakVert = /* glsl */ `
  attribute float aT;
  attribute float aSeed;
  uniform float uIntensity;
  varying float vA;
  void main() {
    // position.xy is the radial direction, position.z the inner radius on the z = -1 plane.
    float len = (0.25 + aSeed * 0.9) * uIntensity * 1.6;
    float r = position.z + aT * len;
    vec3 p = vec3(position.xy * r, -1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    vA = uIntensity * (0.15 + 0.85 * aT);
  }
`;
const streakFrag = /* glsl */ `
  precision mediump float;
  varying float vA;
  void main() { gl_FragColor = vec4(vec3(0.75, 0.85, 1.0) * vA, 1.0); }
`;

function WarpStreaks() {
  const ref = useRef<LineSegments>(null);
  const { geometry, material } = useMemo(() => {
    const pos = new Float32Array(STREAKS * 2 * 3);
    const t = new Float32Array(STREAKS * 2);
    const seed = new Float32Array(STREAKS * 2);
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < STREAKS; i++) {
      const a = rnd() * Math.PI * 2;
      const r0 = 0.05 + Math.pow(rnd(), 0.7) * 1.3;
      const sd = rnd();
      for (let k = 0; k < 2; k++) {
        const j = i * 2 + k;
        pos[j * 3] = Math.cos(a); pos[j * 3 + 1] = Math.sin(a); pos[j * 3 + 2] = r0;
        t[j] = k; seed[j] = sd;
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('aT', new BufferAttribute(t, 1));
    g.setAttribute('aSeed', new BufferAttribute(seed, 1));
    const m = new ShaderMaterial({
      vertexShader: streakVert, fragmentShader: streakFrag,
      uniforms: { uIntensity: { value: 0 } },
      transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending,
    });
    return { geometry: g, material: m };
  }, []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useFrame(({ camera }) => {
    const l = ref.current;
    if (!l) return;
    l.visible = rig.warpIntensity > 0.001;
    if (!l.visible) return;
    l.position.copy(camera.position);
    l.quaternion.copy(camera.quaternion);
    material.uniforms.uIntensity.value = rig.warpIntensity;
  });

  return <lineSegments ref={ref} geometry={geometry} material={material} frustumCulled={false} renderOrder={20} />;
}

/* ------------------------------------- rocket ------------------------------------- */

const noseGeo = new ConeGeometry(0.28, 0.7, 10);
const bodyGeo = new CylinderGeometry(0.26, 0.3, 0.9, 10);
const flameGeo = new SphereGeometry(0.3, 8, 6);
const bodyMat = new MeshBasicMaterial({ color: '#e8e8ee' });
const flameMat = new MeshBasicMaterial({ color: '#ffa040', transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false });
const TRAIL = 16;

function bezier(a: Vector3, c: Vector3, b: Vector3, t: number, out: Vector3) {
  const u = 1 - t;
  return out.set(
    u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    u * u * a.z + 2 * u * t * c.z + t * t * b.z,
  );
}

function RocketFx({ r }: { r: Rocket }) {
  const group = useRef<Group>(null);
  const trail = useRef<Line>(null);
  const done = useRef(false);
  const noseMat = useMemo(() => new MeshBasicMaterial({ color: new Color(r.color) }), [r.color]);
  const trailGeo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(TRAIL * 3), 3));
    return g;
  }, []);
  const trailMat = useMemo(() => new LineBasicMaterial({ color: new Color(r.color), transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false }), [r.color]);
  const trailLine = useMemo(() => {
    const l = new Line(trailGeo, trailMat);
    l.frustumCulled = false;
    return l;
  }, [trailGeo, trailMat]);
  useEffect(() => () => { noseMat.dispose(); trailGeo.dispose(); trailMat.dispose(); }, [noseMat, trailGeo, trailMat]);
  const tmp = useMemo(() => ({ p: new Vector3(), q: new Vector3() }), []);

  useFrame(({ camera }) => {
    const g = group.current;
    if (!g || done.current) return;
    const now = performance.now();
    const t = clamp01((now - r.start) / r.dur);
    const te = t < 0.15 ? (t / 0.15) * 0.15 : t; // tiny launch dwell, then linear
    bezier(r.from, r.ctrl, r.to, te, tmp.p);
    bezier(r.from, r.ctrl, r.to, Math.min(1, te + 0.01), tmp.q);
    g.position.copy(tmp.p);
    if (tmp.q.distanceToSquared(tmp.p) > 1e-12) {
      g.lookAt(tmp.q);
      g.rotateX(Math.PI / 2); // cone points along +Y locally, so align +Y with the path
    }
    const dist = camera.position.distanceTo(tmp.p);
    g.scale.setScalar(Math.max(0.03, dist * 0.014));
    const flame = g.children[2] as Mesh | undefined;
    if (flame) flame.scale.setScalar(0.8 + 0.5 * Math.random());

    // Trail: previous points along the curve.
    const tr = trail.current;
    if (tr) {
      const attr = tr.geometry.getAttribute('position') as BufferAttribute;
      for (let i = 0; i < TRAIL; i++) {
        const tt = Math.max(0, te - (i / TRAIL) * 0.12);
        bezier(r.from, r.ctrl, r.to, tt, tmp.q);
        attr.setXYZ(i, tmp.q.x, tmp.q.y, tmp.q.z);
      }
      attr.needsUpdate = true;
    }

    if (t >= 1) {
      done.current = true;
      const fx = useFx.getState();
      fx.addBeacon({ pos: r.to.clone(), color: r.color, radius: 0.06 });
      fx.addRipple({ pos: r.to.clone(), color: r.color, start: now, dur: 900 });
      fx.removeRocket(r.id);
    }
  });

  return (
    <>
      <group ref={group}>
        <mesh geometry={noseGeo} material={noseMat} position={[0, 0.8, 0]} />
        <mesh geometry={bodyGeo} material={bodyMat} />
        <mesh geometry={flameGeo} material={flameMat} position={[0, -0.65, 0]} />
      </group>
      <primitive object={trailLine} ref={trail} />
    </>
  );
}

/* --------------------------------------- flag -------------------------------------- */

const poleGeo = new CylinderGeometry(0.018, 0.018, 0.6, 6);
const flagGeo = new PlaneGeometry(0.34, 0.2);
const poleMat = new MeshBasicMaterial({ color: '#d0d0d8' });

function BeaconFx({ b }: { b: Beacon }) {
  const group = useRef<Group>(null);
  const flagMat = useMemo(() => new MeshBasicMaterial({ color: new Color(b.color), side: DoubleSide }), [b.color]);
  useEffect(() => () => flagMat.dispose(), [flagMat]);
  const anchor = useMemo(() => b.pos.clone().add(new Vector3(0, b.radius + 0.01, 0)), [b]);

  useFrame(({ camera, clock }) => {
    const g = group.current;
    if (!g) return;
    const dist = camera.position.distanceTo(anchor);
    g.scale.setScalar(Math.max(0.1, dist * 0.02));
    const flag = g.children[1] as Mesh | undefined;
    if (flag) flag.rotation.y = Math.sin(clock.elapsedTime * 3 + b.id) * 0.25;
  });

  return (
    <group ref={group} position={anchor}>
      <mesh geometry={poleGeo} material={poleMat} position={[0, 0.3, 0]} />
      <mesh geometry={flagGeo} material={flagMat} position={[0.17, 0.5, 0]} />
    </group>
  );
}

/* -------------------------------------- ripple ------------------------------------- */

const rippleGeo = new RingGeometry(0.9, 1, 48);

function RippleFx({ r }: { r: Ripple }) {
  const ref = useRef<Mesh>(null);
  const mat = useMemo(() => new MeshBasicMaterial({
    color: new Color(r.color), transparent: true, opacity: 1, side: DoubleSide,
    depthWrite: false, depthTest: false, blending: AdditiveBlending,
  }), [r.color]);
  useEffect(() => () => mat.dispose(), [mat]);

  useFrame(({ camera, size }) => {
    const m = ref.current;
    if (!m) return;
    const t = clamp01((performance.now() - r.start) / r.dur);
    const e = easeOutCubic(t);
    m.position.copy(r.pos);
    m.quaternion.copy(camera.quaternion);
    const dist = camera.position.distanceTo(r.pos);
    const fovTan = Math.tan((((camera as { fov?: number }).fov ?? 60) * Math.PI) / 360);
    const unitsPerPx = (2 * dist * fovTan) / size.height;
    m.scale.setScalar(unitsPerPx * (10 + 110 * e));
    mat.opacity = 1 - e;
    if (t >= 1) useFx.getState().removeRipple(r.id);
  });

  return <mesh ref={ref} geometry={rippleGeo} material={mat} renderOrder={6} />;
}

/* -------------------------------------- export ------------------------------------- */

export function Effects() {
  const rockets = useFx(s => s.rockets);
  const beacons = useFx(s => s.beacons);
  const ripples = useFx(s => s.ripples);
  return (
    <>
      <WarpStreaks />
      {rockets.map(r => <RocketFx key={r.id} r={r} />)}
      {beacons.map(b => <BeaconFx key={b.id} b={b} />)}
      {ripples.map(r => <RippleFx key={r.id} r={r} />)}
    </>
  );
}
