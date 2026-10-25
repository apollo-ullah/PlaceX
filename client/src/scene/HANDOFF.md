# Scene handoff (Agent C, 3D explorer)

Branch: `worktree-agent-a2d78459ce3f63d09`. Files: `client/src/scene/**` only. No new
dependencies; uses three 0.180, @react-three/fiber 9, @react-three/drei 10 (OrbitControls only),
zustand 5. The type import from `three-stdlib` (drei's dependency) is types only.

## What works

- `Scene` (`index.tsx`): r3f Canvas filling its parent, true black, `dpr` capped at 2,
  antialias off on touch devices, `flat` (no tone mapping, so additive glows stay punchy).
- Background stars (`Stars.tsx`): one `Points` draw call on a sky sphere that follows the camera.
  Loads `/data/stars.json` (`[x, y, z, mag][]` in ly; only the direction is used) and falls back
  to a deterministic procedural field of 5,000 stars biased toward the real galactic plane when
  the file is missing or not JSON (Vercel SPA rewrites return HTML, which is handled).
- Objects (`Objects.tsx`): all catalog objects in one `InstancedMesh` of billboarded glow quads
  with a custom shader. Per-instance colour: unclaimed `UNCLAIMED`, claimed `CREWS[crew].color`,
  own planets pulse `GOLD` (scale and brightness, driven by a per-instance `aPulse` attribute).
  Colours are patched incrementally from `useClaims()` and `usePlayer()` (only changed instances
  are written); the mesh is rebuilt only when the catalog list changes. Glows are clamped between
  4 and 44 px (4 and 32 on mobile) so far systems still read as points and near ones do not fill
  the screen.
- Interaction (`Interaction.tsx`): drei OrbitControls tuned for touch (one finger rotate, pinch
  zoom, damping, no pan). Tap to select uses a screen-space pick over all instances (nearest
  glow within its radius plus 22 px of touch slop, 10 px for mouse); it is cheaper and more
  forgiving than a geometric raycast on 6,000 quads. Tap selects and eases the camera to frame
  the object; tap on empty space clears. Desktop hover sets `hoveredObjectId` (throttled to
  25 Hz) with a white ring and pointer cursor. Any touch cancels a fly and the idle auto-rotate.
- `SceneApi` (`api.ts`, registered in `CameraRig.tsx` on mount, unregistered on unmount):
  - `flyTo(id)`: selects and eases the camera (0.7 to 2.4 s depending on distance). The camera
    swings toward the host star so the lit face is visible, keeps the object in the upper part of
    the screen (room for the listing card on mobile) and frames the whole sibling ring.
  - `teleport()`: picks a random system other than the one in focus, plays a 0.5 s charge (fov
    60 to 115, radial star streaks), cuts to the destination, settles over 0.85 s, selects a
    planet in that system.
  - `playClaimAnimation(id, color)`: rocket from Earth's position to the target over 1.5 s along
    a curve that bends through the camera's side of the target (so the final approach is always
    on screen), then plants a small flag in `color` and fires a ripple.
  - `playClaimRipple(id, color)`: expanding ring at the object (Phase 3 hook, implemented).
- Camera settle: when the camera and target stop moving for 300 ms, `setFocus(id)` (selected
  object, else nearest to the orbit target) and `setCameraPos(x, y, z)` are called once.
  `cameraPos` is in light years (inverse of the compression), the same space as presence rows.
- Selected system view (`SystemView.tsx`, `planetShader.ts`): the selected object and every
  sibling with the same `system` are drawn as real spheres with one cheap ShaderMaterial per
  class: rocky, iron (metallic spec), water (specular sheen and fresnel), sub-Neptune haze,
  ice giant (bands and shimmer), gas giant (procedural bands), hot Jupiter (bands plus emissive),
  lava (emissive cracks that flicker), carbon (glints), star (bright emissive with limb
  darkening), moon (craters). Value noise only, no textures, no lights, no post-processing.
  If the catalog has no `star` row for the system, a small host star sphere is drawn at the
  centre. A gold ring marks the selection.
- Debug overlay: `?debug=1` shows fps, worst frame ms, instance count, dpr and camera position,
  and exposes `window.__placex = { api, store, rig, worldPosition, objects }` for the console.

## Layout mapping (`layout.ts`)

The UI and presence ghosts must use `worldPosition(obj)` from `scene/layout.ts` (also re-exported
from `scene/index.tsx`) so everything agrees.

