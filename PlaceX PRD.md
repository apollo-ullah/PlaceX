# PlaceX PRD

Oct 24, 2026 · @Adyan Ullah

## Summary

PlaceX is a live, multiplayer real estate market for the real universe: fly through 6,000+ real exoplanets at their true positions, see each one's price, sound and weirdest fact, and claim it before another Cal Hacks hacker does.

**Pitch (one line):** "Zillow for the universe, and everyone at Cal Hacks is bidding."

**Why it wins**

- **SpaceXSI x Cursor track:** real space data in (NASA Exoplanet Archive masses, radii, temperatures, distances), something legendary out. Built end to end in Cursor, planned in Grok Bot, both documented.
- **Best Use of Spacetime:** the entire game state (claims, players, presence, auctions, live events, leaderboard) lives in SpacetimeDB. Hundreds of hackers act on one shared universe in real time, which is exactly what SpacetimeDB is built for.
- **The demo nobody else has:** by judging, real Cal Hacks hackers will own real planets on a live leaderboard. Judges can claim a planet on their phone during the pitch and watch it appear on the big screen.
- **Every main judging criterion is covered:** Creativity (the concept), Technical Complexity (3D universe, physics-based pricing and sound, real-time sync), Functionality (live and stable), Intentionality (fun, clear game loop), Application (an engaging way to learn real astronomy).

## Goals, non-goals and success metrics

**Goals**

1. Win the SpaceXSI x Cursor track (primary) and Best Use of Spacetime (secondary).
2. Make real astronomy feel like a game people want to play at 4 AM.
3. Have a real, live player base at Cal Hacks before judging.

**Non-goals**

- Real money, crypto or anything that looks like selling actual property in space.
- Scientific precision. Prices and sounds are physics-inspired estimates, and the UI says so.
- Accounts with passwords. A SpacetimeDB identity plus a chosen callsign is enough.

**Success metrics by judging time**

| Metric | Target |
| --- | --- |
| Unique players | 150+ |
| Objects claimed | 1,000+ |
| Peak concurrent players | 40+ |
| Claim to visible on every screen | under 200 ms |
| Judge claims a planet live during the pitch | Yes |
| Crashes during demo | 0 |

## Users and core loop

**Who it's for**

- **Cal Hacks hackers (launch audience):** tired, competitive, on their phones between bugs. They want a 30-second dopamine hit and bragging rights.
- **Judges:** need to grasp it in 10 seconds, then be impressed by the depth underneath.
- **After the hackathon:** students and space fans who learn astronomy by owning it.

**Core loop (under 60 seconds for a new player)**

1. Scan the QR, pick a callsign and a crew color. Everyone starts with **10,000 Credits** (in-game only).
2. Land in the universe. Pick a spot or hit **Teleport** to jump to a random star system.
3. Tap a glowing object to open its **listing card**: price, distance, composition, fun fact, sound.
4. **Claim it.** A rocket animation flies from Earth to the planet, and the claim appears on every screen at once.
5. See the **neighborhood**: who owns the nearby systems, and where your rivals are looking right now.
6. Climb the **leaderboard**, earn passive income from your planets, and get pulled back by notifications like "Your planet is under a hostile takeover bid."

