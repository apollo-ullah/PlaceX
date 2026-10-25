#!/usr/bin/env python3
"""Background star field: the 5,000 brightest HYG stars as [x, y, z, mag] in light years.

Source: HYG Database v4.0 by David Nash (astronexus), CC BY-SA 4.0.
  https://github.com/astronexus/HYG-Database  (file hyg/CURRENT/hygdata_v40.csv.gz)
HYG x, y, z are in parsecs in the equatorial frame (x toward RA 0h Dec 0,
z toward the north celestial pole), the same frame objects.json uses, so we only
scale by 3.26156. Sol (id 0) and stars with unknown distance (dist 100000, a
sentinel) are excluded. Sorted by apparent magnitude ascending (brightest first).

Fallback: if the download fails, stars.json is built from the exoplanet host
stars in objects.json (clearly labeled on the console and in HANDOFF.md).
"""
from __future__ import annotations

import csv
import gzip
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW_GZ = os.path.join(HERE, "raw", "hygdata_v40.csv.gz")
OUT = os.path.join(ROOT, "client", "public", "data", "stars.json")
HYG_URL = "https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v40.csv.gz"
PC_TO_LY = 3.26156
N_STARS = 5000
UNKNOWN_DIST = 100000.0


def fetch() -> bool:
    if os.path.exists(RAW_GZ) and os.path.getsize(RAW_GZ) > 1_000_000:
        return True
    os.makedirs(os.path.dirname(RAW_GZ), exist_ok=True)
    try:
        import requests  # type: ignore
        r = requests.get(HYG_URL, timeout=300)
        r.raise_for_status()
        data = r.content
    except Exception as e:  # noqa: BLE001
        print(f"HYG download failed: {e}")
        return False
    if len(data) < 1_000_000:
        print(f"HYG download too small ({len(data)} bytes), treating as failure")
        return False
    with open(RAW_GZ, "wb") as f:
        f.write(data)
    return True


def from_hyg() -> list[list[float]]:
    with gzip.open(RAW_GZ, "rb") as f:
        text = io.TextIOWrapper(f, encoding="utf-8")
        rows = []
        for r in csv.DictReader(text):
            try:
                mag = float(r["mag"])
                dist = float(r["dist"])
            except (ValueError, KeyError):
                continue
            if r["id"] == "0" or dist <= 0 or dist >= UNKNOWN_DIST:
                continue
            rows.append((mag, float(r["x"]), float(r["y"]), float(r["z"])))
    rows.sort(key=lambda t: t[0])
    return [[round(x * PC_TO_LY, 2), round(y * PC_TO_LY, 2), round(z * PC_TO_LY, 2), round(mag, 2)]
            for mag, x, y, z in rows[:N_STARS]]


def from_hosts() -> list[list[float]]:
    with open(os.path.join(ROOT, "client", "public", "data", "objects.json"), encoding="utf-8") as f:
        objs = json.load(f)
    seen = {}
    for o in objs:
        if o["system"] != "Sol" and o["system"] not in seen:
            seen[o["system"]] = [o["x"], o["y"], o["z"], 6.0]
    return list(seen.values())[:N_STARS]


def build_stars() -> str:
    if fetch():
        stars = from_hyg()
        source = "HYG v4.0"
    else:
        stars = from_hosts()
        source = "FALLBACK: exoplanet host stars (HYG download failed)"
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(stars, f, separators=(",", ":"))
        f.write("\n")
    print(f"wrote {OUT}: {len(stars):,} stars from {source}, {os.path.getsize(OUT) / 1e3:.0f} KB")
    return source


if __name__ == "__main__":
    sys.exit(0 if build_stars() else 1)
