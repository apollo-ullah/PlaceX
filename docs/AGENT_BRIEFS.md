# PlaceX agent briefs

You are one of several subagents building PlaceX at Cal Hacks 13.0 tonight, in parallel git
worktrees, coordinated by a lead. Read `docs/PRD.md` fully first. Then read the contract files:
`client/src/types.ts`, `server/src/index.ts`, `client/src/state/*.ts(x)`, and the stub in your
folder. The SpacetimeDB SDK reference is in `docs/SPACETIMEDB_REFERENCE.md`.

## Hard constraints (read twice)

- **Clock.** It is about midnight PT, Oct 25. v1 must be deployed by **3:00 AM**. Feature freeze
  6:30 AM, code freeze 7:30 AM, Devpost closes 9:00 AM. Your P0 work is due to the lead by
  **2:15 AM**. Ship something that works over something that is complete.
- **File ownership is strict.** You may only edit files in your own folders (listed in your
  brief). Shared files (`client/src/state/`, `client/src/types.ts`, `server/src/index.ts` schema,
  `client/src/bindings/`, `client/src/App.tsx`) change only through the lead. If you need a
  contract change, write the request in your `HANDOFF.md` and work around it with a local shim.
- **Real data only.** Planets come from the NASA Exoplanet Archive. Never invent planets or
  measured values. Estimated values are listed in `estimated` and shown as estimates.
- **No em dashes** in any user-facing copy. Use a comma, a period, or a colon.
- **No credentials.** Never create accounts, type passwords, or paste API keys anywhere. If a
  login is needed, write it in `HANDOFF.md` and stop that sub-task.
- **Keep your branch building.** `cd client && npm run build` (or `cd server && npm run build`)
  must pass before every commit. Commit small and often with clear messages.
- **Mobile first.** 390 px wide is the primary viewport. 60 fps on a mid phone for the scene.
- **Never touch the live database.** Local dev uses `spacetime start` on 127.0.0.1:3000 and the
  database `placex-local`. Only the lead and the backend agent publish to Maincloud.

## Environment notes

- `spacetime` CLI 2.13.0 is at `~/.local/bin/spacetime` (add `export PATH="$HOME/.local/bin:$PATH"`).
  A local SpacetimeDB is already running on 127.0.0.1:3000 with `placex-local` published and
  seeded with the 8-object placeholder catalog.
- Your worktree has no `node_modules`. Run `npm install` in `client/` (and `server/` or the root
  if you need them) first.
- Client: `cd client && VITE_MOCK=1 npm run dev` runs against fake data with no server. Without
  `VITE_MOCK`, it connects to `ws://127.0.0.1:3000` database `placex-local`.
- Server reducer names are camelCase exports that become snake_case in the database. JSON passed
  to `spacetime call` uses snake_case field names. Client bindings use camelCase accessors.
- Reducer errors: `throw new SenderError('CODE')` on the server arrives on the client as a
  rejected promise whose `message` contains the code. `reducerErrorCode(err)` in the state layer
  extracts it.
- The state layer is the only way UI, scene and audio read game state. Never import
  `spacetimedb` or `../bindings` outside `client/src/state/`.

## Deliverables for every agent

1. Working code in your folders, committed on your branch.
2. `HANDOFF.md` in your main folder: what works, what is stubbed, how to test, any contract
   change requests for the lead, and known bugs.
3. A final report back to the lead summarizing the same, with the exact commands to verify.

---

## Agent A: Backend (`server/`, `scripts/seed.mjs`, `scripts/load.ts`)

- Implement every reducer in `server/src/index.ts` marked TODO(backend) with full validation:
  `hostile_takeover` (2x price, previous owner is paid, claim moves, both portfolios and counts
  update, event `takeover`), `place_bid` (escrow and refund), `pay_income` (habitable pays more,
  gated by `config.incomeEnabled`), `settle_auction` (transfer, event `auction_won`, next auction
  on a rolling schedule: one every 20 minutes, Earth ends at 08:40 PT Oct 25).
- Achievements on claim: `first_claim`, `diamond_collector` (3 carbon), `water_baron` (3 water),
  `hell_landlord` (3 lava or hot_jupiter), `habitable_tycoon` (5 habitable), `takeover_artist`
  (first takeover). You will need `cls` and `habitableZone` from `celestial_object`.
- Harden `claim_object` and `set_profile` (callsign filter, double-join). Keep the error codes in
  `client/src/types.ts` exactly; add none without asking the lead.
- Do not change table shapes or reducer argument lists without the lead; adding tables for
  internal bookkeeping is fine if you tell the lead.
- Unit tests with vitest and `spacetimedb/server/test-utils` (see
  `server/node_modules/spacetimedb/src/server/test-utils/index.ts` for `createModuleTestHarness`
  and the vitest plugin in `.../test-utils/vitest.ts`): the claim race (two identities claim the
  same object, exactly one succeeds), insufficient credits, auction-only, takeover pays the
  previous owner. `npm test` in `server/`.
