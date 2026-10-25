# PlaceX live QA

Date: 2026-10-25

## Scope and method

Fresh-eyes pass against `https://claimtheuniverse.vercel.app` and `/big`.

- Phone viewport: 390 x 844 CSS pixels, device pixel ratio 3.
- Venue viewport: 1920 x 1080 CSS pixels.
- Browser checks covered the landing page, profile entry, search, one real claim, listing card, ticker, leaderboard, portfolio, auction-only listing, connection state, and `/big`.
- The live claim used the normal public flow as `qag25`: Kepler-444 b for 603 credits. No admin reducer, reset, publish, or direct live write was used.
- I could not hear audio, feel haptics, or reproduce physical touch behavior. Pointer, keyboard, layout, and accessibility-tree checks were possible.
- No em dash copy was found in the inspected live UI or client UI source.

## Severity summary

- P0: none found.
- P1: 2 findings.
- P2: 5 findings.
- P3: 2 findings.

## P1

### P1-1: Auction-only planets lead to a dead end

Mars, Earth, and Moon are marked `auction_only` in the live catalog. Opening Mars on the live site shows `Auction only. Watch the big screen.` The card has no bid action, amount input, current leader, countdown, start time, or explanation of how to participate. `/big` shows stats, claims, leaderboard, and QR content, but no auction state or bidding instructions.

Impact: prominent Solar System objects cannot be acquired and the user is sent to a screen that does not complete the flow.

Expected: either a working auction surface on phone and `/big`, or clear disabled copy that states auctions are not open yet and when or where they will open.

### P1-2: Closed portfolio eats Claim and Play sound taps

`.px-portfolio` stays mounted at z-index 11 above the listing card (z-index 10). When closed it keeps `pointer-events: auto`. On desktop the closed state is only `translateX(40px)` with opacity 0, so an invisible drawer still covers the right-side card. Programmatic `.click()` on Claim and Play sound works; real pointer hits land on the portfolio instead.

Impact: listing CTA and sound controls feel dead on wider viewports (and can clip the card bottom on phones).

Expected: `pointer-events: none` while closed, `pointer-events: auto` only with `.px-portfolio--open`. Fix is already in local `client/src/ui/ui.css`; needs deploy.

## P2

### P2-1: Planet search is cramped to about 70 pixels on a 390 pixel phone

The top HUD gives credits, search, and leaderboard equal-row competition. At 390 pixels, the search input measured about 70 pixels wide and rendered the placeholder as roughly `Find a pla...`.

Impact: the main way to locate a known planet looks truncated and is easy to overlook.

Expected: move one control to a second row, collapse the leaderboard control further, or allow search to expand while focused.

### P2-2: Closed listing controls remain exposed to assistive technology

After closing a listing, its dialog remains mounted off-screen with opacity zero. The accessibility snapshot still exposed `Close listing`, `Why this price`, `Play sound`, the listing heading, and listing copy.

Impact: keyboard and screen-reader users can encounter controls for a visually closed surface.

Expected: unmount the closed card or apply `aria-hidden`, `inert`, and non-focusable behavior while closed. Restore focus to the control that opened it.

### P2-3: Some phone tap targets are below 44 x 44 pixels

The search clear control is 28 x 28 pixels. The leaderboard tabs measured about 42 pixels high in the emulated phone viewport.

Impact: these controls are harder to hit accurately, especially one-handed or with motor impairments.

Expected: provide at least a 44 x 44 pixel interactive area, even if the visible icon remains smaller.

### P2-4: `/big` clips horizontally at phone width

At 390 pixels, the stacked `/big` panels measured about 453 pixels wide, ending near x=465. The root remains 390 pixels wide with overflow hidden, so the right side cannot be reached by scrolling.

Impact: anyone opening the shared `/big` link on a phone sees clipped stats and panels. The normal venue layout at 1920 x 1080 fits correctly.

Expected: constrain grid children with `min-width: 0`, allow stats to wrap within the viewport, and keep every panel at or below the available width.

