# PlaceX data pipeline

Turns the NASA Exoplanet Archive plus a hand-built Solar System into
`client/public/data/objects.json` (the catalog every other part of PlaceX renders)
and `client/public/data/stars.json` (the background star field).

## Setup (once)

```sh
/opt/homebrew/bin/python3 -m venv pipeline/.venv
pipeline/.venv/bin/pip install requests
```

Only `requests` is used, and only for downloads; the rest is the standard library.
Without `requests` the build falls back to `urllib` for the archive query.

## Build

```sh
pipeline/.venv/bin/python pipeline/build.py                 # idempotent, uses pipeline/raw/ cache
pipeline/.venv/bin/python pipeline/build.py --refresh       # re-download the archive CSV
pipeline/.venv/bin/python pipeline/build.py --skip-stars    # objects.json only
pipeline/.venv/bin/python pipeline/build.py --max-bytes 0   # keep every object (about 4.75 MB)
```

Raw downloads are cached in `pipeline/raw/` (gitignored):
`pscomppars.csv` (NASA TAP) and `hygdata_v40.csv.gz` (HYG star catalog).

## Validate

```sh
/opt/homebrew/bin/python3 pipeline/validate.py
```

Checks every field and type of every object against `client/src/types.ts`
(`CelestialObject`), unique slug ids, finite numbers, enums, `estimated` only
naming real fields, integer prices of at least 50, `pitchRatio` in [0.25, 4],
positions matching `distanceLy`, no em or en dashes, two sentences max, the eight
placeholder ids, at least 5,000 objects and the 4 MB limit. Prints class counts and
a price histogram. Exits non-zero on any violation.

## Files

| File | Purpose |
| --- | --- |
| `build.py` | The one command. TAP query, coordinates, mass-radius fill, classification, pricing, sound, output. Thresholds are documented in comments next to the code. |
| `solar_system.py` | Sun, Mercury, Venus, Earth, Moon, Mars, Jupiter, Io, Europa, Saturn, Titan, Uranus, Neptune, Pluto with published values and schematic positions. |
| `facts.py` | Verified hand-written facts for famous objects, templated facts from real stats for the rest, realtor blurbs per class. |
| `stars.py` | The 5,000 brightest HYG stars as `[x, y, z, mag]` in light years. |
| `validate.py` | Strict schema check of `objects.json` and `stars.json`. |
| `HANDOFF.md` | What was built, numbers, known limits, requests for the lead. |

## Model summary

See the comments in `build.py` for the exact thresholds. In short:

- Positions: `x = d cos(dec) cos(ra)`, `y = d cos(dec) sin(ra)`, `z = d sin(dec)`, light
  years, Earth at the origin, 1 pc = 3.26156 ly. Same frame as the HYG catalog.
- Missing mass or radius: Chen and Kipping (2017) broken power law, recorded in `estimated`.
- Class: radius decides giant / Neptune-size / mid / small; density and temperature
  refine (lava above 1,500 K, iron above 7 g/cm3, water for mid-size 2 to 4 g/cm3 below
  600 K, hot Jupiter above 1,000 K). `carbon` is only 55 Cnc e.
- Price: `V = M_kg x $/kg x 5 (habitable) x 3 (record or famous) x 2 (Solar System)`,
  `P = 100 (log10 V - 18) (1 + 50 / (d + 50))`, rounded, floor 50.
- Sound: `v = sqrt(1.4 R T / M)` with a class-based gas, `pitchRatio = v / 343` clamped.
