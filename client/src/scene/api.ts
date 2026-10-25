// Imperative camera and effect commands. CameraRig registers these as the SceneApi and the
// pointer layer calls flyToObject on tap. All functions are safe to call before the scene
// has mounted (they no-op).
import { Vector3 } from 'three';
import { useObjectsStore, useSceneStore, type SceneApi } from '../state';
import type { CelestialObject } from '../types';
import { IS_MOBILE, rig, useFx } from './bus';
import { getLayout, LAYOUT, systemCenter, visualRadius, worldPosition } from './layout';

export const WARP_CHARGE = 0.5;   // seconds, fov widens and streaks build
export const WARP_ARRIVE = 0.85;  // seconds, settle at the destination
const WORLD_UP = new Vector3(0, 1, 0);

function framing(obj: CelestialObject, dir: Vector3, distMult: number) {
  const cam = rig.camera!;
  const target = worldPosition(obj, new Vector3());
  // Far enough to see the object's siblings (the ring), never closer than FRAME_DISTANCE.
  const byId = useObjectsStore.getState().byId;
  let spread = 0;
  const tmp = new Vector3();
  for (const id of getLayout().systems.get(obj.system) ?? []) {
    const sib = byId.get(id);
    if (sib && sib.id !== obj.id) spread = Math.max(spread, worldPosition(sib, tmp).distanceTo(target));
  }
  const dist = Math.max(LAYOUT.FRAME_DISTANCE, visualRadius(obj) * 9, spread * 0.85) * distMult;
  dir.normalize();
  // Swing toward the host star so the lit face of the planet is what the player sees.
  const center = systemCenter(obj.system, new Vector3());
  if (center && obj.cls !== 'star') {
    const toStar = center.sub(target);
    if (toStar.lengthSq() > 1e-6) dir.multiplyScalar(0.5).addScaledVector(toStar.normalize(), 0.6);
  }
  dir.y = Math.max(dir.y, 0.35);
  dir.normalize();
  const pos = target.clone().addScaledVector(dir, dist);
  // Keep the object in the upper part of the screen so the listing card does not cover it.
  const viewDir = dir.clone().negate();
  const screenUp = WORLD_UP.clone().addScaledVector(viewDir, -WORLD_UP.dot(viewDir)).normalize();
  const fovTan = Math.tan((cam.fov * Math.PI) / 360);
  const lift = dist * fovTan * (IS_MOBILE ? 0.42 : 0.15);
  const lookAt = target.clone().addScaledVector(screenUp, -lift);
  return { pos, lookAt };
}

/** Ease the camera to frame an object. Does not change selection. */
export function flyToObject(obj: CelestialObject, distMult = 1) {
  const cam = rig.camera, ctr = rig.controls;
  if (!cam || !ctr) return;
  rig.autoRotate = false;
  rig.warp = null;
  rig.warpIntensity = 0;
  const dir = cam.position.clone().sub(ctr.target);
  if (dir.lengthSq() < 1e-8) dir.set(0.3, 0.5, 1);
  const { pos, lookAt } = framing(obj, dir, distMult);
  const travel = cam.position.distanceTo(pos);
  const dur = Math.min(2.4, 0.7 + Math.sqrt(travel) * 0.13);
  rig.fly = {
    fromPos: cam.position.clone(), toPos: pos,
    fromTarget: ctr.target.clone(), toTarget: lookAt,
    t: 0, dur,
  };
}

export function flyToId(id: string, distMult = 1) {
  const obj = useObjectsStore.getState().byId.get(id);
  if (obj) flyToObject(obj, distMult);
}

/** Warp to a random system (never the one in focus) and select one of its worlds. */
export function teleport() {
  const cam = rig.camera, ctr = rig.controls;
  if (!cam || !ctr) return;
  const layout = getLayout();
  if (layout.list.length === 0) return;
  const store = useSceneStore.getState();
  const byId = useObjectsStore.getState().byId;
  const currentSystem = store.focusObjectId ? byId.get(store.focusObjectId)?.system : undefined;
  const names = [...layout.systems.keys()].filter(s => s !== currentSystem);
  if (names.length === 0) return;
  const system = names[Math.floor(Math.random() * names.length)];
  const ids = layout.systems.get(system) ?? [];
  const worlds = ids.map(id => byId.get(id)).filter((o): o is CelestialObject => !!o && o.cls !== 'star');
  const pool = worlds.length ? worlds : ids.map(id => byId.get(id)!).filter(Boolean);
  if (pool.length === 0) return;
  const obj = pool[Math.floor(Math.random() * pool.length)];
  const a = Math.random() * Math.PI * 2;
  const dir = new Vector3(Math.cos(a), 0.4 + Math.random() * 0.5, Math.sin(a));
  const { pos, lookAt } = framing(obj, dir, 1.25);
  rig.autoRotate = false;
  rig.fly = null;
  rig.warp = { t: 0, landed: false, toPos: pos, toTarget: lookAt, selectId: obj.id };
}

/** Rocket from Earth to the object, then a flag in `color`. */
export function playClaimAnimation(id: string, color: string) {
  const byId = useObjectsStore.getState().byId;
  const obj = byId.get(id);
  if (!obj) return;
  const to = worldPosition(obj, new Vector3());
  const earth = byId.get('earth');
  const from = earth ? worldPosition(earth, new Vector3()) : new Vector3(0, 0, 0);
  if (from.distanceToSquared(to) < 1e-6) from.add(new Vector3(0.3, 0.2, 0.3));
  const d = from.distanceTo(to);
  // Bend the path through the camera's side of the target so the final approach is on screen.
  const cam = rig.camera;
  let ctrl: Vector3;
  if (cam) {
    const toTarget = to.clone().sub(cam.position);
    const side = new Vector3().crossVectors(toTarget, WORLD_UP).normalize();
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    const camDist = toTarget.length();
    ctrl = cam.position.clone().addScaledVector(toTarget, 0.55).addScaledVector(side, camDist * 0.45).addScaledVector(WORLD_UP, camDist * 0.15);
  } else {
    ctrl = from.clone().lerp(to, 0.5).addScaledVector(WORLD_UP, Math.max(0.3, d * 0.3));
  }
  useFx.getState().addRocket({ from, to, ctrl, color, start: performance.now(), dur: 1500, targetId: id });
}

/** Brief ripple at an object when anyone claims it. */
export function playClaimRipple(id: string, color: string) {
  const obj = useObjectsStore.getState().byId.get(id);
  if (!obj) return;
  useFx.getState().addRipple({ pos: worldPosition(obj, new Vector3()), color, start: performance.now(), dur: 900 });
}

export function makeSceneApi(): SceneApi {
  return {
    flyTo: id => {
      useSceneStore.getState().select(id);
      flyToId(id);
    },
    teleport,
    playClaimAnimation,
    playClaimRipple,
  };
}
