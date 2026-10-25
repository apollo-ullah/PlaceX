// When an object is selected, its whole system is drawn as real spheres with class materials,
// plus a selection ring on the chosen world and a hover ring on desktop.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry,
  ShaderMaterial, SphereGeometry, Vector3,
} from 'three';
import { useObjects, useSceneStore } from '../state';
import { HABITABLE, type CelestialObject } from '../types';
import { getLayout, systemCenter, visualRadius, worldPosition } from './layout';
import { makePlanetMaterial } from './planetShader';
import { IS_MOBILE } from './bus';

const sphereGeo = new SphereGeometry(1, IS_MOBILE ? 28 : 40, IS_MOBILE ? 20 : 28);
const ringGeo = new RingGeometry(1, 1.07, 48);

function Planet({ obj, selected, lightPos }: { obj: CelestialObject; selected: boolean; lightPos: Vector3 }) {
  const ref = useRef<Mesh>(null);
  const material = useMemo(() => makePlanetMaterial(obj.cls), [obj.cls]);
  useEffect(() => () => material.dispose(), [material]);
  const pos = useMemo(() => worldPosition(obj, new Vector3()), [obj]);
  const radius = visualRadius(obj);

  useFrame(({ clock }, dt) => {
    material.uniforms.uTime.value = clock.elapsedTime;
    material.uniforms.uSelected.value = selected ? 1 : 0;
    (material.uniforms.uLightPos.value as Vector3).copy(lightPos);
    if (ref.current) ref.current.rotation.y += dt * 0.12;
  });

  return (
    <mesh ref={ref} position={pos} scale={radius} geometry={sphereGeo} material={material} />
  );
}

/** Host star glow when the catalog has no `star` row for this system. */
function HostStar({ center }: { center: Vector3 }) {
  const material = useMemo(() => makePlanetMaterial('star'), []);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }) => { material.uniforms.uTime.value = clock.elapsedTime; });
  return <mesh position={center} scale={0.11} geometry={sphereGeo} material={material} />;
}

function Ring({ getTarget, color, opacity }: { getTarget: () => { pos: Vector3; radius: number } | null; color: string; opacity: number }) {
  const ref = useRef<Mesh>(null);
  const material = useMemo(() => new MeshBasicMaterial({
    color: new Color(color), transparent: true, opacity, side: DoubleSide,
    depthWrite: false, depthTest: false, blending: AdditiveBlending,
  }), [color, opacity]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ camera, size, clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = getTarget();
    if (!t) { m.visible = false; return; }
    m.visible = true;
    m.position.copy(t.pos);
    m.quaternion.copy(camera.quaternion);
    const dist = camera.position.distanceTo(t.pos);
    const fovTan = Math.tan((((camera as { fov?: number }).fov ?? 60) * Math.PI) / 360);
    const unitsPerPx = (2 * dist * fovTan) / size.height;
    const minWorld = unitsPerPx * 18;
    const s = Math.max(t.radius * 1.9, minWorld) * (1 + 0.04 * Math.sin(clock.elapsedTime * 3));
    m.scale.setScalar(s);
  });

  return <mesh ref={ref} geometry={ringGeo} material={material} renderOrder={5} />;
}

export function SystemView() {
  const selectedId = useSceneStore(s => s.selectedObjectId);
  const { byId, list } = useObjects();
  const group = useRef<Group>(null);
  const selected = selectedId ? byId.get(selectedId) : undefined;

  const siblings = useMemo(() => {
    if (!selected || list.length === 0) return [] as CelestialObject[];
    const ids = getLayout().systems.get(selected.system) ?? [selected.id];
    return ids.map(id => byId.get(id)).filter((o): o is CelestialObject => !!o);
  }, [selected, byId, list]);

  const center = useMemo(() => (selected ? systemCenter(selected.system, new Vector3()) ?? new Vector3() : new Vector3()), [selected]);
  const hasStar = siblings.some(o => o.cls === 'star');

  const selTarget = () => {
    const id = useSceneStore.getState().selectedObjectId;
    const o = id ? byId.get(id) : undefined;
    if (!o) return null;
    return { pos: worldPosition(o, selPos), radius: visualRadius(o) };
  };
  const hovTarget = () => {
    const s = useSceneStore.getState();
    if (!s.hoveredObjectId || s.hoveredObjectId === s.selectedObjectId) return null;
    const o = byId.get(s.hoveredObjectId);
    if (!o) return null;
    return { pos: worldPosition(o, hovPos), radius: visualRadius(o) };
  };

  const habitable = useMemo(() => siblings.filter(o => o.habitableZone), [siblings]);

  return (
    <group ref={group}>
      {siblings.map(o => (
        <Planet key={o.id} obj={o} selected={o.id === selectedId} lightPos={center} />
      ))}
      {selected && !hasStar && <HostStar center={center} />}
      {/* Soft mint ring on every habitable-zone world in the open system. */}
      {habitable.map(o => (
        <Ring
          key={`hz-${o.id}`}
          color={HABITABLE}
          opacity={o.id === selectedId ? 0.35 : 0.55}
          getTarget={() => ({ pos: worldPosition(o, hzPos), radius: visualRadius(o) * 1.15 })}
        />
      ))}
      <Ring getTarget={selTarget} color={selected?.habitableZone ? HABITABLE : '#ffd54a'} opacity={0.9} />
      {!IS_MOBILE && <Ring getTarget={hovTarget} color="#ffffff" opacity={0.45} />}
    </group>
  );
}

const selPos = new Vector3();
const hovPos = new Vector3();
const hzPos = new Vector3();
