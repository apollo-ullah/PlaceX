// Scene-internal animation state. `rig` is mutable per-frame state (no React renders);
// `useFx` holds the short lists of effects that need React to mount or unmount meshes.
import { create } from 'zustand';
import type { PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

export interface FlyAnim {
  fromPos: Vector3; toPos: Vector3;
  fromTarget: Vector3; toTarget: Vector3;
  t: number; dur: number;
}

export interface WarpAnim {
  t: number;
  landed: boolean;
  toPos: Vector3;
  toTarget: Vector3;
  selectId: string;
}

export const rig = {
  camera: null as PerspectiveCamera | null,
  controls: null as OrbitControlsImpl | null,
  fly: null as FlyAnim | null,
  warp: null as WarpAnim | null,
  /** 0..1, read by the warp streak effect. */
  warpIntensity: 0,
  /** True until the first pointer interaction or API call. */
  autoRotate: true,
  fps: 0,
  frameMs: 0,
};

export interface Rocket {
  id: number; from: Vector3; to: Vector3; ctrl: Vector3;
  color: string; start: number; dur: number; targetId: string;
}
export interface Beacon { id: number; pos: Vector3; color: string; radius: number; }
export interface Ripple { id: number; pos: Vector3; color: string; start: number; dur: number; }

interface FxState {
  rockets: Rocket[];
  beacons: Beacon[];
  ripples: Ripple[];
  addRocket: (r: Omit<Rocket, 'id'>) => void;
  removeRocket: (id: number) => void;
  addBeacon: (b: Omit<Beacon, 'id'>) => void;
  addRipple: (r: Omit<Ripple, 'id'>) => void;
  removeRipple: (id: number) => void;
}

let nextId = 1;

export const useFx = create<FxState>(set => ({
  rockets: [],
  beacons: [],
  ripples: [],
  addRocket: r => set(s => ({ rockets: [...s.rockets, { ...r, id: nextId++ }] })),
  removeRocket: id => set(s => ({ rockets: s.rockets.filter(r => r.id !== id) })),
  addBeacon: b => set(s => ({ beacons: [...s.beacons.slice(-199), { ...b, id: nextId++ }] })),
  addRipple: r => set(s => ({ ripples: [...s.ripples, { ...r, id: nextId++ }] })),
  removeRipple: id => set(s => ({ ripples: s.ripples.filter(r => r.id !== id) })),
}));

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export const IS_MOBILE =
  typeof navigator !== 'undefined' &&
  (navigator.maxTouchPoints > 1 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));

export const DEBUG =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === '1';
