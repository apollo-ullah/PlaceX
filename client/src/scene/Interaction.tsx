// Pointer layer: tap to select (screen-space pick over all instances), tap empty space to
// clear, hover highlight with a mouse. Drags and pinches are left to OrbitControls.
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useObjectsStore, useSceneStore } from '../state';
import { IS_MOBILE, rig } from './bus';
import { pickObjectAt } from './Objects';
import { flyToObject } from './api';

const TAP_MAX_MOVE_PX = 10;
const TAP_MAX_MS = 450;
const HOVER_INTERVAL_MS = 40;

export function Interaction() {
  const gl = useThree(s => s.gl);
  const camera = useThree(s => s.camera);

  useEffect(() => {
    const el = gl.domElement;
    let down: { x: number; y: number; t: number } | null = null;
    let pointers = 0;
    let maxPointers = 0;
    let lastHover = 0;

    const pick = (clientX: number, clientY: number, slop: number) => {
      const rect = el.getBoundingClientRect();
      return pickObjectAt(clientX - rect.left, clientY - rect.top, camera, rect.width, rect.height, slop);
    };

    const onDown = (e: PointerEvent) => {
      pointers++;
      maxPointers = Math.max(maxPointers, pointers);
      if (pointers === 1) {
        down = { x: e.clientX, y: e.clientY, t: performance.now() };
        maxPointers = 1;
      }
      // Any touch interrupts a fly so the player is always in control.
      rig.fly = null;
      rig.autoRotate = false;
    };

    const onUp = (e: PointerEvent) => {
      pointers = Math.max(0, pointers - 1);
      if (!down || pointers !== 0) return;
      const d = down;
      down = null;
      if (maxPointers > 1) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (dx * dx + dy * dy > TAP_MAX_MOVE_PX * TAP_MAX_MOVE_PX) return;
      if (performance.now() - d.t > TAP_MAX_MS) return;
      if (rig.warp) return;
      const id = pick(e.clientX, e.clientY, e.pointerType === 'touch' ? 22 : 10);
      const store = useSceneStore.getState();
      if (id) {
        store.select(id);
        const obj = useObjectsStore.getState().byId.get(id);
        if (obj) flyToObject(obj);
      } else {
        store.select(null);
      }
    };

    const onCancel = () => { pointers = 0; down = null; };

    const onMove = (e: PointerEvent) => {
      if (IS_MOBILE || e.pointerType !== 'mouse' || pointers > 0) return;
      const now = performance.now();
      if (now - lastHover < HOVER_INTERVAL_MS) return;
      lastHover = now;
      const id = pick(e.clientX, e.clientY, 8);
      const store = useSceneStore.getState();
      if (store.hoveredObjectId !== id) store.setHovered(id);
      el.style.cursor = id ? 'pointer' : '';
    };

    const onLeave = () => {
      const store = useSceneStore.getState();
      if (store.hoveredObjectId) store.setHovered(null);
      el.style.cursor = '';
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [gl, camera]);

  return null;
}