**Why people keep playing:** scarcity (one owner per object), rivalry (takeovers and auctions), collection goals (complete a system, own every diamond planet), and live social proof (a ticker of everyone's claims).

## Features

P0 ships by 3 AM, P1 by 6 AM, P2 only if ahead. The full product is all three.

| Feature | What it does | Priority |
| --- | --- | --- |
| Universe explorer | 3D starfield of real host stars and exoplanets at true positions; orbit, zoom, search by name | P0 |
| Teleport | Fly to a random star system with a warp animation | P0 |
| Listing card | Name, price, distance, type, mass, radius, temperature, year length, gravity, discovery year | P0 |
| Claim | One owner per object, enforced server-side, instant on every screen | P0 |
| Leaderboard | Top owners by total portfolio value and by object count, live | P0 |
| Live claim ticker | "ady just claimed Neptune for 4.1T credits" scrolling feed | P0 |
| Fun facts | Hand-written for famous objects, LLM-generated and cached for the rest | P1 |
| Planet sound | Physics-based atmosphere sound per planet (see Pricing and sound models) | P1 |
| Neighborhood view | Owners within 50 light years, color-coded territory | P1 |
| Live presence | Every player's camera target shown as a colored dot or ghost ship | P1 |
| Passive income | Owned planets pay credits every minute, more for habitable ones | P1 |
| Hostile takeover | Buy someone's planet for 2x its price; they get paid and notified | P1 |
| Crews | Join a team color; crew territory shown as glowing regions | P2 |
| Live auctions | Famous objects (Earth, Moon, Mars, TRAPPIST-1e) go up at timed auctions on the big screen | P2 |
| Achievements | Diamond Collector, Water Baron, Hell Landlord, Habitable Zone Tycoon | P2 |
| Deed card | Shareable image of your planet's title deed for X and LinkedIn | P2 |
| Big screen mode | Venue display: live map, ticker, auction countdown, leaderboard | P2 |

**Solar System is special.** Earth, the Moon, Mars, Jupiter and friends are the most wanted listings. They start auction-only, so claiming Earth becomes a public event instead of a race won at 11:02 PM.

## UI/UX

The look is "luxury realtor meets mission control": a deep black universe, glowing planets, and crisp listing cards that feel like a premium property app.

**Visual style**

- Background: true black with a faint real Milky Way band (from the star catalog, not a stock image).
- Typography: a geometric sans for UI, a monospace for coordinates and prices.
- Color: unclaimed objects glow white; claimed objects glow in the owner's crew color; your own planets pulse gold.
- Motion: everything eases. Camera warps, never jumps.

**Screens**

1. **Landing:** a slowly rotating universe behind the line "Claim the universe before someone else does." One input (callsign) and one button (Enter). No sign-up.
2. **Explorer (main screen):** full-screen 3D view. Top bar: credits balance and a search box. Bottom left: live claim ticker. Right: collapsible leaderboard. Bottom center: a big Teleport button.
3. **Listing card:** slides up like a real estate listing. Hero render of the planet, price in large type with a "price breakdown" toggle, stat chips (distance, gravity, temperature, year length), a fun fact, a Play Sound button and a big Claim button. If owned: owner name, purchase price, and a Hostile Takeover button.
4. **Portfolio:** your planets as a gallery, total value, income per minute, achievements.
5. **Leaderboard:** players and crews, with a mini map of each player's territory.
6. **Big screen mode:** for a venue display or the demo; live universe with claims flashing in, the ticker, and the auction countdown.

**Delight moments (these win Creativity)**

- Claiming fires a small rocket from Earth that streaks to the planet, then plants a flag in your color.
- Teleport plays a warp-speed star streak with a whoosh.
- Opening a lava world tints the card red and shakes it slightly; a water world ripples; a diamond planet sparkles.
- Getting outbid triggers a dramatic "HOSTILE TAKEOVER" banner on your screen.
- Listings use realtor copy: "Cozy 1-star system. Sunsets last forever (tidally locked). Bring sunscreen."

**Mobile first.** Most players will be on phones at 3 AM. Pinch to zoom, tap to select, the card fills the lower half of the screen, and claiming takes one tap.

## Data sources and pipeline

All space data is preprocessed once into static JSON and seeded into SpacetimeDB, so the demo never depends on a slow outside API.

| Source | What we take | Use |
| --- | --- | --- |
| [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/) (`pscomppars` table via TAP) | Planet name, host star, RA, Dec, distance, mass, radius, equilibrium temperature, orbital period, discovery year, host star temperature | Positions, pricing, sound, listing stats |
| HYG star catalog | Bright background stars | Real sky backdrop and Milky Way band |
| Hand-built Solar System file | Sun, 8 planets, Pluto, the Moon, a few famous moons | The most wanted listings |
| LLM (cached, offline) | One fun fact and one realtor blurb per planet | Listing copy |

**Pipeline (one Python script, run once)**

1. Query the archive's TAP endpoint for `pscomppars` and save the CSV.
2. Convert RA, Dec and distance (parsecs) to x, y, z in light years, with Earth at the origin.
3. Fill gaps: estimate missing mass from radius (or the reverse) with a simple mass-radius relation, and flag it as "estimated" on the card.
4. Classify each planet: rocky, iron-rich, water world, sub-Neptune, ice giant, gas giant, hot Jupiter, lava world.
5. Compute price and sound parameters (next section).
6. Batch-generate fun facts and blurbs for the top 300 planets; template the rest.
7. Write `objects.json` and seed it into the SpacetimeDB `celestial_object` table through a seed reducer.

**Hand-written facts for the famous ones** (shown with a "verified" badge): KELT-9b is hotter than many stars; WASP-76b is thought to rain iron; HD 189733b may have sideways glass rain; 55 Cancri e was proposed as a carbon-rich "diamond planet"; GJ 1214b is a water-world candidate; Neptune and Uranus are thought to have diamond rain; TRAPPIST-1 has seven Earth-sized planets.

## Pricing and sound models

Both models start from real measured values, so judges can ask "why does this cost that?" and get a physics answer.

### Pricing

Each object gets two numbers: a funny **estimated market value** in dollars, and a playable **claim price** in credits.

Market value multiplies mass by what that mass is made of:

```latex
V = M \cdot p_{\text{composition}} \cdot m_{\text{habitable}} \cdot m_{\text{rarity}}
```

| Class (from density and temperature) | Price per kg | Why |
| --- | --- | --- |
| Carbon-rich ("diamond") | $1,000 | Diamond premium |
| Iron-rich rocky | $0.50 | Iron ore |
| Rocky, Earth-like | $0.20 | Silicate rock |
| Water world | $1.00 | Water is the most valuable thing in space |
| Ice giant | $0.30 | Water, ammonia, methane ices |
| Gas giant or hot Jupiter | $0.05 | Mostly hydrogen and helium |
| Lava world | $0.10 | Molten, hard to use |

Multipliers: 5x in the habitable zone, 3x for unique records (hottest, closest, oldest), 2x for anything in the Solar System.

Claim price compresses those huge numbers into a game economy, using log scale so every planet is affordable but famous ones hurt:

```latex
P_{\text{credits}} = 100 \cdot (\log_{10} V - 18) \cdot \left(1 + \frac{50}{d_{\text{ly}} + 50}\right)
```

That makes most planets 400 to 1,500 credits, with nearby ones costing up to double. Players start with 10,000. The listing card shows the full breakdown.

### Sound

Space itself is silent, so we say exactly that and model what you would hear **standing in the planet's atmosphere**. The speed of sound depends on temperature and gas mix:

```latex
v = \sqrt{\frac{\gamma R T}{M}}
```

| Planet class | Assumed gas | Effect |
| --- | --- | --- |
| Gas giant, hot Jupiter | H2 and He (light gas) | Sound travels several times faster than on Earth, so voices and wind pitch way up |
| Ice giant | H2, He, methane | High-pitched, cold, hollow wind |
| Rocky with atmosphere | CO2 or N2 | Close to Earth, slightly deeper on CO2 worlds |
| Lava world | Rock vapor | Low rumble plus crackle |
| No atmosphere | None | Silence, then an orbit sonification (tone set by orbital period) |

**Implementation (Web Audio API):** take one recorded Earth wind loop. Set playback rate to the ratio v\_planet / 343 m/s, clamped to the audible range. A low-pass filter cutoff follows atmosphere density, so thick atmospheres sound muffled. Extra layers per class: thunder for storms, crackle for lava, a whistle for extreme winds. Add a "Hear your voice there" button that pitch-shifts the mic live, which is a guaranteed laugh at judging.

## Technical architecture

SpacetimeDB is the whole backend: the database, the game server and the real-time sync in one module, so there is no separate API server to build or crash at 4 AM.

&#91;embedded content: PlaceX architecture · clients, SpacetimeDB module, data pipeline\]

Every client calls reducers and receives table changes through subscriptions; the data pipeline seeds the universe once.

**Stack**

- **Server:** one SpacetimeDB module (Rust, or TypeScript if the team prefers and your CLI version supports it), deployed to SpacetimeDB's hosted cloud.
- **Client:** Vite + React + react-three-fiber (Three.js) + drei, using the SpacetimeDB TypeScript SDK with bindings generated by `spacetime generate`. Deployed on Vercel.
- **Rendering:** all \~6,000 planets in one instanced mesh, so it stays smooth on phones. Only the selected system renders full planet spheres.
- **Audio:** Web Audio API, no server involvement.

**Tables**

| Table | Key columns | Purpose |
| --- | --- | --- |
| `celestial_object` | id, name, system, x, y, z, class, mass, radius, temp, value\_usd, price, fact, blurb, sound params, auction\_only | Every claimable object, seeded once |
| `player` | identity (PK), callsign, crew, credits, portfolio\_value, claim\_count, online | Profiles and leaderboard |
| `claim` | object\_id (PK, so one owner max), owner, price\_paid, claimed\_at | Who owns what |
| `presence` | identity (PK), target\_object\_id, camera x, y, z, updated\_at | Live ghost ships and "who's looking where" |
| `event` | id (auto), kind, actor, object\_id, amount, ts | Live ticker and notifications |
| `auction` | object\_id (PK), ends\_at, high\_bid, high\_bidder | Timed auctions for Earth, the Moon and friends |
| `achievement` | identity, kind, earned\_at | Badges |
| `income_schedule`, `auction_schedule` | scheduled rows | Drive scheduled reducers |

**Reducers (all game rules live server-side)**

| Reducer | Does |
| --- | --- |
| `client_connected` / `client_disconnected` | Create the player on first visit, flip `online` |
| `set_profile(callsign, crew)` | Pick name and crew color |
| `claim_object(object_id)` | Check unclaimed, not auction-only, enough credits; deduct; insert claim; update portfolio; write event; award achievements |
| `hostile_takeover(object_id)` | Pay 2x price; previous owner receives the credits; transfer claim; write a takeover event |
| `place_bid(object_id, amount)` | Validate bid above current high; escrow credits; refund the previous high bidder |
| `update_presence(target, x, y, z)` | Throttled to about 5 times a second by the client |
| `pay_income` (scheduled, every 60 s) | Pay every owner per planet; habitable planets pay more |
| `settle_auction` (scheduled at `ends_at`) | Transfer to the winner, announce on the ticker, open the next auction |
| `seed_objects` (admin only) | Load `objects.json` |

**Subscriptions**

- `celestial_object`: subscribed once at load (static after seeding).
- `claim`, `player`, `auction`: full tables, small and always live.
- `presence`: only rows updated in the last 30 seconds, so idle players disappear.
- `event`: newest rows; the client keeps the latest 50 for the ticker.

**The race-condition story for judges.** Reducers run as transactions. When two hackers tap Claim on the same planet in the same instant, exactly one wins and the other's reducer fails cleanly. The loser's screen plays a "SNIPED" animation. That is real concurrency control, and it doubles as a great demo moment.

**Security basics:** identity comes from SpacetimeDB, never from the client; credits are only changed inside reducers; the admin seed reducer checks a hardcoded owner identity; callsigns are length-limited and filtered.

## Build plan, demo and submission

Ship a playable v1 by 3 AM and get real players on it; everything after that is polish on a live product. Submission closes Oct 25 at 9 AM PT, so we submit by 8 AM.

**Team split (for 4; merge roles for 2 or 3)**

| Role | Owns |
| --- | --- |
| Backend | SpacetimeDB module, reducers, scheduled jobs, seeding, deploy |
| 3D | Universe scene, instancing, camera, warp, claim rocket |
| UI | Landing, listing card, leaderboard, ticker, portfolio, mobile layout |
| Data and audio | Archive pipeline, pricing, fun facts, sound engine, Devpost and video |

**Timeline**

| Time (PT) | Milestone |
| --- | --- |
| 11 PM to 1 AM | Data script done; module with `player`, `celestial_object`, `claim` and `claim_object` deployed; 3D scene renders real planets |
| 1 AM to 3 AM | Listing card, claim flow end to end, leaderboard, ticker, landing page, deployed URL |
| 3 AM | **v1 live. QR code in Cal Hacks Slack and printed around the venue.** |
| 3 AM to 5 AM | Sound engine, fun facts, presence ghosts, passive income, hostile takeover |
| 5 AM to 6:30 AM | Auctions for Earth and the Moon, achievements, warp and rocket polish, big screen mode |
| 6:30 AM to 8 AM | Code freeze, demo video, Devpost, screenshots of Cursor and Grok sessions |
| 8 AM | Submit |

**Cut list (cut from the top when behind)**

1. Crews and territory glow
2. Deed card sharing
3. Achievements
4. Auctions (make Earth a normal, very expensive claim instead)
5. Presence ghosts

Never cut: claim, leaderboard, ticker, listing card with real data.

**3-minute pitch script**

1. **Hook (20 s):** "Last night we put the universe up for sale. Right now \[N\] Cal Hacks hackers own \[M\] real planets." Big screen shows the live map.
2. **Live claim (40 s):** hand a judge a phone, they claim a planet, it lights up on the big screen with the rocket and the ticker.
3. **Depth (60 s):** open WASP-76b: real archive data, the price breakdown, "it rains iron," then play its atmosphere sound and explain the speed-of-sound formula.
4. **Tech (40 s):** SpacetimeDB holds the whole game: reducers, scheduled income, auctions, and the "SNIPED" race condition. Built in Cursor, planned in Grok.
5. **Close (20 s):** leaderboard reveal, and announce who owns Earth.

**Devpost checklist**

- [ ] Name, tagline, image, GitHub repo link
- [ ] Demo video under 2 minutes, recorded with real players live
- [ ] Opt in to SpaceXSI (Make it Legendary) and Best Use of Spacetime
- [ ] Write-up section on Cursor usage, with agent screenshots
- [ ] Write-up section on Grok Bot planning, with screenshots
- [ ] Data sources section citing the NASA Exoplanet Archive
- [ ] Architecture diagram and SpacetimeDB table and reducer list
- [ ] Final stats: players, claims, peak concurrency
- [ ] Disclaimer: in-game credits only; prices and sounds are physics-inspired estimates
