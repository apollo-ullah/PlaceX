// Bridge between the 3D scene and the UI. Owned by the lead so both agents build
// against one interface. The scene agent registers its imperative API; the UI calls it.
import { create } from 'zustand';

export interface SceneApi {
  /** Smoothly fly the camera to an object and select it. */
  flyTo: (objectId: string) => void;
  /** Warp to a random star system with the star-streak effect. */
  teleport: () => void;
  /** Rocket from Earth to the target, then a flag in `color`. */
  playClaimAnimation: (objectId: string, color: string) => void;
  /** Brief ripple at an object when anyone claims it (Phase 3). */
  playClaimRipple?: (objectId: string, color: string) => void;
}

interface SceneState {
  selectedObjectId: string | null;
  hoveredObjectId: string | null;
  /** Object the camera is currently focused on (for presence). */
  focusObjectId: string | null;
  cameraPos: { x: number; y: number; z: number };
  api: SceneApi | null;
  select: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  setFocus: (id: string | null) => void;
  setCameraPos: (x: number, y: number, z: number) => void;
  registerApi: (api: SceneApi | null) => void;
}

export const useSceneStore = create<SceneState>(set => ({
  selectedObjectId: null,
  hoveredObjectId: null,
  focusObjectId: null,
  cameraPos: { x: 0, y: 0, z: 0 },
  api: null,
  select: id => set({ selectedObjectId: id }),
  setHovered: id => set({ hoveredObjectId: id }),
  setFocus: id => set({ focusObjectId: id }),
  setCameraPos: (x, y, z) => set({ cameraPos: { x, y, z } }),
  registerApi: api => set({ api }),
}));

export const useSelectedObjectId = () => useSceneStore(s => s.selectedObjectId);
export const useSceneApi = () => useSceneStore(s => s.api);

/** Non-hook access for imperative code (audio, animations). */
export const sceneStore = useSceneStore;
