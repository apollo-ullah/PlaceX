"""Hand-built Solar System objects with published values.

Sources: NASA Planetary Fact Sheets (nssdc.gsfc.nasa.gov/planetary/factsheet),
NASA Solar System Exploration pages for the moons, IAU nominal solar values.

Values:
  massEarth    mass / 5.972e24 kg
  radiusEarth  mean radius / 6371 km
  tempK        mean surface temperature for solid bodies; effective (black-body)
               temperature for the Sun and the giant planets, because they have
               no surface. Same convention as the archive's equilibrium temps.
  orbitalPeriodDays  sidereal orbital period around the Sun (or parent for moons)

Positions: the contract puts Earth at the origin and all exoplanets at true
positions in light years. The whole Solar System is about 0.001 ly across, which
would stack 14 objects on one pixel. So Solar System bodies get SCHEMATIC offsets:
the Sun sits 0.005 ly from Earth along -x, and each planet is placed around the
Sun at radius 0.005 * sqrt(a_AU) light years (sqrt-compressed, Earth lands at the
origin by construction) at a spread of angles, with a small z lift. Moons sit
0.0012 ly from their parent. These offsets are layout only and are NOT distances;
`distanceLy` is 0 for every Solar System object and `system` is "Sol".

Composition price per kg follows the PRD table by what the body is made of,
not by its PlanetClass ("moon" and "star" are not in the PRD table).
"""
from __future__ import annotations

import math

AU_LY = 1.5813e-5  # one astronomical unit in light years (documentation only)
SUN_OFFSET = (-0.005, 0.0, 0.0)
ORBIT_SCALE = 0.005  # ly per sqrt(AU)
MOON_OFFSET = 0.0012


def _orbit_pos(a_au: float, angle_deg: float, z: float = 0.0) -> tuple[float, float, float]:
    r = ORBIT_SCALE * math.sqrt(a_au)
    th = math.radians(angle_deg)
    return (SUN_OFFSET[0] + r * math.cos(th), SUN_OFFSET[1] + r * math.sin(th), SUN_OFFSET[2] + z)


