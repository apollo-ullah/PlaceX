# Agent B handoff: data pipeline

Branch: `worktree-agent-ab16ec62a7fa0f6f1`. Files touched: `pipeline/**`,
`client/public/data/objects.json`, `client/public/data/stars.json`. Nothing else.

## What works

- `pipeline/build.py` is one idempotent command. It queries the NASA Exoplanet Archive
  TAP endpoint (`pscomppars`, CSV, the 12 columns from the brief), caches the raw CSV in
  `pipeline/raw/`, merges the hand-built Solar System, prices, classifies, writes sound
  params, facts and blurbs, then writes `objects.json` and `stars.json`.
- `pipeline/validate.py` passes (exit 0) on the committed `objects.json`. It fails
  (exit 1) on a deliberately corrupted copy: tested with a low price, a pitchRatio of 9,
  a bogus `estimated` entry, an em dash, three sentences, a missing key, a string mass, a
  duplicate id and a missing placeholder id. All nine were reported.
- The 8 placeholder ids exist with the same slugs: `earth`, `moon`, `mars`, `jupiter`,
  `proxima-cen-b`, `trappist-1-e`, `wasp-76-b`, `kelt-9-b`. Slug rule: lowercase, every
  run of non-alphanumerics becomes one hyphen, trimmed (`55 Cnc e` -> `55-cnc-e`).

## Numbers

| | |
| --- | --- |
| Archive rows fetched | 6,451 |
| Dropped: no distance | 28 |
| Dropped: no mass and no radius | 7 |
| Full catalog (Solar System + exoplanets) | 6,430 objects, 4.75 MB |
| **Shipped catalog** | **5,432 objects, 3,999,665 bytes (4.00 MB), 517 KB gzipped** |
| Solar System objects | 14 (Sun, Mercury, Venus, Earth, Moon, Mars, Jupiter, Io, Europa, Saturn, Titan, Uranus, Neptune, Pluto) |
| Exoplanets | 5,418, everything within 3,415 ly |
| Estimated mass / radius | 10 / 41 objects (plus `gravityG` on each of those) |
| Habitable zone | 51 objects |
| Verified facts | 27 objects |
| stars.json | 5,000 stars, 140 KB |

Class counts:

```
sub_neptune   1216
gas_giant     1155
rocky         1122
hot_jupiter    727
water          485
ice_giant      396
iron           195
lava           130
moon             4
star             1   (Sun)
carbon           1   (55 Cnc e)
```

Price histogram (credits, all objects). 99.9 percent of exoplanets land in 400 to 1,500,
median 797, minimum 449, maximum 2,355 (the Sun):

```
    0-199       0   0.0%
  200-399       0   0.0%
  400-599      84   1.5%
  600-799    2683  49.4% #############################
  800-999    1857  34.2% ####################
 1000-1199    629  11.6% ######
 1200-1499    170   3.1% #
 1500-1999      8   0.1%
 2000-2999      1   0.0%
```

Top prices: Sun 2,355; 55 Cnc e 1,728; Jupiter 1,656; eps Ind A b 1,589; Neptune 1,558;
Saturn 1,551; Uranus 1,543; Earth 1,511 (auction only); Proxima Cen b 1,398.

## Decision the lead should know about: the 4 MB cut

The contract keys plus numbers cost about 578 bytes per object before any copy, so
6,430 objects is 3.7 MB with empty facts and blurbs. No amount of prose trimming gets the
full catalog under 4 MB. `build.py` therefore keeps the nearest objects that fit the
budget and drops the farthest 998 exoplanets (everything beyond 3,415 ly, almost all
OGLE, KMT and MOA microlensing detections with few measured values and no temperature).
Records (hottest, closest, oldest) are recomputed over the kept set.

If you prefer the "6,000+ exoplanets" pitch line over the 4 MB rule, run
`pipeline/.venv/bin/python pipeline/build.py --max-bytes 0` (4.75 MB, about 620 KB
gzipped, Vercel compresses static files) and run validate with the same understanding
that its size check will flag it. That is the only check it would fail. I kept the brief's
rule by default.

## Models (all thresholds are also in comments in `build.py`)

- **Positions**: `x = d cos(dec) cos(ra)`, `y = d cos(dec) sin(ra)`, `z = d sin(dec)`, light
  years, 1 pc = 3.26156 ly, equatorial frame. Verified against the lead's placeholder
  coordinates for Proxima Cen b and WASP-76 b. HYG uses the same frame.
- **Solar System positions**: the real Solar System is 0.001 ly across, so bodies get
  schematic offsets: Sun at (-0.005, 0, 0), planets around the Sun at `0.005 sqrt(a_AU)`
  ly at spread angles with a small z lift, moons 0.0012 ly from their parent, Earth exactly
  at the origin. `distanceLy` is 0 and `system` is `"Sol"` for all 14. Treat the offsets as
  layout, not distance.
- **Mass-radius fill**: Chen and Kipping 2017 broken power law (`R = 1.008 M^0.279` below
  2.04 Earth masses, `R = 0.808 M^0.589` to 131.6, `R = 17.74 M^-0.044` above). Inverted
  for radius-only rows; a giant with `R >= 14.3` and no mass is assumed 1 Jupiter mass
  because that branch cannot be inverted. Filled fields and `gravityG` go in `estimated`.
- **Class**: `carbon` only 55 Cnc e. Giant (`R >= 6` or `M >= 50`): `hot_jupiter` if
  T > 1000 K else `gas_giant`. `3.5 <= R < 6`: `ice_giant`. `1.75 <= R < 3.5`: density
  >= 4 g/cm3 is treated as rocky, 2 to 4 g/cm3 with T < 600 K is `water`, otherwise
  `sub_neptune`. Small rocky family: T > 1500 K `lava`, density >= 7 `iron`, else `rocky`.
  Density from `pl_dens`, or `5.51 M / R^3` when missing. Mercury is hand-set to `iron`,
  Pluto to `rocky` (there is no dwarf class).
