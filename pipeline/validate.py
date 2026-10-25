#!/usr/bin/env python3
"""Strict validator for client/public/data/objects.json against CelestialObject.

    python3 pipeline/validate.py            # exit 0 on success, 1 on any violation

Checks every object: exact key set, every type, finite numbers, enums, unique ids,
slug-shaped ids, `estimated` only lists real field names, priceCredits is an int
>= 50, pitchRatio in [0.25, 4], distanceLy matches the position, no em or en
dashes in copy, facts and blurbs at most two sentences, the 8 placeholder ids
exist, at least 5,000 objects, file under 4 MB. Prints class counts and a price
histogram. Also checks stars.json if present.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OBJECTS = os.path.join(ROOT, "client", "public", "data", "objects.json")
STARS = os.path.join(ROOT, "client", "public", "data", "stars.json")

CLASSES = {"rocky", "iron", "water", "sub_neptune", "ice_giant", "gas_giant", "hot_jupiter",
           "lava", "carbon", "star", "moon"}
LAYERS = {"wind", "lava", "storm", "ice", "silence"}
NUMERIC_FIELDS = {"massEarth", "radiusEarth", "tempK", "orbitalPeriodDays", "gravityG",
                  "discoveryYear", "x", "y", "z", "distanceLy", "valueUsd", "priceCredits"}
KEYS = {
    "id": str, "name": str, "system": str, "x": float, "y": float, "z": float,
    "distanceLy": float, "cls": str, "massEarth": (float, None), "radiusEarth": (float, None),
    "tempK": (float, None), "orbitalPeriodDays": (float, None), "gravityG": (float, None),
    "discoveryYear": (int, None), "estimated": list, "valueUsd": float, "priceCredits": int,
    "priceBreakdown": dict, "sound": dict, "fact": str, "factVerified": bool, "blurb": str,
    "auctionOnly": bool, "habitableZone": bool,
}
BREAKDOWN_KEYS = {"compositionUsdPerKg", "habitableMult", "rarityMult", "distanceMult"}
SOUND_KEYS = {"speedOfSound", "pitchRatio", "density", "layer"}
PLACEHOLDER_IDS = ["earth", "moon", "mars", "jupiter", "proxima-cen-b", "trappist-1-e", "wasp-76-b", "kelt-9-b"]
SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
BAD_DASHES = "—–"
MIN_OBJECTS = 5000
MAX_BYTES = 5_000_000  # lead decision: ship the full catalog (6,000+), gzip makes this ~620 KB on the wire


def is_num(v, allow_int=True):
    if isinstance(v, bool):
        return False
    if isinstance(v, int) and allow_int:
        return True
    return isinstance(v, float) and math.isfinite(v)


def sentences(s: str) -> int:
    # Count sentence terminators; "1.5" style decimals do not end sentences.
    return len(re.findall(r"[.!?](?=\s|$)", s))


def check_object(o, errors: list[str]):
    pid = o.get("id", "<no id>")

    def err(msg):
        errors.append(f"{pid}: {msg}")

    if not isinstance(o, dict):
        err("not an object")
        return
    keys = set(o.keys())
    if keys != set(KEYS):
        err(f"key set mismatch: missing {sorted(set(KEYS) - keys)}, extra {sorted(keys - set(KEYS))}")
    for k, spec in KEYS.items():
        if k not in o:
            continue
        v = o[k]
        if isinstance(spec, tuple):
            typ, _ = spec
            if v is None:
                continue
            if typ is int:
                if not (isinstance(v, int) and not isinstance(v, bool)):
                    err(f"{k} must be int or null, got {v!r}")
            elif not is_num(v):
                err(f"{k} must be a finite number or null, got {v!r}")
        elif spec is float:
            if not is_num(v):
                err(f"{k} must be a finite number, got {v!r}")
        elif spec is int:
            if not (isinstance(v, int) and not isinstance(v, bool)):
                err(f"{k} must be int, got {v!r}")
        elif spec is bool:
            if not isinstance(v, bool):
                err(f"{k} must be bool, got {v!r}")
        elif spec is str:
            if not isinstance(v, str):
                err(f"{k} must be str, got {v!r}")
        elif spec is list:
            if not isinstance(v, list):
                err(f"{k} must be list")
        elif spec is dict:
            if not isinstance(v, dict):
                err(f"{k} must be object")

    if isinstance(o.get("id"), str) and not SLUG_RE.match(o["id"]):
        err("id is not a slug")
    if not o.get("name"):
        err("empty name")
    if not o.get("system"):
        err("empty system")
    if o.get("cls") not in CLASSES:
        err(f"bad cls {o.get('cls')!r}")
    if isinstance(o.get("estimated"), list):
        for e in o["estimated"]:
            if e not in NUMERIC_FIELDS:
                err(f"estimated lists unknown field {e!r}")
        if len(set(o["estimated"])) != len(o["estimated"]):
            err("estimated has duplicates")
    p = o.get("priceCredits")
    if isinstance(p, int) and not isinstance(p, bool) and p < 50:
        err(f"priceCredits {p} below 50")
    if is_num(o.get("valueUsd")) and o["valueUsd"] <= 0:
        err("valueUsd must be positive")
    bd = o.get("priceBreakdown")
    if isinstance(bd, dict):
        if set(bd) != BREAKDOWN_KEYS:
            err(f"priceBreakdown keys {sorted(bd)}")
        for k, v in bd.items():
            if not is_num(v) or v <= 0:
                err(f"priceBreakdown.{k} must be a positive number")
    sd = o.get("sound")
    if isinstance(sd, dict):
        if set(sd) != SOUND_KEYS:
            err(f"sound keys {sorted(sd)}")
        if sd.get("layer") not in LAYERS:
            err(f"bad sound.layer {sd.get('layer')!r}")
        for k in ("speedOfSound", "pitchRatio", "density"):
            if not is_num(sd.get(k)) or sd[k] < 0:
                err(f"sound.{k} must be a non-negative finite number")
        if is_num(sd.get("pitchRatio")) and not (0.25 <= sd["pitchRatio"] <= 4.0):
            err(f"pitchRatio {sd['pitchRatio']} outside [0.25, 4]")
        if sd.get("layer") == "silence" and is_num(sd.get("speedOfSound")) and sd["speedOfSound"] != 0:
            err("silence layer must have speedOfSound 0")
    for k in ("name", "system", "fact", "blurb"):
        v = o.get(k)
        if isinstance(v, str) and any(c in v for c in BAD_DASHES):
            err(f"{k} contains an em or en dash")
    for k in ("fact", "blurb"):
        v = o.get(k)
        if isinstance(v, str):
            if not v.strip():
                err(f"{k} is empty")
            elif sentences(v) > 2:
                err(f"{k} has more than two sentences: {v!r}")
    if all(is_num(o.get(k)) for k in ("x", "y", "z", "distanceLy")):
        norm = math.sqrt(o["x"] ** 2 + o["y"] ** 2 + o["z"] ** 2)
        if o["system"] == "Sol":
            if o["distanceLy"] != 0 or norm > 0.05:
                err("Solar System objects must have distanceLy 0 and a tiny schematic offset")
        elif abs(norm - o["distanceLy"]) > 0.002 + 0.01 * o["distanceLy"]:
            err(f"position norm {norm:.3f} does not match distanceLy {o['distanceLy']}")
    if o.get("habitableZone") is True and bd and is_num(bd.get("habitableMult")) and bd["habitableMult"] != 5:
        err("habitableZone true but habitableMult is not 5")
    if is_num(o.get("massEarth")) and is_num(o.get("radiusEarth")) and is_num(o.get("gravityG")):
        g = o["massEarth"] / o["radiusEarth"] ** 2
        if abs(g - o["gravityG"]) > 0.02 + 0.05 * g:
            err(f"gravityG {o['gravityG']} inconsistent with mass/radius ({g:.3f})")


def histogram(prices):
    edges = [0, 200, 400, 600, 800, 1000, 1200, 1500, 2000, 3000, 10 ** 9]
    n = max(1, len(prices))
    out = []
    for lo, hi in zip(edges, edges[1:]):
        c = sum(1 for p in prices if lo <= p < hi)
        label = f"{lo:>5}-{hi - 1:<5}" if hi < 10 ** 9 else f"{lo:>5}+     "
        out.append(f"{label} {c:>5} {100 * c / n:5.1f}% {'#' * int(60 * c / n)}")
    return out


def main() -> int:
    errors: list[str] = []
    if not os.path.exists(OBJECTS):
        print(f"missing {OBJECTS}")
        return 1
    size = os.path.getsize(OBJECTS)
    with open(OBJECTS, encoding="utf-8") as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"invalid JSON: {e}")
            return 1
    if not isinstance(data, list):
        print("top level must be an array")
        return 1
    for o in data:
        check_object(o, errors)
    ids = [o.get("id") for o in data if isinstance(o, dict)]
    dups = [i for i, c in Counter(ids).items() if c > 1]
    if dups:
        errors.append(f"duplicate ids: {dups[:10]}")
    for pid in PLACEHOLDER_IDS:
        if pid not in ids:
            errors.append(f"placeholder id missing: {pid}")
    if len(data) < MIN_OBJECTS:
        errors.append(f"only {len(data)} objects, need at least {MIN_OBJECTS}")
    if size > MAX_BYTES:
        errors.append(f"objects.json is {size / 1e6:.2f} MB, limit 5 MB")

    if os.path.exists(STARS):
        with open(STARS, encoding="utf-8") as f:
            stars = json.load(f)
        if not isinstance(stars, list) or not stars:
            errors.append("stars.json must be a non-empty array")
        else:
            for i, s in enumerate(stars):
                if not (isinstance(s, list) and len(s) == 4 and all(is_num(v) for v in s)):
                    errors.append(f"stars.json[{i}] must be [x, y, z, mag]")
                    break
        print(f"stars.json: {len(stars):,} stars, {os.path.getsize(STARS) / 1e3:.0f} KB")
    else:
        print("stars.json: missing (not fatal)")

    classes = Counter(o.get("cls") for o in data if isinstance(o, dict))
    print(f"objects.json: {len(data):,} objects, {size / 1e6:.2f} MB")
    print("class counts:")
    for k, v in sorted(classes.items(), key=lambda kv: -kv[1]):
        print(f"  {k:<12} {v:>5}")
    prices = [o["priceCredits"] for o in data if isinstance(o, dict) and isinstance(o.get("priceCredits"), int)]
    print("price histogram (credits, all objects):")
    for line in histogram(prices):
        print("  " + line)
    verified = [o["name"] for o in data if isinstance(o, dict) and o.get("factVerified") is True]
    print(f"verified facts ({len(verified)}): {', '.join(verified)}")

    if errors:
        print(f"\nFAILED with {len(errors)} violation(s):")
        for e in errors[:50]:
            print("  " + e)
        if len(errors) > 50:
            print(f"  ... and {len(errors) - 50} more")
        return 1
    print("\nOK: objects.json is valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
