# PlaceX — Devpost submission (paste-ready)

Use this file as the source of truth when filling the Devpost form. Assets live in `docs/` and `docs/devpost/`.

---

## Form fields (copy/paste)

| Field | Value |
| --- | --- |
| **Project name** | PlaceX |
| **Tagline** (≤60 chars) | Zillow for the universe. Real exoplanets. One owner each. |
| **Website** | https://claimtheuniverse.vercel.app |
| **Demo video** | _(record a 60–90s phone or Loom walkthrough — script below)_ |
| **GitHub repo** | https://github.com/apollo-ullah/PlaceX |
| **Cover / thumbnail** | `docs/devpost/thumbnail.jpg` (1280×720) |
| **Gallery** | thumbnail + `docs/devpost/gallery-universe.jpg` + `docs/devpost/devpost-shot-hud.png` + `docs/devpost/devpost-shot-listing.png` + `docs/devpost/devpost-shot-big.png` |

### Built with (tags)

`SpacetimeDB` · `TypeScript` · `React` · `Three.js` · `react-three-fiber` · `Vite` · `Web Audio API` · `Python` · `NASA Exoplanet Archive` · `Vercel` · `Cursor`

### App Store / Play Store

Leave blank (web app).

---

## Elevator pitch (judges, 20 seconds)

PlaceX is Zillow for the real universe: thousands of NASA exoplanets at true 3D positions, priced by physics, one owner each. You claim in SpacetimeDB; the race is a database primary key. Hostile takeovers wage-war the price. No API server.

---

## Inspiration

Space data is the most spectacular dataset on Earth and almost nobody plays with it. The NASA Exoplanet Archive lists thousands of confirmed planets with masses, radii, temperatures and distances, and most people have never heard of a single one. We wanted a reason to care about WASP-76 b at 4 AM. Ownership is that reason. If you can claim a planet before the person next to you, you will learn its name, its year length and what it rains there, because now it is yours.

## What it does

PlaceX is a live multiplayer real estate market for the real universe.

- Fly through real exoplanets at their true 3D positions, with a real star background.
- Tap any planet for a listing card: price, distance, gravity, temperature, year length, a fun fact, a realtor blurb, and the sound of its atmosphere.
- Claim it. One owner per object, enforced by the database. A rocket flies from Earth and plants your crew's flag; the claim appears on every screen at once.
- Earn passive rent every minute (3% on habitable-zone worlds). List a deed for sale at your ask, or wage war with hostile takeovers at 2× what the owner paid — each snipe doubles again.
- Climb the live leaderboard, watch the claim ticker, and keep an eye on planets other players are staring at.
- Earth, the Moon and Mars go up for timed auctions on the big screen (`/big`).

In-game credits only. Prices and sounds are physics-inspired estimates, and the UI says so.

**Try it:** https://claimtheuniverse.vercel.app · **Venue screen:** https://claimtheuniverse.vercel.app/big

## How we built it

**SpacetimeDB is the whole backend.** One TypeScript module holds the database, the game rules and the real-time sync: tables for objects, players, claims, presence, events, auctions, achievements and config, plus scheduled tables that drive rent every 60 seconds and auction settlement. Every rule lives in a reducer. Clients subscribe to tables and call reducers; there is no API server.

**The race condition is a feature.** `claim.object_id` is the primary key. When two people tap Claim on the same planet in the same instant, both reducers run as transactions and exactly one insert succeeds. The loser gets `ALREADY_CLAIMED` and a SNIPED stamp. Measured claim-to-visible latency: ~4 ms locally, ~140 ms through Maincloud.

**Pricing from physics.** Market value multiplies mass by composition, with bonuses for the habitable zone and rarity. Claim price compresses that into a game economy so most worlds cost a few hundred to ~1,500 credits and everyone starts with 10,000. After a claim, hostile takeovers escalate from what was paid so the market can wage war.

**Sound from physics.** Space is silent, so we model standing in the atmosphere. Speed of sound from temperature and mean molecular weight; a procedural wind loop pitched and filtered by density. Lava crackles, storms rumble, ice whistles; airless bodies play an orbit tone.