- `scripts/load.ts`: 150 simulated SDK clients set callsigns and claim at random rates for 5
  minutes against a **staging** database (`placex-staging` on Maincloud, publish it yourself),
  reporting p50 and p95 claim-to-visible latency and errors. Write results into `HANDOFF.md`.
- Deploy: `spacetime publish placex --server maincloud --module-path ./server --yes` republishes
  the live database (already created and seeded by the lead). Republish only after `npm test`
  passes and the local smoke test (`npm run smoke:local` at the repo root) passes.
- Acceptance: `npm run smoke:cloud` passes; a takeover unit test passes; `spacetime logs placex`
  shows no errors.

## Agent B: Data pipeline (`pipeline/`, `client/public/data/`)

- Python 3.14 is installed. Use a venv in `pipeline/.venv` (gitignored). Prefer the standard
  library plus `requests`; avoid heavy dependencies.
- Query the NASA Exoplanet Archive TAP endpoint, `pscomppars` table, CSV. Columns: `pl_name,
  hostname, ra, dec, sy_dist, pl_bmasse, pl_rade, pl_eqt, pl_orbper, disc_year, st_teff, pl_dens`.
  Cache the raw CSV in `pipeline/raw/` (gitignored). Network is confirmed reachable.
- Convert RA, Dec (degrees) and distance (parsecs, 1 pc = 3.26156 ly) to x, y, z light years
  with Earth at the origin. Drop rows with no distance.
- Fill missing mass or radius with a simple mass-radius relation (document it) and list the
  filled fields in `estimated`. Compute `gravityG` from mass and radius (flag estimated if either
  input was).
- Classify into `PlanetClass` from density and temperature; document thresholds in comments.
  `carbon` is only for 55 Cancri e. `lava` for rocky with T > 1500 K. `hot_jupiter` for gas
  giants with T > 1000 K.
- Pricing exactly as in the PRD and `client/src/types.ts`: V = M(kg) x $/kg x habitable(5x) x
  rarity(3x for hottest, closest, oldest, and the named famous ones) x 2x Solar System;
  P = 100 x (log10 V - 18) x (1 + 50 / (d + 50)), floor 50. Print a histogram and make sure most
  planets land between 400 and 1,500 credits.
- Sound: v = sqrt(gamma R T / M) with class-based gas assumptions (see the placeholder generator
  pattern in the lead's notes: gas giants H2/He M=0.0023, ice giants 0.0026, rocky N2 0.029, CO2
  worlds 0.044, lava rock vapor 0.060). `pitchRatio = v / 343` clamped to [0.25, 4]. `density`
  relative to Earth, `layer` by class. Airless (moons, small cold rocky without evidence of
  atmosphere) get `silence`.
- Hand-build the Solar System: Sun, Mercury, Venus, Earth, Moon, Mars, Jupiter, Saturn, Uranus,
  Neptune, Pluto, Europa, Titan, Io, with published values. Earth, Moon, Mars are `auctionOnly`.
- Facts: hand-written and `factVerified: true` for KELT-9 b, WASP-76 b, HD 189733 b, 55 Cnc e,
  GJ 1214 b, the TRAPPIST-1 planets, Proxima Cen b, Neptune, Uranus, Jupiter, Venus, Mars,
  Earth, Moon. Everything else gets a templated fact from real stats (year length, temperature,
  gravity comparisons), `factVerified: false`. No LLM key is available tonight; do not call one.
- Blurbs: templated realtor copy per class with a few variants, fun, two sentences, no em dashes.
- Output `client/public/data/objects.json` matching `CelestialObject` exactly; write
  `pipeline/validate.py` that checks every field and type and exits non-zero on any violation.
  Keep the file under 4 MB (round floats to 3 decimals, keep facts short). Also write
  `client/public/data/stars.json`: the 5,000 brightest HYG stars as `[x, y, z, mag]` in light
  years for the background (download the HYG CSV from the astronexus GitHub, cite it).
- Acceptance: `python3 pipeline/validate.py` passes; at least 5,000 planets; the 8 placeholder
  ids (`earth`, `moon`, `mars`, `jupiter`, `proxima-cen-b`, `trappist-1-e`, `wasp-76-b`,
  `kelt-9-b`) still exist with those exact ids.

## Agent C: 3D explorer (`client/src/scene/`)

- react-three-fiber scene, true black, real background stars from `/data/stars.json` (until it
  exists, generate a deterministic placeholder star field and swap in the real file when present).
- All objects in one `InstancedMesh` with per-instance color, driven by `useClaims()` and
  `usePlayer()`: unclaimed white, claimed in `CREWS[crew].color`, own planets pulsing `GOLD`.
  Positions from `useObjects()`. Scale the universe so the nearest systems are navigable and the
  far ones still fill the sky (log or sqrt distance compression is fine; document it).
