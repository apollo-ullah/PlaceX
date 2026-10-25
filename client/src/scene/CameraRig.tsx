// Orbit controls tuned for touch, plus the per-frame driver for fly, warp, idle rotation and
// camera-settle reporting (setFocus and setCameraPos, throttled). Registers the SceneApi.
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useObjectsStore, useSceneStore } from '../state';
import { clamp01, DEBUG, easeInCubic, easeInOutCubic, easeOutCubic, rig } from './bus';
import { expandPoint, nearestObject, worldPosition } from './layout';
import { makeSceneApi, WARP_ARRIVE, WARP_CHARGE } from './api';

export const BASE_FOV = 60;
const SETTLE_MS = 300;

export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree(s => s.camera) as PerspectiveCamera;
  const registerApi = useSceneStore(s => s.registerApi);
  const settle = useRef({ lastPos: new Vector3(), lastTarget: new Vector3(), lastMove: 0, reported: false });
  const tmp = useRef(new Vector3());

  useEffect(() => {
    rig.camera = camera;
    rig.controls = controls.current;
    const api = makeSceneApi();
    registerApi(api);
    if (DEBUG) {
      // Dev-only hook so the console and headless tests can drive the scene: window.__placex
      (window as unknown as { __placex?: unknown }).__placex = { api, store: useSceneStore, rig, worldPosition, objects: useObjectsStore };
    }
    return () => {
      registerApi(null);
      rig.camera = null;
      rig.controls = null;
      rig.fly = null;
      rig.warp = null;
      rig.warpIntensity = 0;
    };
  }, [camera, registerApi]);

  useFrame((_, rawDt) => {
    const ctr = controls.current;
    if (!ctr) return;
    rig.controls = ctr;
    const dt = Math.min(rawDt, 0.05);
    const cam = camera;

    if (rig.warp) {
      const w = rig.warp;
      w.t += dt;
      if (!w.landed) {
        const k = clamp01(w.t / WARP_CHARGE);
        const e = easeInCubic(k);
        cam.fov = BASE_FOV + 55 * e;
        rig.warpIntensity = e;
        // Nudge forward to sell the acceleration.
        tmp.current.copy(ctr.target).sub(cam.position).normalize();
        cam.position.addScaledVector(tmp.current, dt * 2.5 * e);
        if (k >= 1) {
          w.landed = true;
          cam.position.copy(w.toPos);
          ctr.target.copy(w.toTarget);
          cam.lookAt(ctr.target);
          useSceneStore.getState().select(w.selectId);
        }
      } else {
        const k = clamp01((w.t - WARP_CHARGE) / WARP_ARRIVE);
        const e = easeOutCubic(k);
        cam.fov = BASE_FOV + 55 * (1 - e);
        rig.warpIntensity = 1 - e;
        if (k >= 1) {
          rig.warp = null;
          rig.warpIntensity = 0;
          cam.fov = BASE_FOV;
        }
      }
      cam.updateProjectionMatrix();
    } else if (rig.fly) {
      const f = rig.fly;
      f.t += dt;
      const k = clamp01(f.t / f.dur);
      const e = easeInOutCubic(k);
      cam.position.lerpVectors(f.fromPos, f.toPos, e);
      ctr.target.lerpVectors(f.fromTarget, f.toTarget, e);
      cam.lookAt(ctr.target);
      if (k >= 1) rig.fly = null;
    }

    ctr.autoRotate = rig.autoRotate && !rig.fly && !rig.warp;

    // Settle detection: report focus and camera position once motion stops.
    const s = settle.current;
    const now = performance.now();
    const moved = cam.position.distanceToSquared(s.lastPos) > 1e-8 || ctr.target.distanceToSquared(s.lastTarget) > 1e-8;
    if (moved) {
      s.lastPos.copy(cam.position);
      s.lastTarget.copy(ctr.target);
      s.lastMove = now;
      s.reported = false;
    } else if (!s.reported && now - s.lastMove > SETTLE_MS) {
      s.reported = true;
      const store = useSceneStore.getState();
      let focusId = store.selectedObjectId;
      if (!focusId) focusId = nearestObject(ctr.target.x, ctr.target.y, ctr.target.z)?.id ?? null;
      if (store.focusObjectId !== focusId) store.setFocus(focusId);
      const ly = expandPoint(cam.position.x, cam.position.y, cam.position.z, tmp.current);
      store.setCameraPos(ly.x, ly.y, ly.z);
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.1}
      rotateSpeed={0.55}
      zoomSpeed={0.9}
      enablePan={false}
      minDistance={0.18}
      maxDistance={700}
      autoRotate
      autoRotateSpeed={0.35}
      target={[0, 0, 0]}
    />
  );
}
