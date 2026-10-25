# Cursor tasks for the humans

Well-scoped tasks to do directly in Cursor's agent while the subagents build. Each one is
self-contained, touches a small set of files, and shows real Cursor usage for the SpaceXSI track.
Take screenshots of the Cursor agent panel as you go for the Devpost write-up.

Rules: no em dashes in any copy. Only edit files in the folder named by the task. Commit with a
message starting with `cursor:` so the build log can count them.

## Open now (safe at any time)

1. **Realtor blurbs for the Solar System** (`client/public/data/objects.json` after the data agent lands, or `pipeline/solar_system.py`): rewrite the `blurb` for Sun, Mercury, Venus, Earth, Moon, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto, Europa, Titan, Io in a fun luxury-realtor voice. Two sentences max. Facts must stay true.
2. **Landing page copy** (`client/src/ui/Landing.tsx` once it exists): tighten the headline and sub-line. Keep "Claim the universe before someone else does."
3. **Favicon and social image** (`client/public/`): a 512 px black square with a gold planet and the PlaceX wordmark. Add `favicon.svg` and `og.png`, and reference them from `client/index.html`.
4. **README screenshots** (`docs/screenshots/`): once the site is live, capture the landing, the listing card for WASP-76 b, the leaderboard, and the big screen. Insert into `README.md`.

## After the UI agent lands (about 2:30 AM)

5. **Mobile pass at 390 px** (`client/src/ui/`): open DevTools at iPhone 12 size, fix any control that is not reachable with a thumb, any text that overflows, any tap target under 44 px.
6. **Price breakdown copy** (`client/src/ui/ListingCard.tsx`): the breakdown toggle should read like a receipt: composition $/kg, habitable multiplier, rarity multiplier, distance multiplier, then the log compression line. Make it scannable.
7. **Empty and error states** (`client/src/ui/`): what the ticker shows with zero events, what the card shows if objects.json is still loading, what the leaderboard shows with one player.
8. **SNIPED animation polish** (`client/src/ui/ListingCard.tsx`): make the ALREADY_CLAIMED animation feel dramatic: red flash, stamp effect, 600 ms, then the card shows the new owner.

## After 3 AM (live site, bug fixes only)

9. Anything listed in `docs/QA.md` marked P1 or P2 that the lead has not assigned.
10. **Devpost polish** (`docs/DEVPOST.md`): read it as a judge, cut anything that does not sell, add the Cursor screenshots.