- Interactions: orbit and pinch zoom (drei controls, touch tuned), tap to select via raycast on
  instances (sets `useSceneStore.select`), hover highlight on desktop.
- Register the `SceneApi` from `client/src/state/sceneStore.ts`: `flyTo(id)` eases the camera,
  `teleport()` warps to a random system with a star-streak effect, `playClaimAnimation(id, color)`
  flies a small rocket from Earth to the target then plants a flag in `color`.
- Selected system renders full spheres with class-based materials (lava glow, water sheen, gas
  bands, ice shimmer). Keep it cheap: one or two spheres, no heavy post-processing on mobile.
- Call `setFocus` and `setCameraPos` on camera settle (not every frame) so presence works.
- Performance budget: 60 fps on a mid phone with 6,000 instances. Measure with the dev overlay.
- Phase 3 extras only if P0 is done: presence ghosts from `usePresence()`, territory glow within
  50 ly, claim ripple.
- Acceptance: `VITE_MOCK=1 npm run dev` shows the universe, tap selects, Teleport warps, claims
  recolor live.

## Agent D: UI shell (`client/src/ui/`)

- Export `Shell({ big })` from `client/src/ui/index.tsx` (replace the stub).
- Landing: rotating universe behind "Claim the universe before someone else does." One callsign
  input, crew color picker (from `CREWS`), Enter button. Calls `actions.setProfile`. Shown until
  `useHasProfile()` is true.
- HUD: credits (top left), search (uses `searchObjects`, flies via `useSceneStore().api.flyTo`),
  Teleport button (bottom center, big), collapsible leaderboard (right; by value and by count
  from `useLeaderboard`), live claim ticker (bottom left, `useEvents`).
- Listing card: slides up, fills the lower half on mobile. Hero (a CSS planet by class is fine),
  price in large type with a breakdown toggle, stat chips (distance, gravity, temperature, year
  length; show "est." when the field is in `estimated`), fact with a verified badge, Play Sound
  (calls `playPlanetSound` from `../audio`, shows `SOUND_DISCLAIMER`), Claim. If owned: owner
  callsign and crew color, price paid, Hostile Takeover (2x). After a successful claim call
  `api.playClaimAnimation(id, CREWS[me.crew].color)`.
- Errors via `reducerErrorCode`: `ALREADY_CLAIMED` plays a SNIPED animation; `INSUFFICIENT_CREDITS`
  shakes the button; `AUCTION_ONLY` shows "Auction only. Watch the big screen." Others show a
  short toast.
- `big` mode (`/big`): hide the landing and card, show the ticker, leaderboard, live stats
  (`useStats`), and a QR placeholder slot. Phase 3 adds the auction countdown.
- Mobile first, test at 390 px, every control reachable with a thumb, 44 px tap targets.
  Copy is a fun realtor voice, no em dashes. Use the CSS tokens in `client/src/index.css`.
- Acceptance: `VITE_MOCK=1 npm run dev` gives the full loop: enter callsign, select, claim, see
  the ticker and leaderboard update, SNIPED shows on a claimed object.

## Agent E: Audio (`client/src/audio/`)

- Web Audio engine. Procedural Earth wind loop from filtered noise (no samples to license),
  `playbackRate = sound.pitchRatio`, low-pass cutoff from `sound.density` (thick atmospheres sound
  muffled), class layers: lava crackle, storm thunder rumble, ice whistle. `silence` layer plays
  nothing, then a soft orbit tone whose pitch maps from `orbitalPeriodDays`.
- Exports exactly: `playPlanetSound(obj)`, `stopSound()`, `isPlaying()`, `SOUND_DISCLAIMER`.
  Must be idempotent and safe to call before any user gesture (resume the context on first
  call, swallow errors).
- Stretch: `startVoice()` / `stopVoice()`: mic through a pitch shift by `pitchRatio`.
- Add a tiny dev page or story: `client/src/audio/DevPanel.tsx` that lists the 8 placeholder
  objects with play buttons, so the lead can verify without the UI.
- Acceptance: each class sounds distinct, no clicks on start or stop, works on iOS Safari after a
  tap.

---

## Phase 3 briefs (after v1 is live, new worktrees off main)

- **A2 Backend:** enable income, takeover notifications, auctions for Earth, Moon, Mars with
  the rolling schedule, achievements.
- **C2 3D:** presence ghosts, neighborhood territory glow within 50 ly, claim ripple.
- **D2 UI:** portfolio screen, HOSTILE TAKEOVER banner, auction panel with countdown,
  achievement toasts, class-based card effects.
- **F Big screen:** `/big` polish: claims flashing in, ticker, auction countdown, leaderboard,
  live stats.
- **G QA and load:** `scripts/load.ts` run against staging; fresh-eyes phone review into
  `docs/QA.md` by severity.