# id, name, cls, massEarth, radiusEarth, tempK, orbitalPeriodDays, semi-major axis AU,
# layout angle (deg), composition $/kg, auctionOnly, habitableZone,
# sound: (gas molar mass kg/mol or None for airless, relative density, layer)
BODIES = [
    dict(id="sun", name="Sun", cls="star", massEarth=332946.0, radiusEarth=109.2, tempK=5772.0,
         orbitalPeriodDays=None, a_au=None, angle=None, usd_per_kg=0.05, auctionOnly=False,
         habitableZone=False, sound=(0.0023, 0.0002, "storm")),
    dict(id="mercury", name="Mercury", cls="iron", massEarth=0.0553, radiusEarth=0.3829, tempK=440.0,
         orbitalPeriodDays=87.969, a_au=0.387, angle=200.0, usd_per_kg=0.5, auctionOnly=False,
         habitableZone=False, sound=(None, 0.0, "silence")),
    dict(id="venus", name="Venus", cls="rocky", massEarth=0.815, radiusEarth=0.9499, tempK=737.0,
         orbitalPeriodDays=224.701, a_au=0.723, angle=300.0, usd_per_kg=0.2, auctionOnly=False,
         habitableZone=False, sound=(0.044, 54.0, "wind")),
    dict(id="earth", name="Earth", cls="rocky", massEarth=1.0, radiusEarth=1.0, tempK=288.0,
         orbitalPeriodDays=365.256, a_au=1.0, angle=0.0, usd_per_kg=0.2, auctionOnly=True,
         habitableZone=True, sound=(0.029, 1.0, "wind")),
    dict(id="moon", name="Moon", cls="moon", massEarth=0.0123, radiusEarth=0.2727, tempK=250.0,
         orbitalPeriodDays=27.322, parent="earth", moon_dir=(0.0, 1.0, 0.3), usd_per_kg=0.2,
         auctionOnly=True, habitableZone=False, sound=(None, 0.0, "silence")),
    dict(id="mars", name="Mars", cls="rocky", massEarth=0.107, radiusEarth=0.532, tempK=210.0,
         orbitalPeriodDays=686.98, a_au=1.524, angle=40.0, usd_per_kg=0.2, auctionOnly=True,
         habitableZone=False, sound=(0.044, 0.01, "wind")),
    dict(id="jupiter", name="Jupiter", cls="gas_giant", massEarth=317.8, radiusEarth=11.21, tempK=124.0,
         orbitalPeriodDays=4332.59, a_au=5.203, angle=110.0, usd_per_kg=0.05, auctionOnly=False,
         habitableZone=False, sound=(0.0023, 30.0, "storm")),
    dict(id="io", name="Io", cls="moon", massEarth=0.01495, radiusEarth=0.2859, tempK=110.0,
         orbitalPeriodDays=1.769, parent="jupiter", moon_dir=(1.0, 0.0, 0.4), usd_per_kg=0.2,
         auctionOnly=False, habitableZone=False, sound=(None, 0.0, "silence")),
    dict(id="europa", name="Europa", cls="moon", massEarth=0.008035, radiusEarth=0.245, tempK=102.0,
         orbitalPeriodDays=3.551, parent="jupiter", moon_dir=(-0.3, 1.0, -0.4), usd_per_kg=1.0,
         auctionOnly=False, habitableZone=False, sound=(None, 0.0, "silence")),
    dict(id="saturn", name="Saturn", cls="gas_giant", massEarth=95.16, radiusEarth=9.449, tempK=95.0,
         orbitalPeriodDays=10759.22, a_au=9.537, angle=160.0, usd_per_kg=0.05, auctionOnly=False,
         habitableZone=False, sound=(0.0023, 20.0, "storm")),
    dict(id="titan", name="Titan", cls="moon", massEarth=0.0225, radiusEarth=0.4041, tempK=94.0,
         orbitalPeriodDays=15.945, parent="saturn", moon_dir=(0.0, -1.0, 0.5), usd_per_kg=0.3,
         auctionOnly=False, habitableZone=False, sound=(0.028, 4.4, "ice")),
    dict(id="uranus", name="Uranus", cls="ice_giant", massEarth=14.54, radiusEarth=4.007, tempK=59.0,
         orbitalPeriodDays=30688.5, a_au=19.19, angle=230.0, usd_per_kg=0.3, auctionOnly=False,
         habitableZone=False, sound=(0.0026, 10.0, "ice")),
    dict(id="neptune", name="Neptune", cls="ice_giant", massEarth=17.15, radiusEarth=3.883, tempK=59.0,
         orbitalPeriodDays=60182.0, a_au=30.07, angle=270.0, usd_per_kg=0.3, auctionOnly=False,
         habitableZone=False, sound=(0.0026, 10.0, "ice")),
    dict(id="pluto", name="Pluto", cls="rocky", massEarth=0.00218, radiusEarth=0.1868, tempK=44.0,
         orbitalPeriodDays=90560.0, a_au=39.48, angle=330.0, usd_per_kg=0.3, auctionOnly=False,
         habitableZone=False, sound=(None, 0.0, "silence")),
]

Z_LIFT = {"mercury": 0.0005, "venus": -0.0004, "mars": 0.0006, "jupiter": -0.0008, "saturn": 0.0009,
          "uranus": -0.001, "neptune": 0.0012, "pluto": 0.0018}


def positions() -> dict[str, tuple[float, float, float]]:
    pos: dict[str, tuple[float, float, float]] = {"sun": SUN_OFFSET}
    for b in BODIES:
        if b.get("a_au") is not None:
            pos[b["id"]] = _orbit_pos(b["a_au"], b["angle"], Z_LIFT.get(b["id"], 0.0))
    for b in BODIES:
        if "parent" in b:
            px, py, pz = pos[b["parent"]]
            dx, dy, dz = b["moon_dir"]
            n = math.sqrt(dx * dx + dy * dy + dz * dz)
            pos[b["id"]] = (px + MOON_OFFSET * dx / n, py + MOON_OFFSET * dy / n, pz + MOON_OFFSET * dz / n)
    # Earth is the origin by construction (Sun at -0.005, Earth at radius 0.005, angle 0).
    pos["earth"] = (0.0, 0.0, 0.0)
    return pos


def solar_system_rows() -> list[dict]:
    """Return raw rows (not yet priced) for build.py to finish."""
    pos = positions()
    rows = []
    for b in BODIES:
        x, y, z = pos[b["id"]]
        rows.append(dict(
            id=b["id"], name=b["name"], system="Sol", x=x, y=y, z=z, distanceLy=0.0,
            cls=b["cls"], massEarth=b["massEarth"], radiusEarth=b["radiusEarth"], tempK=b["tempK"],
            orbitalPeriodDays=b["orbitalPeriodDays"], discoveryYear=None, estimated=[],
            usd_per_kg=b["usd_per_kg"], auctionOnly=b["auctionOnly"], habitableZone=b["habitableZone"],
            sound_override=b["sound"], solar=True, archive_name=None,
        ))
    return rows