- **Habitable zone**: equilibrium temperature 180 to 310 K on a planet with `R < 1.8`
  (or `M < 10` with no radius), class rocky, iron or water. Earth true, Mars false (as in
  the placeholder).
- **Price**: `V = M_kg x $/kg x 5 (habitable) x 3 (rare) x 2 (Solar System)`, with the
  PRD $/kg table. `sub_neptune` is not in the PRD table and is priced like an ice giant
  ($0.30). `moon` and `star` use the body's composition (Europa $1.00 water, Titan and
  Pluto $0.30 ice, Moon and Io $0.20 rock, Sun $0.05 hydrogen). Rare (3x) = computed
  records over the kept set (hottest: KELT-9 b; closest: Proxima Cen b and d; oldest
  discovery: PSR B1257+12 c and d, 1992) plus the named famous objects (KELT-9 b,
  WASP-76 b, HD 189733 b, 55 Cnc e, GJ 1214 b, the seven TRAPPIST-1 planets, Proxima Cen b)
  plus Earth and the Sun. `rarityMult` in the breakdown is the product of the 3x and the
  Solar System 2x, as in the placeholder. `P = 100 (log10 V - 18)(1 + 50/(d + 50))`,
  rounded, floor 50.
- **Sound**: `v = sqrt(1.4 R T / M)`. Gas: H2/He 0.0023 (gas giants, hot Jupiters, Sun),
  0.0026 (ice giants, sub-Neptunes), N2 0.029 (rocky, iron, water below 400 K, Titan),
  CO2 0.044 (rocky or iron at 400 K and above, Venus, Mars), rock vapor 0.060 (lava,
  carbon). `pitchRatio = v/343` clamped to [0.25, 4]. `density` is a game parameter per
  class (gas giant 30, hot Jupiter 20, ice giant 10, sub-Neptune 5, water 3, rocky 1,
  hot CO2 rocky 10, lava 0.5; Venus 54, Mars 0.01, Titan 4.4). Layers: storm for giants,
  ice for ice giants and any solid world below 150 K, lava for lava and carbon, wind
  otherwise. `silence` (v 0, ratio 1, density 0) for Solar System moons, Mercury, Pluto,
  and rocky or iron exoplanets under 0.1 Earth masses. When `tempK` is null the sound uses
  a class default temperature; `tempK` stays null and is not marked estimated.
- **Facts**: verified facts for KELT-9 b, WASP-76 b, HD 189733 b, 55 Cnc e, GJ 1214 b,
  TRAPPIST-1 b through h, Proxima Cen b and all 14 Solar System bodies (sources cited
  inline in `facts.py`). Everything else is templated from the object's own measured
  values only (year length, equilibrium temperature with a true melting or boiling point
  comparison, gravity, light travel time, host star temperature, discovery year); fields in
  `estimated` are never used. No LLM was called.
- **Blurbs**: 2 to 4 variants per class, chosen by CRC of the id so output is stable, two
  sentences max. Hand-written for the Solar System (the lead's Earth, Moon, Mars and
  Jupiter blurbs kept, with Earth, Moon and Jupiter tightened from three sentences to two).

## stars.json

Source: HYG Database v4.0 by David Nash (astronexus),
https://github.com/astronexus/HYG-Database, file `hyg/CURRENT/hygdata_v40.csv.gz`,
licensed CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Please credit
"HYG Database, astronexus.com, CC BY-SA 4.0" in the Devpost data sources. The download
succeeded, so the fallback (host stars of the exoplanets) was not used. Format: array of
`[x, y, z, mag]` in light years, brightest first (Sirius at mag -1.44, down to mag 6.01),
Sol excluded, stars with unknown distance excluded.

## Commands

```sh
# setup once
/opt/homebrew/bin/python3 -m venv pipeline/.venv && pipeline/.venv/bin/pip install requests
# regenerate (cached) and validate
pipeline/.venv/bin/python pipeline/build.py
/opt/homebrew/bin/python3 pipeline/validate.py
# re-download the archive
pipeline/.venv/bin/python pipeline/build.py --refresh
```

## Requests for the lead

1. Decide on the 4 MB cut above (default keeps 5,432; `--max-bytes 0` keeps 6,430).
2. The UI should show "Solar System" instead of "0 ly" for objects whose `system` is
   `"Sol"`, and `estimated` contains `gravityG` whenever mass or radius was filled.
3. `discoveryYear` is null for the Solar System; the card should hide the chip, not show
   "null".
4. `valueUsd` is a float with 4 significant digits (for example `3.58e+25`); the ticker
   should format it ("35.8 septillion" or "3.6e25 USD"), not print the raw float.
5. The seed script sends `price_credits`, `value_usd`, `cls`, `habitable_zone` per object
   as before; nothing in the output shape changed, so `node scripts/seed.mjs` should work
   unchanged with the larger catalog (5,432 rows, chunked at 400).

## Known limits

- The hottest record in the full catalog is KOI-55 b (7,778 K, a contested detection at
  3,850 ly). It is outside the shipped cut, so the record goes to KELT-9 b. With
  `--max-bytes 0` it would go to KOI-55 b.
- Equilibrium temperatures are archive values (assume a specific albedo); 534 archive rows
  have none, those objects have `tempK: null` and fall back to a class default for sound.
- Brown dwarfs in `pscomppars` (masses above 13 Jupiter masses) are kept as gas giants
  because the archive lists them as planets.
