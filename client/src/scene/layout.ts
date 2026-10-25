// Universe layout: maps catalog coordinates (light years, Earth at origin) to scene units.
// The UI and presence code must use the same mapping, so everything lives here.
//
// Mapping (documented in HANDOFF.md):
//   1. Radial log compression. For an object at distance r (ly) in direction d (unit vector),
//      the system centre is placed at  d * A * ln(1 + r / R0)  with A = 30, R0 = 10.
//      Below R0 the mapping is nearly linear (about 3 scene units per ly), so the Solar
//      neighbourhood is navigable; 100 ly lands at 72 units, 1,000 ly at 138, 10,000 ly at 207.
//   2. Sibling ring. Objects that share a `system` (and therefore identical catalog coordinates)
//      are spread around the system centre on a small ring so each can be tapped: a `star`
//      sits at the centre, every other sibling i (ordered by orbital period, unknown last) sits
//      at radius RING_BASE + RING_STEP * i and angle i * goldenAngle + hash(system).
//   3. Background stars are drawn on a sky sphere of radius SKY_RADIUS in their true direction.
import { Vector3 } from 'three';
import type { CelestialObject } from '../types';
import { useObjectsStore } from '../state';

export const LAYOUT = {
  A: 30,
  R0: 10,
  RING_BASE: 0.4,
  RING_STEP: 0.22,
  SKY_RADIUS: 600,
  /** Camera distance from a selected object when framing it. */
  FRAME_DISTANCE: 1.1,
} as const;

const GOLDEN = 2.399963229728653;

export function compressDistance(ly: number): number {
  return LAYOUT.A * Math.log1p(Math.max(0, ly) / LAYOUT.R0);
}

export function expandDistance(units: number): number {
  return LAYOUT.R0 * Math.expm1(Math.max(0, units) / LAYOUT.A);
}

/** Compress a light-year point to scene units (no sibling offset). */
export function compressPoint(x: number, y: number, z: number, out = new Vector3()): Vector3 {
  const r = Math.hypot(x, y, z);
  if (r < 1e-9) return out.set(0, 0, 0);
  const s = compressDistance(r) / r;
  return out.set(x * s, y * s, z * s);
}

/** Inverse of compressPoint: scene units back to light years. */
export function expandPoint(x: number, y: number, z: number, out = new Vector3()): Vector3 {
  const r = Math.hypot(x, y, z);
  if (r < 1e-9) return out.set(0, 0, 0);
  const s = expandDistance(r) / r;
  return out.set(x * s, y * s, z * s);
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** Visual sphere radius in scene units from planet radius (Earth radii). */
export function visualRadius(obj: CelestialObject): number {
  const r = obj.radiusEarth ?? (obj.cls === 'star' ? 100 : 1);
  return 0.03 + 0.08 * Math.log10(1 + Math.max(0, r));
}

export interface Layout {
  /** xyz per object, in list order. */
  positions: Float32Array;
  /** object id to index in `positions` and in the source list. */
  index: Map<string, number>;
  /** system name to object ids, in ring order (star first). */
  systems: Map<string, string[]>;
  /** system name to compressed centre. */
  centers: Map<string, Vector3>;
  list: CelestialObject[];
}

let cache: Layout | null = null;

function orderKey(o: CelestialObject): number {
  if (o.cls === 'star') return -1;
  return o.orbitalPeriodDays ?? Number.MAX_SAFE_INTEGER;
}

export function buildLayout(list: CelestialObject[]): Layout {
  const positions = new Float32Array(list.length * 3);
  const index = new Map<string, number>();
  const systems = new Map<string, string[]>();
  const centers = new Map<string, Vector3>();
  const bySystem = new Map<string, number[]>();

  list.forEach((o, i) => {
    index.set(o.id, i);
    let arr = bySystem.get(o.system);
    if (!arr) bySystem.set(o.system, (arr = []));
    arr.push(i);
  });

  const tmp = new Vector3();
  for (const [system, idxs] of bySystem) {
    idxs.sort((a, b) => {
      const d = orderKey(list[a]) - orderKey(list[b]);
      return d !== 0 ? d : list[a].name.localeCompare(list[b].name);
    });
    const first = list[idxs[0]];
    const center = compressPoint(first.x, first.y, first.z, new Vector3());
    centers.set(system, center);
    const phase = hashString(system) * Math.PI * 2;
    let ring = 0;
    const ids: string[] = [];
    for (const i of idxs) {
      const o = list[i];
      ids.push(o.id);
      if (o.cls === 'star') {
        tmp.set(0, 0, 0);
      } else {
        const rad = LAYOUT.RING_BASE + LAYOUT.RING_STEP * ring;
        const ang = phase + ring * GOLDEN;
        tmp.set(Math.cos(ang) * rad, Math.sin(ang * 2) * rad * 0.18, Math.sin(ang) * rad);
        ring++;
      }
      positions[i * 3] = center.x + tmp.x;
      positions[i * 3 + 1] = center.y + tmp.y;
      positions[i * 3 + 2] = center.z + tmp.z;
    }
    systems.set(system, ids);
  }

  cache = { positions, index, systems, centers, list };
  return cache;
}

/** Layout for the current catalog. Rebuilds only when the catalog list changes. */
export function getLayout(): Layout {
  const list = useObjectsStore.getState().list;
  if (cache && cache.list === list) return cache;
  return buildLayout(list);
}

/**
 * Scene-unit position of an object. Shared by the scene, the UI and presence ghosts.
 * Falls back to the compressed system centre if the object is not in the loaded catalog.
 */
export function worldPosition(obj: CelestialObject, out = new Vector3()): Vector3 {
  const layout = getLayout();
  const i = layout.index.get(obj.id);
  if (i === undefined) return compressPoint(obj.x, obj.y, obj.z, out);
  const p = layout.positions;
  return out.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
}

/** Scene-unit centre of a system (the host star's position). */
export function systemCenter(system: string, out = new Vector3()): Vector3 | null {
  const c = getLayout().centers.get(system);
  return c ? out.copy(c) : null;
}

/** Nearest object (by scene distance) to a scene-unit point. */
export function nearestObject(x: number, y: number, z: number): CelestialObject | null {
  const layout = getLayout();
  const p = layout.positions;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < layout.list.length; i++) {
    const dx = p[i * 3] - x, dy = p[i * 3 + 1] - y, dz = p[i * 3 + 2] - z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best >= 0 ? layout.list[best] : null;
}