1. Radial log compression. For an object at distance `r` ly in unit direction `d` from Earth,
   the system centre is at `d * A * ln(1 + r / R0)` with `A = 30`, `R0 = 10`. Below 10 ly the
   mapping is nearly linear (about 3 scene units per ly). 100 ly maps to 72 units, 1,000 ly to
   138, 10,000 ly to 207. `compressPoint` and `expandPoint` are the forward and inverse maps.
2. Sibling ring. Objects sharing a `system` have identical catalog coordinates, so they are
   spread on a small ring around the centre: a `star` sits at the centre; every other sibling
   `i` (ordered by orbital period, unknown last) sits at radius `0.4 + 0.22 * i` with angle
   `i * goldenAngle + hash(system)` and a slight vertical wobble. Sol works the same way (Earth,
   Moon, Mars, Jupiter around the origin).
3. Visual radius: `0.03 + 0.08 * log10(1 + radiusEarth)` scene units (Earth 0.054, Jupiter 0.12,
   Sun 0.19).
4. Background stars sit on a sphere of radius 600 in their true direction, centred on the camera.

Helpers: `getLayout()` (positions array, id to index, systems map, centres), `systemCenter(name)`,
`nearestObject(x, y, z)`, `visualRadius(obj)`.

## How to test

```
cd client && npm install
VITE_MOCK=1 npm run dev          # open http://localhost:5173/?debug=1
npm run build                    # tsc plus vite, must pass
```

In the browser with `?debug=1`:
- `__placex.api.teleport()` warps; `__placex.api.flyTo('wasp-76-b')` frames WASP-76 b.
- `__placex.api.playClaimAnimation('proxima-cen-b', '#ff4d4d')` fires the rocket and flag.
- `__placex.store.getState()` shows `selectedObjectId`, `hoveredObjectId`, `focusObjectId`,
  `cameraPos`.
- With the mock provider, bot claims recolour instances every 6 s; claim one yourself through the
  stub card and it turns gold and pulses.

## Performance

Measured with Playwright driving real Google Chrome (Metal GPU) at 1200x800 desktop and at
390x844, dpr 2, iPhone user agent, with a synthetic 6,000-object catalog (2,427 systems, 40
percent in a Kepler-like cone) served through request interception: 60 fps steady in every
state (landing, orbit drag, warp, system view, far view at 260 units), worst frame 17 to 19 ms,
which is vsync. Draw calls: stars (1), instances (1), system spheres (up to 8), rings, effects.
Not yet measured on a physical phone. Software GL (SwiftShader) runs at 15 to 24 fps, which is
expected for a CPU rasterizer and not representative.

Frameloop is `always` (the gold pulse and ring animations need it). If battery matters later,
switch to `frameloop="demand"` and `invalidate()` from the useFrame drivers; not done because
every screen has something animating.

## Phase 3 (done)

- Presence ghosts (`Ghosts.tsx`): every row from `usePresence()` is a small crew-coloured ship
  (one InstancedMesh, up to 64) hovering just above `worldPosition(target)`, eased between
  updates with a gentle bob, pointed at the object. Rows that disappear are removed.
- Territory glow (`Territory.tsx`): every claimed object casts a soft additive halo in its owner's
  crew colour (gold for the local player). The halo radius is 50 ly pushed through the local slope
  of the log compression, `50 * A / (R0 + distanceLy)`, clamped to 0.45 to 5 scene units, and
  capped at 240 px (160 on mobile). Rebuilt from the claim map when it changes; still one draw.
- `playClaimRipple(id, color)` is implemented (expanding ring, 0.9 s). The UI or provider should
  call it on claim events from other players so the big screen shows claims flashing in.

## Known issues and notes for the lead

- Tapping selects and flies. If the UI wants select without a fly (for example from the search
  list), call `useSceneStore.getState().select(id)` directly; `api.flyTo(id)` does both.
- The host star drawn for systems without a `star` row is not selectable (it is not a catalog
  object).
- `cameraPos` is only updated on settle, so a continuously orbiting player reports at most once
  per pause. The 5 Hz presence throttle in the provider is unaffected.
- The listing card should leave the top 55 percent of a 390 px tall viewport free: the camera
  places the selected object there.
- `playClaimAnimation` is only fired by the UI for the local player's claims; the lead may want
  the provider or UI to call `api.playClaimRipple(objectId, CREWS[crew].color)` for claim events
  from other players so the big screen shows them flashing in.
- No contract changes requested.
