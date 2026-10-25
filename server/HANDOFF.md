# Backend handoff (Agent A)

Branch: `worktree-agent-a0c446181d69ed462`. Everything below is committed on it.

## What works

All reducers in `server/src/index.ts` are implemented. No table shapes or reducer
argument lists changed, so the generated client bindings are byte-identical (I ran
`npm run generate` and `git status` showed no change in `client/src/bindings/`).

| Reducer | Status | Notes |
| --- | --- | --- |
| `set_profile` | done | Callsign filtered and length-checked, crew validated. A second call just renames (no second join event). |
| `claim_object` | done | Unchanged rules plus achievements. |
| `hostile_takeover` | done | Wage war: 2× what the current owner paid (`claim.pricePaid`). If the deed is listed, the ask also floors the base so a takeover cannot undercut the sale. Previous owner receives the full cost. Buyer books at what they paid, so the next snipe doubles again. Awards `takeover_artist` on the first one. Auction-only objects (Earth, Moon, Mars) cannot be taken over: `AUCTION_ONLY`. |
| achievements | done | Awarded once per player per kind, inside `claim_object`, `hostile_takeover` and `settle_auction`. Each award also writes an `achievement` event. |
| `pay_income` | done, gated | Runs every 60 s. No-op until `config.incomeEnabled`. 1% of `pricePaid` per tick, 3% for `habitableZone`, at least 1 credit per planet. One credit update and at most one `income` event per player per tick (only online players get the ticker line). |
| `place_bid` | done, gated | `DISABLED` until `config.auctionsEnabled`. Opening bid must be at least the object's `priceCredits`; after that every bid must beat `highBid` (`BID_TOO_LOW`). Credits are escrowed; the outbid player is refunded in the same transaction. Raising your own bid escrows only the difference. |
| `settle_auction` | done | Transfers to the high bidder (credits already escrowed), `auction_won` event (actor is the winner), marks the auction inactive, then opens the next auction on the rolling schedule. Runs even if auctions were disabled mid-way so escrow is never stranded. |
| `set_flags` | done | Flipping `auctionsEnabled` to true opens the first auction if none is active. |
| `admin_reset` | done | Also clears pending `auction_schedule` timers now. |

Achievement rules (kinds from `client/src/types.ts`):

- `first_claim`: first owned object
- `diamond_collector`: 3 `carbon`
- `water_baron`: 3 `water`
- `hell_landlord`: 3 of `lava` or `hot_jupiter`
- `habitable_tycoon`: 5 with `habitableZone`
- `system_complete`: every object of a system (at least 2 objects) owned by one player
- `takeover_artist`: first hostile takeover

Rolling auction schedule: one auction open at a time, each ends 20 minutes after the
previous one, anchored so Earth closes at 08:40 PT Oct 25 (Mars 08:00, Moon 08:20,
Earth 08:40). Any other `auctionOnly` object in the catalog is auctioned before Mars.
If the schedule is already in the past when an auction opens, it ends 20 minutes after
the previous one (minimum 20 minutes from now). `set_flags(auctionsEnabled=true)` opens
the first one immediately.

## Event contract notes for the UI (no types.ts change needed)

- `kind: 'achievement'`: `objectId` holds the `AchievementKind` (there is no object), `amount` is 0.
- `kind: 'income'`: `objectId` is empty, `amount` is the credits paid that tick.
- `kind: 'takeover'`: `amount` is the 2x cost; `actor` is the buyer.
- `kind: 'auction_won'`: `actor` is the winner, `amount` the winning bid.
- `kind: 'bid'`: `amount` is the bid.

## How to flip features (admin CLI identity, the publisher)

```sh
export PATH="$HOME/.local/bin:$PATH"
# Enable passive income only
spacetime call placex set_flags '{"income_enabled": true, "auctions_enabled": false}' --server maincloud --no-config
# Enable income and start the auction schedule (opens Mars right away)
spacetime call placex set_flags '{"income_enabled": true, "auctions_enabled": true}' --server maincloud --no-config
# Check
spacetime sql placex "SELECT * FROM config" --server maincloud
spacetime sql placex "SELECT * FROM auction" --server maincloud
```

Both flags ship as `false`. Flipping `auctions_enabled` back to false freezes bidding;
an already open auction still settles at its end time.

## How to test

```sh
export PATH="$HOME/.local/bin:$PATH"
cd server && npm install && npm test          # 13 vitest tests, in-process harness
./node_modules/.bin/tsc --noEmit -p .          # typecheck (run from server/)
npm run build                                  # spacetime build
npm run publish:local                          # local SpacetimeDB on 127.0.0.1:3000
cd .. && npm install && npm run seed:local && npm run smoke:local
npm run smoke:cloud                            # against live placex
```

Unit tests (`server/test/reducers.test.ts`, `spacetimedb/server/test-utils`): claim race
(two identities, one wins, the other throws `ALREADY_CLAIMED`), insufficient credits for
claim and takeover with no side effects, auction-only and unknown ids, no profile,
takeover pays the previous owner and updates both portfolios, takeover validation,
callsign and crew rejection, double join, achievements awarded once, bids `DISABLED`
until enabled, `set_flags` opens Mars then settle hands it to the high bidder and opens
the Moon, income no-op until enabled then 1% and 3%, scheduled reducers reject
non-scheduler callers.

