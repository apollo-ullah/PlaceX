// Static catalog loaded once from /data/objects.json. Owned by the lead.
import { create } from 'zustand';
import type { CelestialObject } from '../types';

interface ObjectsState {
  loaded: boolean;
  error: string | null;
  list: CelestialObject[];
  byId: Map<string, CelestialObject>;
  load: () => Promise<void>;
}

let loading: Promise<void> | null = null;

export const useObjectsStore = create<ObjectsState>((set, get) => ({
  loaded: false,
  error: null,
  list: [],
  byId: new Map(),
  load: () => {
    if (get().loaded) return Promise.resolve();
    if (loading) return loading;
    loading = fetch('/data/objects.json')
      .then(r => {
        if (!r.ok) throw new Error(`objects.json ${r.status}`);
        return r.json() as Promise<CelestialObject[]>;
      })
      .then(list => {
        const byId = new Map<string, CelestialObject>();
        for (const o of list) byId.set(o.id, o);
        set({ list, byId, loaded: true, error: null });
      })
      .catch(e => {
        set({ error: String(e), loaded: false });
        loading = null;
      });
    return loading;
  },
}));

/** All objects (empty until loaded). Triggers the load on first use. */
export function useObjects(): { list: CelestialObject[]; byId: Map<string, CelestialObject>; loaded: boolean } {
  const { list, byId, loaded, load } = useObjectsStore();
  if (!loaded) void load();
  return { list, byId, loaded };
}

export function useObject(id: string | null | undefined): CelestialObject | undefined {
  const byId = useObjectsStore(s => s.byId);
  const load = useObjectsStore(s => s.load);
  const loaded = useObjectsStore(s => s.loaded);
  if (!loaded) void load();
  return id ? byId.get(id) : undefined;
}

/** Case-insensitive prefix/substring search by name or system. */
export function searchObjects(list: CelestialObject[], q: string, limit = 8): CelestialObject[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const starts: CelestialObject[] = [];
  const contains: CelestialObject[] = [];
  for (const o of list) {
    const n = o.name.toLowerCase();
    if (n.startsWith(s)) starts.push(o);
    else if (n.includes(s) || o.system.toLowerCase().includes(s)) contains.push(o);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