### P2-5: Airless-object sound copy contradicts itself

Kepler-444 b is labeled `Airless. Hear its orbit.` and `no atmosphere`, but the disclaimer directly below says `This is the wind you would hear standing in its atmosphere.`

Impact: the explanation undermines trust in the physics-inspired audio feature.

Expected: use separate copy for airless objects, such as an orbital sonification disclaimer rather than atmospheric wind.

## P3

### P3-1: Credit units are visually and semantically inconsistent

Examples include `9,397cr`, `603credits`, and `603cr` in accessible text. Some visual spacing comes from CSS margins rather than actual text separation.

Impact: minor polish issue, with a possible screen-reader pronunciation cost.

Expected: standardize on text with explicit spacing, such as `9,397 cr` and `603 credits`.

### P3-2: Brief network loss did not produce immediate feedback

A 1.6 second offline emulation left the existing UI on screen without a reconnect pill. Network was restored immediately and the session remained usable.

Impact: short interruptions may look like stale data rather than a connection problem.

Confidence is limited because WebSocket disconnect detection can legitimately take longer than this safe, brief live test. Recheck with a controlled staging outage before changing behavior.

## Flow notes

### Landing and entry

- Connection moved from `Connecting` to `Enter the universe`.
- Callsign and crew controls were usable at 390 pixels.
- The landing page had no horizontal overflow at 390 x 844.
- Main controls were at least 44 pixels high except where called out above.

### Claim and listing

- Search plus Enter opened Kepler-444 b.
- The listing card fit the phone width and used an internal scroll area correctly.
- The claim button was reachable after scrolling.
- The claim completed, credits changed from 10,000 to 9,397, and the card changed to the owned state.
- Claim propagation updated the ticker, leaderboard, and portfolio without a reload.
- The listing price explanation, facts, physical properties, owner state, and audio control were present.

### Ticker, leaderboard, and portfolio

- The ticker showed landing, claim, and achievement events.
- `By value` and `By count` both switched correctly.
- The open leaderboard fit within the 390 pixel viewport.
- Portfolio opened and showed Kepler-444 b, one world, bank balance, and 603 credits of total value.

### Auction

- Live auction-only records exist for Mars, Earth, and Moon.
- Mars renders an Auction tag and the dead-end message described in P1-1.
- No live bid UI or auction panel was found on phone or `/big`.

### Big screen

- At 1920 x 1080, stats, full-height ticker, leaderboard, QR code, and play copy all fit.
- QR image loaded successfully at its natural 800 x 800 source size and rendered at 150 x 150.
- Leaderboard rotation between value and count occurred.
- At phone width, see P2-4.

## Staging load rerun

Command:

`npx tsx scripts/load.ts --db placex-staging --clients 30 --seconds 60`

Safety:

- Explicitly targeted `placex-staging`.
- Used no `--reset` and no synthetic seeding.
- `scripts/load.ts` already refuses the live database name `placex`.
- No server code or handoff file was changed.

Results:

- Connected: 30 of 30 in 5.0 seconds.
- Connect failures: 0.
- Catalog rows visible: 8,430.
- Duration: 60 seconds.
- Claims attempted: 163.
- Claims succeeded: 163.
- Claim success rate: 100 percent.
- Ack latency: p50 117.9 ms, p95 252.0 ms, max 662.2 ms.
- First-peer visibility: p50 114.1 ms, p95 233.2 ms, max 662.3 ms.
- All-30-client visibility: p50 119.0 ms, p95 269.8 ms, max 662.8 ms.
- Never seen by peers: 0.
- Errors and idle reasons: none.

## Overall confidence

High confidence in the tested live landing, claim, listing, ticker, leaderboard, portfolio, auction gap, desktop `/big`, and staging load numbers. Medium confidence for physical touch, audio, haptics, prolonged disconnection behavior, and an actively running auction because those conditions were not available in this pass.