Last run: 13 passed. Local smoke: claim ack 4 ms, visible on the other client 4 ms.
Cloud smoke on `placex`: ack 109 ms, visible 109 ms.

## Deploy state

- `placex` (maincloud, live): republished from this branch, `admin_reset` called after
  the cloud smoke, so claims and events are empty and all credits are 10,000. The 8-object
  seed is intact. Flags are both false. `spacetime logs placex` shows only the expected
  `ERROR: claim_object: ALREADY_CLAIMED` and `AUCTION_ONLY` lines from the smoke test
  (SenderErrors are logged at ERROR level by the host; they are rejected calls, not crashes).
- `placex-staging` (maincloud): published and seeded, plus 2,000 synthetic
  "Load Test Object" rows from the load test. Never point a real client at it.
- `placex-loadtest` (local): a throwaway copy used to sanity-check the load script without
  touching `placex-local`. Safe to delete: `spacetime delete placex-loadtest --server local --yes`.

Republish live: `spacetime publish placex --server maincloud --module-path ./server --yes`.
Then `spacetime call placex admin_reset --server maincloud --no-config` only if you want
to wipe game state (do not do this once real players are on).

## Load test

```sh
# Staging only. Seeds 2,000 synthetic fixture objects, resets, runs 150 clients for 5 min.
npx tsx scripts/load.ts --db placex-staging --clients 150 --seconds 300 --synthetic 2000 --reset
```

Run 1: 150 clients, 300 s, maincloud `placex-staging`, 2,008 objects, from one laptop
process over Wi-Fi (Oct 25, about 00:20 PT):

| Metric | Value |
| --- | --- |
| clients connected | 150/150 in 8.6 s, 0 connect failures |
| claims attempted / succeeded | 1,601 / 1,584 |
| errors | 17 `ALREADY_CLAIMED` (genuine races on the same object), 0 other |
| never seen by peers | 0 |
| reducer ack latency | p50 528 ms, p95 5,219 ms, max 8,442 ms |
| claim-to-visible (first other client) | p50 470 ms, p95 4,725 ms, max 8,234 ms |
| visible on all 150 clients | p50 596 ms, p95 6,888 ms, max 13,960 ms |

All 150 players spent their 10,000 credits within about 2.5 minutes (about 10 claims
each at 400 to 1,500 credits), so the first 90 seconds carried the real load: about
13 claims per second with every claim fanned out to 150 subscribers of `claim` and
`player`. Peak-window p50 was 400 to 570 ms.

Reading the numbers: correctness is clean (no lost claims, no duplicate owners, only
real races rejected). Latency is over the 200 ms PRD target under this burst. Part of
that is the harness itself: one Node process holds all 150 sockets and decodes every
broadcast on one thread, so client-side queueing inflates both ack and visible times
(the 2-client cloud smoke measures 109 ms on the same database). See run 2 below for
the comparison at 30 clients.

Run 2: 30 clients, 60 s, same database, same laptop, about 3 claims per second:

| Metric | Value |
| --- | --- |
| clients connected | 30/30, 0 failures |
| claims attempted / succeeded | 178 / 178 |
| errors | 0 |
| reducer ack latency | p50 134 ms, p95 455 ms, max 913 ms |
| claim-to-visible (first other client) | p50 134 ms, p95 455 ms, max 913 ms |
| visible on all 30 clients | p50 141 ms, p95 462 ms, max 917 ms |

At 30 concurrent claimers (close to the PRD's 40 peak concurrency target) p50 is inside
the 200 ms target and p95 is under half a second. The 150-client burst is the stress
case, not the expected demo load.

Levers if it matters at judging: (1) the client's `player` subscription updates on every
claim for every player; if the UI only needs the leaderboard, a view with the top N would
cut fan-out; (2) `checkCollectionAchievements` scans `celestial_object` once per claim for
`system_complete`; an index on `system` (table shape change, lead's call) removes it;
(3) real players claim far slower than 13 per second.

## Stubbed or deferred

- Nothing is stubbed. `place_bid`, `pay_income` and auctions ship disabled behind
  `config` flags.
- No takeover notification table: the client can detect "my planet was taken" by watching
  `claim` updates where the old row's owner was me (the `takeover` event also carries the
  object id). If the UI wants a dedicated row, ask the lead for a `notification` table.
- `system_complete` counts objects per system from `celestial_object` on every claim.
  With 6,000 objects that is one table scan per claim; fine at hackathon scale, index
  `system` if it ever matters.

## Contract change requests for the lead

None required. Optional, for the UI:

1. Document in `client/src/types.ts` that for `kind: 'achievement'` the `objectId` field
   carries the achievement kind (see above). No type change, a comment.

## Known bugs and caveats

- `admin_reset` resets credits and claims but keeps player rows and callsigns, so smoke
  test callsigns (`smokeXXXXA`) stay on the leaderboard with 0 claims until a full
  `--delete-data=always` republish.
- Income events go to the ticker only for online players, so an idle owner silently
  accrues credits. Intentional, to keep the ticker readable.