**Client.** Vite, React, react-three-fiber. Thousands of planets in one instanced mesh so a phone holds ~60 fps. Scene, UI, audio and state are separate modules behind one hooks contract, with a mock provider so every piece could be built before the backend was live.

**Data pipeline.** Python hits the NASA archive TAP endpoint (`pscomppars`), converts sky coordinates to light years, fills missing mass/radius with a mass–radius relation (flagged as estimated), classifies, prices, computes sound parameters, and writes `objects.json` for seeding.

## Built in Cursor with agents

The project was built in Cursor. Claude Code led: contracts first (types, schema, bindings, hooks), then parallel subagents in git worktrees (backend, data, 3D, UI, audio), merge, deploy, build log. Humans steered copy, mobile polish, player market and wage-war fixes. Full timeline: `docs/BUILD_LOG.md`.

## Challenges we ran into

- Freezing interfaces before parallel work — five agents only work if the contract is fixed first.
- Keeping ~6,000 objects smooth on a phone: one instanced mesh, per-instance colors updated in place.
- Honest estimates: every filled-in value is flagged; the sound card says space is silent.
- Economy edge cases: takeovers had to escalate from price paid (and respect open asks) so a listing could not be undercut by a cheap snipe.

## Accomplishments that we're proud of

- A live shared universe with real players before judging.
- Real concurrency control that doubles as a demo moment (SNIPED).
- Physics you can explain to a judge in one breath.
- Zero traditional backend — SpacetimeDB is the server.

## What we learned

SpacetimeDB removes an entire tier. No API server, no socket layer, no cache invalidation. Reducers plus subscriptions were enough for a real-time game. Parallel agents only work if you write the contract first and keep `main` green.

## What's next for PlaceX

Crews with territory, shareable deed cards, more Solar System depth, and a classroom mode where a teacher opens a system and students claim what they can explain.

## Data sources

- NASA Exoplanet Archive, `pscomppars` via TAP: https://exoplanetarchive.ipac.caltech.edu/
- HYG star database (background stars)
- Solar System values from NASA planetary fact sheets

## Live stats (snapshot ~2:20 AM PT, Oct 25, 2026)

| Metric | Value |
| --- | --- |
| Named players in DB | 4 |
| Objects claimed | 17 |
| Hostile takeovers (event log) | 2 |
| Who owns Earth | unclaimed (auction-only) |
| Peak concurrent | _(fill from venue / Vercel analytics at freeze)_ |

_Refresh before submit:_

```bash
spacetime sql placex "SELECT COUNT(*) AS n FROM claim" --server maincloud
spacetime sql placex "SELECT COUNT(*) AS n FROM player WHERE callsign != ''" --server maincloud
```

## Disclaimer

In-game credits only. No real property, money or crypto. Prices and sounds are physics-inspired estimates for fun and learning.

---

## Demo video script (~75 seconds)

1. **0–10s** — Landing: “Zillow for the universe.” Pick a callsign, pick a crew, enter.
2. **10–25s** — Teleport / fly. Open a listing. Point at physics chips + fun fact. Hit Claim. Show rocket + flag.
3. **25–40s** — Second browser / phone: same planet shows owned. Try Claim → SNIPED. Mention SpacetimeDB primary key.
4. **40–55s** — Hostile takeover / list for sale. Rent ticker. Leaderboard.
5. **55–75s** — `/big` venue screen + QR. “No API server. Just SpacetimeDB.” End on URL.

Record with Loom or QuickTime; upload to YouTube unlisted and paste the link on Devpost.

---

## Submission checklist

- [ ] Create Devpost project under the Cal Hacks 13.0 hackathon
- [ ] Paste name, tagline, website, GitHub
- [ ] Upload cover: `docs/devpost/thumbnail.jpg`
- [ ] Upload 3–5 gallery images from `docs/devpost/`
- [ ] Paste Inspiration → What's next sections from this file
- [ ] Add Built With tags
- [ ] Record + link demo video
- [ ] Refresh live stats at code freeze
- [ ] Submit / mark finished before the deadline
- [ ] Confirm repo is **public** (already switched for Devpost)
