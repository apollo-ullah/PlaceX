# UI shell handoff (Agent D)

Branch: `worktree-agent-abb416bea652f5126`. Everything lives in `client/src/ui/`, plus a
Google Fonts link in `client/index.html` and additive tokens in `client/src/index.css`
(existing variable names kept; `--font-ui` now prefers Space Grotesk, mono is JetBrains Mono).
No new npm dependencies. Plain CSS, no UI framework.

## Components

| File | What |
| --- | --- |
| `index.tsx` | `Shell({ big })`. Explorer: landing until `useHasProfile()`, then HUD, leaderboard, ticker, listing card, portfolio, takeover banner, achievement toasts. `big` renders `BigScreen` with no landing and no card. The `.px-root` layer is `pointer-events: none`, each panel re-enables, so taps between panels reach the scene. |
| `ui.css` | The whole visual system. Mobile first, desktop rules under `@media (min-width: 900px)`. Glass panels, gold for self, crew colors via `--c` custom property. |
| `Landing.tsx` | Headline, callsign input (2 to 16, inline `BAD_CALLSIGN` copy, client-side check first), crew picker from `CREWS`, Enter calls `actions.setProfile`. Enter is disabled with a "Connecting" state while `useConnection().connected` is false. |
| `Hud.tsx` | `Credits` (top left, bumps on change, opens the portfolio), `Search` (`searchObjects` over `useObjects().list`, shows owner or price per result, pick calls `api.flyTo(id)` and `select(id)`), `Teleport` (bottom center, `api.teleport()`), `ConnectionPill` (shown when not connected). |
| `Leaderboard.tsx` | Collapsible panel top right with "By value" and "By count" tabs from `useLeaderboard`. `LeaderboardPanel` is reused by the big screen. |
| `Ticker.tsx` | `useEvents`, newest at the top, names resolved through `useObjects().byId`. `TickerLine` is reused by the big screen. |
| `ListingCard.tsx` | Bottom sheet on mobile (max 64dvh, swipe down on the handle or X closes, Escape too), side panel at 900px and up. Hero planet disc, name and system, price with "Why this price" breakdown and `formatUsd(valueUsd)`, four stat chips with `est.` markers, fact with Verified or From the data badge, blurb, Play sound toggle with `SOUND_DISCLAIMER`, owner block, Claim or Hostile takeover or the auction line. Claim flow with stamps and error handling. |
| `Planet.tsx` | CSS planet disc per `PlanetClass` (bands, ring for gas giants, lava glow, water ripple, diamond sparkle). |
| `Toast.tsx` | `ToastProvider` and `useToast()(message, kind, ms)`. |
| `BigScreen.tsx` | `/big`: stats bar from `useStats()`, full-height ticker (newest line highlighted), leaderboard with tabs rotating every 15 s, QR slot (`<img src="/qr.png">`, checkerboard fallback with the site origin when missing). |
| `Extras.tsx` | `Portfolio` (gallery of `useMyClaims()`, total value, tap a holding to fly there), `TakeoverBanner` (watches `useClaims()` for a claim I owned switching owner, 7 s banner, tap to fly back, haptic where supported), `AchievementToasts` (toasts new `useAchievements()` kinds after the first render). |
| `format.ts` | Copy and number formatting: class labels, error copy, ticker line parts, chip formatters, achievement titles. |

## What works (verified in mock mode, 390 px and 1440 px, plus /big at 1920 px)

- Full loop: enter callsign and crew, search or Teleport, card opens, Claim, CLAIMED stamp with
  confetti and `api.playClaimAnimation(id, crewColor)`, credits bump, ticker and leaderboard update.
- Takeover on an owned listing (2x price, red button, "Pays X double" hint).
- SNIPED: on `ALREADY_CLAIMED` from `actions.claim`, and also when the open listing flips from
  unclaimed to owned by someone else while you are looking (captured live against the mock bots).
- `INSUFFICIENT_CREDITS` shakes the button and shows "Short by N cr".
- `AUCTION_ONLY` (and `auctionOnly` objects) show "Auction only. Watch the big screen."
- Other codes toast realtor copy from `ERROR_COPY`.
- No horizontal scroll at 390 px; every control is 44 px or taller; safe-area insets applied.
- Lava and hot Jupiter cards tint red and tremble once on open; water cards tint blue and the disc
  ripples; carbon discs sparkle.

## Ticker event conventions (from the lead)

- `achievement` events carry the achievement kind in `objectId`. Rendered as
  "nova earned Diamond Collector" via `ACHIEVEMENT_COPY`; unknown kinds get prettified.
- `income` events are skipped in both tickers (`isTickerEvent` in `format.ts`). One line per online
  player per minute would drown the claims. The copy "ady collected 142 cr in rent" is still
  implemented in `tickerParts` if the lead wants them back: delete the filter.
- `auction_won` and `bid` resolve the real object id.

## Stubbed or not done

- Auction panel with countdown (Phase 3, F brief) is not built. `useAuctions()` is unused.
- Deed card sharing: not built.
- Achievement toasts and the takeover banner are wired but could only be reasoned about, not
  observed: the mock provider has no achievements and bots never take over.
- The `/qr.png` asset does not exist yet. Drop one into `client/public/qr.png` and the big screen
  picks it up; until then it shows a checkerboard with "Scan to play" and the origin.

## How to test

```sh
cd client && npm install && VITE_MOCK=1 npm run dev
```

- Open http://localhost:5173 in a 390 px wide viewport (Chrome device toolbar, iPhone 12/13/14).
- Type a 1-character callsign and press Enter: inline error. Enter a real one.
- Tap Teleport (the scene stub selects a random object). Tap "Why this price". Tap Play sound
  (stub logs to console). Tap Claim or Hostile takeover.
- To see SNIPED in mock: search `k` or `t`, open a listing that still shows a price (unclaimed),
  leave the card open; a bot claims one of the 5 claimable placeholder objects every 6 s.
  With only 8 placeholder objects the bots usually own everything within a minute of load, so
  reload if you need an unclaimed one. Once the real `objects.json` lands this is a non-issue.
- Tap the credits pill for the portfolio. Tap the trophy for the leaderboard.
- http://localhost:5173/big for the venue display.
- `npm run build` must pass (it does on this branch).

## Known issues

- With the 8-object placeholder catalog, claimable supply is 5 objects, so mock testing of the
  Claim path depends on timing (see above). Not a UI bug.
- Swipe-to-close works only from the grab handle at the top of the sheet, not from anywhere on the
  card body, so body scrolling never fights the gesture.
- The search placeholder is short ("Find a planet") so it fits beside the credits pill and the
  leaderboard toggle at 390 px.
- Desktop: the leaderboard hides while a card is open to keep the right side clear.
- Google Fonts is loaded from the network; without it the stacks fall back to Inter or system
  sans and SF Mono or Menlo, which still look fine.

## Contract change requests for the lead

None blocking. Nice-to-haves:

1. `ClaimView` could carry the previous owner on a takeover so the banner does not need to diff
   two maps (works today, just more state on the client).
2. A `priceCredits` snapshot on `EventView` for `takeover` events is already there via `amount`.
   For `income` events, if they stay in the table, a per-player subscription filter would let the
   client show only its own rent without receiving everyone's.
3. `SceneApi.playClaimAnimation` is called right after the reducer resolves. If the scene wants to
   await its own flight before the card updates, it should expose a promise; the UI does not wait.
