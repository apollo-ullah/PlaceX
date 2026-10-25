#!/usr/bin/env python3
"""PlaceX data pipeline: NASA Exoplanet Archive + hand-built Solar System -> objects.json.

One command, idempotent, cached:
    pipeline/.venv/bin/python pipeline/build.py            # uses pipeline/raw/ cache
    pipeline/.venv/bin/python pipeline/build.py --refresh  # re-download the archive CSV
    pipeline/.venv/bin/python pipeline/build.py --skip-stars

Steps
  1. TAP query on `pscomppars` (CSV) for the columns below, cached in pipeline/raw/.
  2. Drop rows with no sy_dist. Convert RA, Dec (deg) and distance (pc) to x, y, z in
     light years, Earth at the origin, equatorial frame:
         x = d cos(dec) cos(ra),  y = d cos(dec) sin(ra),  z = d sin(dec)
     (same frame as the HYG catalog used for stars.json).
  3. Fill a missing mass or radius with the Chen & Kipping (2017) broken power law
     (see mass_from_radius / radius_from_mass) and record it in `estimated`.
  4. gravityG = massEarth / radiusEarth^2 (estimated if either input was).
  5. Classify (see classify) from radius, density and equilibrium temperature.
  6. Price and sound exactly per the PRD (see price / sound).
  7. Facts and blurbs from facts.py. Stable slug ids.
  8. Write client/public/data/objects.json (compact, floats to 3 decimals) and
     client/public/data/stars.json via stars.py.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import re
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW_DIR = os.path.join(HERE, "raw")
RAW_CSV = os.path.join(RAW_DIR, "pscomppars.csv")
OUT_DIR = os.path.join(ROOT, "client", "public", "data")
OUT_JSON = os.path.join(OUT_DIR, "objects.json")

sys.path.insert(0, HERE)
from facts import FAMOUS_RARITY, blurb_for, fact_for  # noqa: E402
from solar_system import solar_system_rows  # noqa: E402

TAP_URL = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
COLUMNS = ["pl_name", "hostname", "ra", "dec", "sy_dist", "pl_bmasse", "pl_rade", "pl_eqt",
           "pl_orbper", "disc_year", "st_teff", "pl_dens"]
TAP_QUERY = f"select {','.join(COLUMNS)} from pscomppars"

PC_TO_LY = 3.26156
MAX_BYTES = 4_000_000  # objects.json budget (strict "4 MB"); the farthest exoplanets are dropped to fit
EARTH_MASS_KG = 5.972e24
EARTH_DENSITY = 5.51  # g/cm3
R_GAS = 8.314
GAMMA = 1.4
V_EARTH = 343.0

# ---------------------------------------------------------------------------
# Pricing (PRD "Pricing"): V = M_kg * $/kg * habitable(5x) * rarity * SolarSystem(2x)
# P = 100 * (log10 V - 18) * (1 + 50 / (d_ly + 50)), rounded, floor 50.
# `sub_neptune` is not in the PRD table; it is priced like an ice giant ($0.30,
# a volatile-rich envelope). `moon` and `star` use the body's composition
# (set per object in solar_system.py).
# ---------------------------------------------------------------------------
USD_PER_KG = {
    "carbon": 1000.0, "iron": 0.5, "rocky": 0.2, "water": 1.0, "ice_giant": 0.3,
    "sub_neptune": 0.3, "gas_giant": 0.05, "hot_jupiter": 0.05, "lava": 0.1,
}
HABITABLE_MULT = 5.0
RARITY_MULT = 3.0
SOLAR_MULT = 2.0
PRICE_FLOOR = 50

# ---------------------------------------------------------------------------
# Sound (PRD "Sound"): v = sqrt(gamma R T / M) with gamma = 1.4 and a class-based gas.
#   gas giants and hot Jupiters: H2/He         M = 0.0023 kg/mol
#   ice giants and sub-Neptunes: H2/He/CH4     M = 0.0026
#   rocky, iron, water, T < 400 K: N2          M = 0.029
#   rocky, iron, T >= 400 K (Venus-like CO2):  M = 0.044
#   lava and carbon: rock vapor                M = 0.060
# pitchRatio = v / 343 clamped to [0.25, 4]. `density` is the assumed atmosphere
# density relative to Earth's surface air (game parameter, not a measurement).
# Airless: Solar System moons/Mercury/Pluto and rocky or iron exoplanets below
# 0.1 Earth masses (too small to hold air) -> layer "silence", v = 0, ratio 1.
# If tempK is missing the sound uses a class default temperature; tempK itself
# stays null and is not listed in `estimated`.
# ---------------------------------------------------------------------------
GAS_MOLAR = {"gas_giant": 0.0023, "hot_jupiter": 0.0023, "ice_giant": 0.0026, "sub_neptune": 0.0026,
             "lava": 0.060, "carbon": 0.060, "star": 0.0023}
ATMO_DENSITY = {"gas_giant": 30.0, "hot_jupiter": 20.0, "ice_giant": 10.0, "sub_neptune": 5.0,
                "water": 3.0, "rocky": 1.0, "iron": 1.0, "lava": 0.5, "carbon": 0.5, "star": 0.0002}
DEFAULT_TEMP = {"gas_giant": 150.0, "hot_jupiter": 1200.0, "ice_giant": 100.0, "sub_neptune": 500.0,
                "rocky": 300.0, "iron": 300.0, "water": 300.0, "lava": 1600.0, "carbon": 1900.0}
LAYER = {"gas_giant": "storm", "hot_jupiter": "storm", "ice_giant": "ice", "sub_neptune": "wind",
         "rocky": "wind", "iron": "wind", "water": "wind", "lava": "lava", "carbon": "lava", "star": "storm"}
AIRLESS_MASS = 0.1

# Habitable zone: equilibrium temperature 180..310 K (Earth is ~255 K) on a small
# planet (radius < 1.8 Earth, or no radius and mass < 10 Earth). Temperature-only
# because insolation is not in our column set.
HZ_T_MIN, HZ_T_MAX, HZ_R_MAX, HZ_M_MAX = 180.0, 310.0, 1.8, 10.0


def fnum(v):
    try:
        if v is None or v == "":
            return None
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def rnd(x):
    """3 decimals for |x| >= 1, else 3 significant digits so small values survive."""
    if x is None:
        return None
    if abs(x) >= 1:
        return round(x, 3)
    return float(f"{x:.3g}")


def slug(name: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", name.lower())).strip("-")


# ---------------------------------------------------------------------------
# Mass-radius relation: Chen & Kipping 2017 (ApJ 834, 17), Earth units.
#   R = 1.008 M^0.279            M <  2.04      (terran)
#   R = 0.808 M^0.589    2.04 <= M <  131.6     (neptunian)
#   R = 17.74 M^-0.044  131.6 <= M              (jovian, degenerate)
# The jovian branch cannot be inverted (radius barely depends on mass), so a
# giant with R >= 14.3 and no mass is assumed to be 1 Jupiter mass (317.8 Earth).
# ---------------------------------------------------------------------------
def radius_from_mass(m: float) -> float:
    if m < 2.04:
        return 1.008 * m ** 0.279
    if m < 131.6:
        return 0.808 * m ** 0.589
    return 17.74 * m ** -0.044


def mass_from_radius(r: float) -> float:
    if r < 1.23:
        return (r / 1.008) ** (1 / 0.279)
    if r < 14.3:
        return (r / 0.808) ** (1 / 0.589)
    return 317.8


# ---------------------------------------------------------------------------
# Classification thresholds (radius in Earth radii, density g/cm3, T in K):
#   carbon       only 55 Cnc e (by name, per the brief)
#   giant        R >= 6, or no radius and M >= 50:
#                  hot_jupiter if T > 1000, else gas_giant
#   ice_giant    3.5 <= R < 6, or no radius and 10 <= M < 50   (Neptune, Uranus sized)
#   mid          1.75 <= R < 3.5 (sub-Neptune sized), decided by density:
#                  density >= 4.0                     -> treated as rocky (large super-Earth)
#                  2.0 <= density < 4.0 and T < 600 K -> water (rock plus a thick water layer,
#                                                        cool enough that it is not all steam)
#                  otherwise (puffy, hot, or no T)    -> sub_neptune (H/He envelope)
#   small        R < 1.75 (or no radius and M < 10), rocky family:
#                  T > 1500      -> lava   (molten silicate surface)
#                  density >= 7  -> iron   (Mercury-like, mostly metal)
#                  else          -> rocky
# Density comes from pl_dens, or 5.51 * M / R^3 when pl_dens is missing.
# ---------------------------------------------------------------------------
def classify(name: str, m, r, t, dens) -> str:
    if name == "55 Cnc e":
        return "carbon"
    if (r is not None and r >= 6.0) or (r is None and m is not None and m >= 50):
        return "hot_jupiter" if (t is not None and t > 1000) else "gas_giant"
    if (r is not None and 3.5 <= r < 6.0) or (r is None and m is not None and 10 <= m < 50):
        return "ice_giant"
    rocky_family = True
    if r is not None and 1.75 <= r < 3.5:
        if dens is not None and dens >= 4.0:
            rocky_family = True
        elif dens is not None and 2.0 <= dens < 4.0 and t is not None and t < 600:
            return "water"
        else:
            return "sub_neptune"
    if rocky_family:
        if t is not None and t > 1500:
            return "lava"
        if dens is not None and dens >= 7.0:
            return "iron"
        return "rocky"
    return "rocky"


def habitable(cls: str, r, m, t) -> bool:
    if t is None or cls not in ("rocky", "iron", "water"):
        return False
    small = (r is not None and r < HZ_R_MAX) or (r is None and m is not None and m < HZ_M_MAX)
    return small and HZ_T_MIN <= t <= HZ_T_MAX


def price(mass_earth: float, usd_per_kg: float, hab: bool, rare: bool, solar: bool, d_ly: float):
    hab_mult = HABITABLE_MULT if hab else 1.0
    rarity = (RARITY_MULT if rare else 1.0) * (SOLAR_MULT if solar else 1.0)
    value = mass_earth * EARTH_MASS_KG * usd_per_kg * hab_mult * rarity
    dist_mult = 1.0 + 50.0 / (d_ly + 50.0)
    credits = int(round(100.0 * (math.log10(value) - 18.0) * dist_mult))
    credits = max(PRICE_FLOOR, credits)
    return value, credits, dict(compositionUsdPerKg=usd_per_kg, habitableMult=hab_mult,
                                rarityMult=rarity, distanceMult=rnd(dist_mult))


def sound(cls: str, t, mass_earth, override=None) -> dict:
    """override = (molar_mass or None, density, layer) from solar_system.py."""
    if override is not None:
        molar, density, layer = override
    else:
        airless = cls in ("rocky", "iron") and mass_earth is not None and mass_earth < AIRLESS_MASS
        if airless or cls == "moon":
            molar, density, layer = None, 0.0, "silence"
        else:
            tt = t if t is not None else DEFAULT_TEMP.get(cls, 300.0)
            if cls in ("rocky", "iron"):
                molar = 0.044 if tt >= 400 else 0.029
                density = 10.0 if tt >= 400 else 1.0
            elif cls == "water":
                molar, density = 0.029, ATMO_DENSITY["water"]
            else:
                molar, density = GAS_MOLAR[cls], ATMO_DENSITY[cls]
            layer = LAYER[cls]
            if cls in ("rocky", "iron", "water") and tt < 150:
                layer = "ice"
    if molar is None:
        return dict(speedOfSound=0, pitchRatio=1, density=0, layer="silence")
    tt = t if t is not None else DEFAULT_TEMP.get(cls, 300.0)
    v = math.sqrt(GAMMA * R_GAS * tt / molar)
    ratio = min(4.0, max(0.25, v / V_EARTH))
    return dict(speedOfSound=rnd(v), pitchRatio=rnd(ratio), density=rnd(density), layer=layer)


# ---------------------------------------------------------------------------
def fetch_csv(refresh: bool) -> str:
    os.makedirs(RAW_DIR, exist_ok=True)
    if os.path.exists(RAW_CSV) and not refresh and os.path.getsize(RAW_CSV) > 100_000:
        print(f"using cached {RAW_CSV}")
        return RAW_CSV
    print("downloading pscomppars from the NASA Exoplanet Archive TAP endpoint ...")
    params = {"query": TAP_QUERY, "format": "csv"}
    try:
        import requests  # type: ignore
        r = requests.get(TAP_URL, params=params, timeout=300)
        r.raise_for_status()
        text = r.text
    except ImportError:
        from urllib.parse import urlencode
        from urllib.request import urlopen
        with urlopen(f"{TAP_URL}?{urlencode(params)}", timeout=300) as resp:
            text = resp.read().decode("utf-8")
    if not text.startswith("pl_name"):
        raise SystemExit(f"unexpected TAP response: {text[:200]!r}")
    with open(RAW_CSV, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"saved {RAW_CSV} ({len(text):,} bytes)")
    return RAW_CSV


def load_archive(path: str) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def exoplanet_rows(raw: list[dict]) -> tuple[list[dict], Counter]:
    drops = Counter()
    rows = []
    for r in raw:
        name = r["pl_name"].strip()
        d_pc = fnum(r["sy_dist"])
        ra, dec = fnum(r["ra"]), fnum(r["dec"])
        if d_pc is None or d_pc <= 0 or ra is None or dec is None:
            drops["no distance"] += 1
            continue
        m, rad = fnum(r["pl_bmasse"]), fnum(r["pl_rade"])
        if m is None and rad is None:
            drops["no mass and no radius"] += 1
            continue
        if (m is not None and m <= 0) or (rad is not None and rad <= 0):
            drops["non-positive mass or radius"] += 1
            continue
        est: list[str] = []
        if m is None:
            m = mass_from_radius(rad)
            est.append("massEarth")
        if rad is None:
            rad = radius_from_mass(m)
            est.append("radiusEarth")
        if est:
            est.append("gravityG")
        t = fnum(r["pl_eqt"])
        dens = fnum(r["pl_dens"])
        if dens is None:
            dens = EARTH_DENSITY * m / rad ** 3
        d_ly = d_pc * PC_TO_LY
        ra_r, dec_r = math.radians(ra), math.radians(dec)
        x = d_ly * math.cos(dec_r) * math.cos(ra_r)
        y = d_ly * math.cos(dec_r) * math.sin(ra_r)
        z = d_ly * math.sin(dec_r)
        cls = classify(name, m, rad, t, dens)
        year = fnum(r["disc_year"])
        rows.append(dict(
            id=slug(name), name=name, system=r["hostname"].strip(), x=x, y=y, z=z, distanceLy=d_ly,
            cls=cls, massEarth=m, radiusEarth=rad, tempK=t, orbitalPeriodDays=fnum(r["pl_orbper"]),
            discoveryYear=int(year) if year is not None else None, estimated=est,
            usd_per_kg=USD_PER_KG[cls], auctionOnly=False,
            habitableZone=habitable(cls, rad, m, t), sound_override=None, solar=False,
            archive_name=name, stTeff=fnum(r["st_teff"]),
        ))
    return rows, drops


def record_holders(rows: list[dict]) -> dict[str, list[str]]:
    """3x rarity records over the exoplanet set: hottest (max pl_eqt), closest
    (min distance), oldest (earliest discovery year). Ties all qualify."""
    exo = [r for r in rows if not r["solar"]]
    recs: dict[str, list[str]] = {}
    hot = max(r["tempK"] for r in exo if r["tempK"] is not None)
    recs["hottest"] = [r["id"] for r in exo if r["tempK"] == hot]
    near = min(r["distanceLy"] for r in exo)
    recs["closest"] = [r["id"] for r in exo if r["distanceLy"] == near]
    old = min(r["discoveryYear"] for r in exo if r["discoveryYear"] is not None)
    recs["oldest"] = [r["id"] for r in exo if r["discoveryYear"] == old]
    return recs


def finish(row: dict, rare_ids: set[str]) -> dict:
    m, rad = row["massEarth"], row["radiusEarth"]
    g = m / rad ** 2
    rare = row["id"] in rare_ids or (row["archive_name"] in FAMOUS_RARITY) or (row["id"] in FAMOUS_RARITY)
    value, credits, breakdown = price(m, row["usd_per_kg"], row["habitableZone"], rare, row["solar"], row["distanceLy"])
    obj = dict(
        id=row["id"], name=row["name"], system=row["system"],
        x=rnd(row["x"]), y=rnd(row["y"]), z=rnd(row["z"]), distanceLy=rnd(row["distanceLy"]),
        cls=row["cls"], massEarth=rnd(m), radiusEarth=rnd(rad), tempK=rnd(row["tempK"]),
        orbitalPeriodDays=rnd(row["orbitalPeriodDays"]), gravityG=rnd(g),
        discoveryYear=row["discoveryYear"], estimated=list(row["estimated"]),
        valueUsd=float(f"{value:.4g}"), priceCredits=credits, priceBreakdown=breakdown,
        sound=sound(row["cls"], row["tempK"], m, row["sound_override"]),
        fact="", factVerified=False, blurb="",
        auctionOnly=bool(row["auctionOnly"]), habitableZone=bool(row["habitableZone"]),
    )
    ctx = dict(obj, stTeff=row.get("stTeff"))
    obj["fact"], obj["factVerified"] = fact_for(ctx, row["archive_name"])
    obj["blurb"] = blurb_for(obj)
    return obj


def histogram(prices: list[int]) -> list[str]:
    edges = [0, 200, 400, 600, 800, 1000, 1200, 1500, 2000, 3000, 10 ** 9]
    lines = []
    n = len(prices)
    for lo, hi in zip(edges, edges[1:]):
        c = sum(1 for p in prices if lo <= p < hi)
        label = f"{lo:>5}-{hi - 1:<5}" if hi < 10 ** 9 else f"{lo:>5}+     "
        lines.append(f"{label} {c:>5} {100 * c / n:5.1f}% {'#' * int(60 * c / n)}")
    return lines


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="re-download the archive CSV")
    ap.add_argument("--skip-stars", action="store_true", help="do not rebuild stars.json")
    ap.add_argument("--max-bytes", type=int, default=MAX_BYTES,
                    help="objects.json size budget in bytes; 0 = keep every object (default 4,000,000)")
    args = ap.parse_args()

    raw = load_archive(fetch_csv(args.refresh))
    print(f"archive rows: {len(raw):,}")
    rows, drops = exoplanet_rows(raw)
    for k, v in drops.items():
        print(f"dropped {v:>4} rows: {k}")
    # Solar System first, then by distance so nearby systems lead the file.
    rows = solar_system_rows() + rows
    rows.sort(key=lambda r: (not r["solar"], r["distanceLy"], r["name"]))
    ids = [r["id"] for r in rows]
    dup = [i for i, c in Counter(ids).items() if c > 1]
    if dup:
        raise SystemExit(f"duplicate ids: {dup[:10]}")

    def build_all(rs):
        recs = record_holders(rs)
        rare = {i for ids in recs.values() for i in ids}
        objs = [finish(r, rare) for r in rs]
        enc = [json.dumps(o, separators=(",", ":"), ensure_ascii=False) for o in objs]
        return recs, objs, enc

    # Size budget: rows are ordered Solar System first, then nearest first, so
    # trimming from the end drops the farthest exoplanets (mostly microlensing
    # detections thousands of light years away with few measured values).
    # Records (hottest, closest, oldest) are recomputed over the kept set so the
    # 3x rarity always lands on an object that is in the file. --max-bytes 0
    # keeps everything.
    recs, objects, encoded = build_all(rows)
    total_all = sum(len(e.encode("utf-8")) + 1 for e in encoded) + 2
    if args.max_bytes and total_all > args.max_bytes:
        for _ in range(4):  # re-pricing can move the size by a few bytes; converge
            keep, running = 0, 2
            for e in encoded:
                n = len(e.encode("utf-8")) + 1
                if running + n > args.max_bytes:
                    break
                running += n
                keep += 1
            if keep == len(rows):
                break
            cut_at = rows[keep]["distanceLy"]
            rows = rows[:keep]
            recs, objects, encoded = build_all(rows)
        print(f"size budget {args.max_bytes / 1e6:.2f} MB: keeping the {len(rows):,} nearest objects "
              f"(dropping everything beyond {cut_at:,.0f} ly; the full catalog would be "
              f"{total_all / 1e6:.2f} MB, use --max-bytes 0 to keep all)")
    for k, ids in recs.items():
        print(f"record {k}: {', '.join(ids)}")

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        f.write("[" + ",".join(encoded) + "]\n")
    size = os.path.getsize(OUT_JSON)
    print(f"wrote {OUT_JSON}: {len(objects):,} objects, {size / 1e6:.2f} MB")

    classes = Counter(o["cls"] for o in objects)
    print("class counts:")
    for k, v in sorted(classes.items(), key=lambda kv: -kv[1]):
        print(f"  {k:<12} {v:>5}")
    exo_prices = [o["priceCredits"] for o in objects if o["system"] != "Sol"]
    print("price histogram (exoplanets, credits):")
    for line in histogram(exo_prices):
        print("  " + line)
    in_band = sum(1 for p in exo_prices if 400 <= p <= 1500)
    print(f"  400-1500: {100 * in_band / len(exo_prices):.1f}%  median {sorted(exo_prices)[len(exo_prices) // 2]}")
    print(f"estimated: mass {sum('massEarth' in o['estimated'] for o in objects)}, radius {sum('radiusEarth' in o['estimated'] for o in objects)}")
    print(f"verified facts: {sum(o['factVerified'] for o in objects)}, habitable zone: {sum(o['habitableZone'] for o in objects)}")

    if not args.skip_stars:
        from stars import build_stars
        build_stars()
    return 0


if __name__ == "__main__":
    sys.exit(main())
