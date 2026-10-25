# PlaceX: Devpost write-up (draft, stats filled at code freeze)

**Tagline:** Zillow for the universe, and everyone at Cal Hacks is bidding.

## Inspiration

Space data is the most spectacular dataset on Earth and almost nobody plays with it. The NASA Exoplanet Archive lists thousands of confirmed planets with masses, radii, temperatures and distances, and most people have never heard of a single one. We wanted a reason to care about WASP-76 b at 4 AM. Ownership is that reason. If you can claim a planet before the person next to you, you will learn its name, its year length and what it rains there, because now it is yours.

## What it does

PlaceX is a live multiplayer real estate market for the real universe.

- Fly through real exoplanets at their true 3D positions, with a real star background.
- Tap any planet for a listing card: price, distance, gravity, temperature, year length, a fun fact (verified for the famous ones), a realtor blurb, and the sound of its atmosphere.
- Claim it. One owner per object, enforced by the database. A rocket flies from Earth and plants your crew's flag, and the claim appears on every screen at once.
- Climb the live leaderboard, watch the claim ticker, and defend your planets from hostile takeovers.
- Earth, the Moon and Mars go up for timed auctions on the big screen.

In-game credits only. Prices and sounds are physics-inspired estimates, and the UI says so.

## How we built it

**SpacetimeDB is the whole backend.** One TypeScript module holds the database, the game rules and the real-time sync: tables `celestial_object`, `player`, `claim`, `presence`, `event`, `auction`, `achievement`, `config`, plus two scheduled tables that drive `pay_income` every 60 seconds and `settle_auction` at each auction's end. Every rule lives in a reducer: `set_profile`, `claim_object`, `hostile_takeover`, `place_bid`, `update_presence`, `seed_objects`, `set_flags`, `admin_reset`. Clients subscribe to tables and call reducers; there is no API server.

**The race condition is a feature.** `claim.object_id` is the primary key. When two hackers tap Claim on the same planet in the same instant, both reducers run as transactions and exactly one insert succeeds. The loser's reducer throws `ALREADY_CLAIMED`, the client catches it, and their screen plays a SNIPED stamp. Measured claim-to-visible latency on a second client: about 4 ms locally and about 140 ms through Maincloud.

**Pricing from physics.** Market value multiplies mass by what the planet is made of:

V = M x p_composition x m_habitable x m_rarity

with $/kg of 1,000 for carbon-rich "diamond" worlds, 1.00 for water worlds, 0.50 iron, 0.30 ice giants, 0.20 rocky, 0.10 lava, 0.05 gas giants; 5x in the habitable zone, 3x for record holders, 2x for the Solar System. The claim price compresses that into a game economy:

P = 100 x (log10 V - 18) x (1 + 50 / (d_ly + 50))

so most planets cost 400 to 1,500 credits, nearby ones up to double, and everyone starts with 10,000.

**Sound from physics.** Space is silent, so we model standing in the atmosphere. Speed of sound v = sqrt(gamma R T / M) with a gas mix per class (H2 and He for gas giants, N2 or CO2 for rocky worlds, rock vapor for lava worlds). A procedural wind loop is pitched by v / 343 m/s and low-passed by atmosphere density; lava worlds crackle, storms rumble, ice worlds whistle, and airless bodies play an orbit tone instead.

**Client.** Vite, React, react-three-fiber. All planets render in a single instanced mesh so a phone holds 60 fps. The scene, UI, audio and state layers are separate modules behind one hooks contract, with a mock provider so every piece could be built before the backend was live.

**Data pipeline.** One Python script queries the archive's TAP endpoint (`pscomppars`), converts RA, Dec and parsecs to light years, fills missing mass or radius with a mass-radius relation (flagged as estimated), classifies by density and temperature, prices, computes sound parameters, and writes `objects.json`, which is seeded into SpacetimeDB.

## Built in Cursor with agents

The whole project was built in Cursor's integrated terminal. Claude Code ran as the lead engineer: it set up the toolchain, wrote the shared contracts (types, SpacetimeDB schema, generated bindings, React hooks), then dispatched five subagents in parallel git worktrees (backend, data pipeline, 3D scene, UI, audio), reviewed and merged their branches, deployed, and kept the build log. Humans worked in Cursor's agent on copy, mobile polish and bug fixes from `docs/CURSOR_TASKS.md`. The full timeline is in `docs/BUILD_LOG.md`.

## Challenges

- Freezing interfaces before parallel work. Five agents only work if the contract is fixed first, so the first 45 minutes went to types, schema and hooks, with stubs so `main` always built.
- Keeping 6,000 objects smooth on a phone: one instanced mesh, per-instance colors updated in place, full spheres only for the selected system.
- Honest estimates. Every filled-in value is flagged, every fact says whether it was verified, and the sound card says plainly that space is silent.

## Accomplishments

- A live shared universe with real players before judging.
- Real concurrency control that doubles as a demo moment.
- Physics you can explain to a judge in one breath.

## What we learned

SpacetimeDB removes an entire tier. No API server, no socket layer, no cache invalidation. Reducers plus subscriptions were enough for a real-time game with hundreds of players.

## What's next

Crews with territory, shareable deed cards, more solar systems, and a classroom mode where a teacher opens a system and students claim what they can explain.

## Data sources

- NASA Exoplanet Archive, `pscomppars` table via TAP: https://exoplanetarchive.ipac.caltech.edu/
- HYG star database (background stars): https://github.com/astronexus/HYG-Database
- Solar System values from NASA planetary fact sheets.

## Live stats at code freeze

_(filled from the database at 7:30 AM)_

| Metric | Value |
| --- | --- |
| Unique players | |
| Objects claimed | |
| Peak concurrent | |
| Takeovers | |
| Who owns Earth | |

## Disclaimer

In-game credits only. No real property, money or crypto. Prices and sounds are physics-inspired estimates for fun and learning.
