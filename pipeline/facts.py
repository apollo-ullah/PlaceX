"""Facts and realtor blurbs for PlaceX listings.

Two kinds of facts:
  * VERIFIED: hand-written for famous objects, checked against published sources
    (NASA fact sheets, the discovery papers listed inline). `factVerified: true`.
  * TEMPLATED: built only from the object's own real archive values (period,
    temperature, gravity, distance, host star temperature, discovery year).
    `factVerified: false`. Fields listed in `estimated` are never used in a fact.

Blurbs are realtor copy per PlanetClass with several variants, picked
deterministically from the object id so output is stable between runs.

Rules: two sentences max, no em dashes or en dashes anywhere, no invented numbers.
"""
from __future__ import annotations

import zlib

SUN_TEFF_K = 5772

# ---------------------------------------------------------------------------
# Verified facts. Keys are the exact archive pl_name (or our Solar System id).
# ---------------------------------------------------------------------------
VERIFIED_FACTS: dict[str, str] = {
    # Gaudi et al. 2017, Nature 546, 514: dayside ~4,600 K, host star 10,170 K.
    "KELT-9 b": "KELT-9 b has a dayside near 4,600 K, hotter than many stars, and its star is tearing its atmosphere apart. Molecules cannot survive on the day side.",
    # Ehrenreich et al. 2020, Nature 580, 597: iron condensation on the night side.
    "WASP-76 b": "WASP-76 b is thought to rain liquid iron. Its day side is hot enough to vaporize iron, which condenses as it crosses to the cooler night side.",
    # Evans et al. 2013 (deep blue albedo), Knutson et al. 2007 and Louden & Wheatley 2015 (winds).
    "HD 189733 b": "HD 189733 b is a deep blue world with winds measured at thousands of kilometers per hour. Its color may come from sideways rain of silicate glass.",
    # Madhusudhan, Lee & Mousis 2012, ApJL 759, L40: carbon-rich interior proposal.
    "55 Cnc e": "55 Cnc e was proposed in 2012 as a carbon-rich world whose interior could be largely diamond. Its year lasts about 18 hours.",
    # Charbonneau et al. 2009 (discovery), Kempton et al. 2023 Nature (JWST hazy atmosphere).
    "GJ 1214 b": "GJ 1214 b is a long-standing water-world candidate. JWST found it wrapped in a thick, highly reflective haze that hides whatever lies below.",
    # Gillon et al. 2017, Nature 542, 456; Greene et al. 2023 Nature (JWST dayside of b).
    "TRAPPIST-1 b": "TRAPPIST-1 b is the innermost of seven Earth-sized worlds around an ultracool dwarf. JWST measured a dayside near 500 K with little or no atmosphere.",
    # Zieba et al. 2023 Nature: no thick CO2 atmosphere on c.
    "TRAPPIST-1 c": "TRAPPIST-1 c is one of seven Earth-sized planets packed closer to their star than Mercury is to the Sun. JWST found no thick carbon dioxide atmosphere.",
    "TRAPPIST-1 d": "TRAPPIST-1 d is the smallest of the seven TRAPPIST-1 planets, only a bit larger than Mars. The whole system would fit well inside Mercury's orbit.",
    "TRAPPIST-1 e": "TRAPPIST-1 has seven Earth-sized planets, and TRAPPIST-1 e is the one most often considered potentially habitable.",
    "TRAPPIST-1 f": "TRAPPIST-1 f sits in or near its star's habitable zone with a 9.2 day year. Its low density suggests a large share of water or other volatiles.",
    "TRAPPIST-1 g": "TRAPPIST-1 g is the largest of the seven TRAPPIST-1 planets and orbits every 12.4 days. The planets' orbits form a chain of near resonances.",
    "TRAPPIST-1 h": "TRAPPIST-1 h is the outermost of the seven TRAPPIST-1 worlds, with an 18.8 day year and an equilibrium temperature near 170 K.",
    # Anglada-Escude et al. 2016, Nature 536, 437.
    "Proxima Cen b": "Proxima Centauri b is the closest known exoplanet to Earth, orbiting the nearest star to the Sun every 11.2 days.",
    # Solar System (NASA planetary fact sheets and mission pages).
    "sun": "The Sun holds about 99.8 percent of the Solar System's mass. Its light takes 8 minutes and 20 seconds to reach Earth.",
    "mercury": "Mercury's surface swings from about 700 K in daylight to about 100 K at night. It completes a year in 88 days.",
    "venus": "Venus has the hottest surface of any planet, about 737 K under 92 atmospheres of carbon dioxide. Its day is longer than its year.",
    "earth": "Earth is the only known world with liquid water oceans on its surface and the only place known to host life.",
    "moon": "The Moon is slowly drifting away from Earth at about 3.8 centimeters per year.",
    "mars": "Mars hosts Olympus Mons, the tallest volcano in the Solar System at about 22 kilometers high.",
    "jupiter": "Jupiter's Great Red Spot is a storm larger than Earth that has raged for at least 190 years.",
    "saturn": "Saturn is less dense than water, so it would float in a large enough bathtub. Its rings are mostly water ice.",
    # Kraus et al. 2017 Nature Astronomy: diamond rain in lab conditions matching ice giant interiors.
    "uranus": "Uranus spins on its side with an axial tilt of about 98 degrees, and lab experiments suggest diamonds may rain inside it.",
    "neptune": "Neptune has the fastest winds measured in the Solar System, above 2,000 kilometers per hour, and diamond rain is thought to fall deep inside.",
    "pluto": "Pluto was discovered in 1930 and has a heart-shaped plain of nitrogen ice called Sputnik Planitia. One year there lasts 248 Earth years.",
    "europa": "Europa likely hides a global saltwater ocean beneath its ice shell, with more water than all of Earth's oceans combined.",
    "titan": "Titan is the only moon with a thick atmosphere and the only other world known to have liquid lakes and seas, made of methane and ethane.",
    "io": "Io is the most volcanically active body in the Solar System, with hundreds of volcanoes and lava fountains tens of kilometers high.",
}

# Objects that get a 3x rarity multiplier for being famous (plus the computed
# records: hottest, closest, earliest discovered). Earth is included as the only
# known inhabited world; the Sun as the only star.
FAMOUS_RARITY: set[str] = {
    "KELT-9 b", "WASP-76 b", "HD 189733 b", "55 Cnc e", "GJ 1214 b",
    "TRAPPIST-1 b", "TRAPPIST-1 c", "TRAPPIST-1 d", "TRAPPIST-1 e",
    "TRAPPIST-1 f", "TRAPPIST-1 g", "TRAPPIST-1 h", "Proxima Cen b",
    "earth", "sun",
}


def _pick(seed: str, options: list):
    return options[zlib.crc32(seed.encode("utf-8")) % len(options)]


def _fmt(x: float, nd: int = 0) -> str:
    return f"{x:,.{nd}f}"


def _temp_phrase(t: float) -> str:
    # Every threshold is a published melting or boiling point at 1 atm.
    if t >= 3000:
        return "hotter than the surface of many red dwarf stars"
    if t >= 1811:
        return "hot enough to melt iron"
    if t >= 1337:
        return "hot enough to melt gold"
    if t >= 933:
        return "hot enough to melt aluminum"
    if t >= 601:
        return "hot enough to melt lead"
    if t >= 373:
        return "hot enough to boil water"
    if t >= 273:
        return "a range where liquid water could exist"
    if t >= 195:
        return "below the freezing point of water"
    if t >= 112:
        return "cold enough to freeze carbon dioxide"
    if t >= 63:
        return "cold enough for methane to pool as a liquid"
    return "cold enough to freeze nitrogen solid"


def _period_phrase(p: float) -> str:
    if p < 1:
        return f"about {_fmt(p * 24, 1)} hours"
    if p < 2:
        return f"about {_fmt(p, 2)} Earth days"
    if p <= 400:
        return f"about {_fmt(p, 1)} Earth days"
    return f"about {_fmt(p / 365.25, 1)} Earth years"


def templated_fact(o: dict) -> str:
    """Build a short fact from the object's measured values only. `o` is the
    partially built CelestialObject dict (needs name, system, distanceLy, tempK,
    orbitalPeriodDays, gravityG, discoveryYear, estimated, and optional stTeff).
    Kept short on purpose: the catalog has 6,000+ objects and a 4 MB budget."""
    est = set(o.get("estimated", []))
    cands: list[str] = []

    p = o.get("orbitalPeriodDays")
    if p is not None and "orbitalPeriodDays" not in est:
        cands.append(f"A year here lasts {_period_phrase(p)}.")
        if p < 3:
            cands.append(f"One orbit takes {_period_phrase(p)}, so a birthday comes around almost daily.")

    t = o.get("tempK")
    if t is not None and "tempK" not in est:
        cands.append(f"Equilibrium temperature about {_fmt(t)} K, {_temp_phrase(t)}.")

    g = o.get("gravityG")
    if g is not None and "gravityG" not in est:
        if g >= 1.15:
            cands.append(f"Gravity is {_fmt(g, 1)} g, so you would weigh {_fmt(g, 1)} times your Earth weight.")
        elif g <= 0.85:
            cands.append(f"Gravity is {_fmt(g, 2)} g, about {_fmt(g * 100)} percent of what you feel on Earth.")
        else:
            cands.append(f"Gravity is {_fmt(g, 2)} g, close to what you feel on Earth.")

    d = o.get("distanceLy")
    if d is not None and d >= 1:
        yrs = int(round(d))
        seen = 2026 - yrs
        when = f"in {seen}" if seen > 0 else f"around {1 - seen} BC"
        cands.append(f"Its light takes {_fmt(yrs)} years to reach Earth, so you see it as it was {when}.")

    st = o.get("stTeff")
    if st is not None:
        rel = "hotter" if st > SUN_TEFF_K else "cooler"
        cands.append(f"Orbits a {_fmt(st)} K star, {rel} than the Sun at {_fmt(SUN_TEFF_K)} K.")

    y = o.get("discoveryYear")
    if y is not None:
        cands.append(f"Discovered in {y}, {_fmt(d or 0)} light years from Earth in the {o['system']} system.")

    if not cands:
        return f"Listed in the NASA Exoplanet Archive, {_fmt(d or 0)} light years from Earth."
    return _pick(o["id"] + ":fact", cands)


def fact_for(o: dict, archive_name: str | None) -> tuple[str, bool]:
    """Return (fact, verified). `archive_name` is the exact pl_name or Solar System id."""
    key = archive_name or o["id"]
    if key in VERIFIED_FACTS:
        return VERIFIED_FACTS[key], True
    if o["id"] in VERIFIED_FACTS:
        return VERIFIED_FACTS[o["id"]], True
    return templated_fact(o), False


# ---------------------------------------------------------------------------
# Realtor blurbs. {name}, {system}, {period}, {temp} are filled from real values.
# ---------------------------------------------------------------------------
BLURBS: dict[str, list[str]] = {
    "rocky": [
        "Solid ground, real horizons, a sky that is yours. Terraforming optional, bragging rights included.",
        "Classic rocky build with a year of {period}. Bring your own air and the neighbors will never bother you.",
        "Earth-adjacent charm without Earth-adjacent prices. Firm footing, honest gravity, zero HOA.",
        "A proper planet you can stand on. Views of {system} from every lot, sunrise frequency negotiable.",
    ],
    "iron": [
        "Heavy on the metal, light on the drama. The strongbox of the {system} system.",
        "Iron-rich core, iron-rich value. Built to outlast your mortgage and most stars.",
        "Dense, compact and seriously overbuilt. For buyers who want their assets to stay put.",
    ],
    "water": [
        "Waterfront on every side, because it is all waterfront. Ocean views guaranteed, land not included.",
        "Candidate water world with a year of {period}. Bring a boat, a very big boat.",
        "Deep oceans, deeper potential. The most valuable commodity in space comes standard.",
    ],
    "sub_neptune": [
        "Puffy, mysterious and generously sized. Under that thick sky is a surface nobody has seen.",
        "Mid-size world with an oversized atmosphere. For buyers who like intrigue with their real estate.",
        "Bigger than Earth, smaller than Neptune, cozier than both. A year of {period} keeps the seasons moving.",
    ],
    "ice_giant": [
        "Cool blue tones throughout, winds that never quit. Ice giant living at an ice giant price.",
        "Methane skies over a deep slushy interior. Possibly raining diamonds, no promises.",
        "Spacious, frosty and endlessly windy. Bring a parka and your most ambitious kite.",
    ],
    "gas_giant": [
        "Largest footprint in the {system} system. No floor plan because there is no floor, but the storms are spectacular.",
        "Executive-class gas giant with an atmosphere that goes on forever. Moons likely, surfaces not.",
        "Go big or go home, and this one is very big. Hydrogen-helium build with room for a ring system.",
    ],
    "hot_jupiter": [
        "Scorching gas giant hugging its star every {period}. Permanent summer, permanent sunset on one side.",
        "Hot Jupiter with a {temp} K climate. Cooling system strongly recommended, atmosphere may be evaporating.",
        "Tidally locked luxury: one side always faces the star. Perfect for buyers who hate nighttime.",
    ],
    "lava": [
        "Open-concept magma oceans at {temp} K. The floor is lava, literally, and that is the selling point.",
        "Molten curb appeal on an orbit of {period}. Bring heat shielding and a flair for drama.",
        "Glowing, volcanic and impossible to ignore. The hottest listing in the {system} system in every sense.",
    ],
    "carbon": [
        "Possible diamond interior with a year that lasts 18 hours. The ultimate flex in the {system} system.",
        "Proposed carbon-rich world, possibly diamond underfoot. Shines brighter than any portfolio.",
    ],
    "star": [
        "The original anchor tenant. Powers every property in the neighborhood and never takes a day off.",
    ],
    "moon": [
        "Charming satellite lot with a view of the big house next door. Low gravity, lower maintenance.",
        "Compact moon on an orbit of {period} around its parent. Quiet, scenic, and free of weather.",
    ],
}

SOLAR_BLURBS: dict[str, str] = {
    "sun": "Anchor property of the whole neighborhood, holding 99.8 percent of the Solar System's mass with a glowing 5,800 K finish. Sunlight reaches Earth in about 8 minutes, so the view is basically instant.",
    "mercury": "Compact starter planet on the fastest orbit in the neighborhood, with a full year in just 88 days. Daytime heat near 700 K, nighttime chill near 100 K, and no atmosphere to soften either.",
    "venus": "Earth's near twin in size, with a statement greenhouse finish at 737 K and 92 atmospheres of pressure. Come for the golden glow, stay for a day that outlasts the year.",
    "earth": "Fully furnished blue marble with liquid oceans, breathable air and one moon included. The only known address with life already in residence, so the neighbors come standard.",
    "moon": "Quiet lot beside Earth with no atmosphere and just 0.165 g, so every step is a bounce. It drifts about 3.8 centimeters farther away each year, for ever more privacy.",
    "mars": "Rust-red fixer-upper featuring Olympus Mons, the tallest volcano in the Solar System at about 22 kilometers. Thin air, big skies and two small moons thrown in, so pack a coat for 210 K.",
    "jupiter": "The largest lot in the neighborhood at about 318 Earths of mass, with a Great Red Spot storm raging for at least 190 years. No solid surface, so skip the open house.",
    "saturn": "Rings included at no extra charge, made mostly of water ice. Less dense than water, it would float in a big enough bathtub, and with hundreds of moons the guest parking is covered.",
    "uranus": "Sideways-spinning ice giant tilted about 98 degrees, for seasons that last roughly 21 years each. Cool blue finish, possible diamond rain deep inside, and a very private 59 K.",
    "neptune": "Deep blue ice giant with the fastest winds measured in the Solar System, above 2,000 kilometers per hour. Remote enough for total privacy, with one lap around the Sun every 165 years.",
    "pluto": "Beloved former planet with a heart-shaped plain of nitrogen ice called Sputnik Planitia. At 44 K, it is a 248-year wait for your first anniversary.",
    "europa": "Icy shell over a likely global saltwater ocean holding more water than all of Earth's oceans combined. Waterfront living at 102 K on the surface, with Jupiter looming overhead.",
    "titan": "The only moon with a thick atmosphere, plus lakes and seas of liquid methane and ethane. Hazy orange skies, Saturn on the horizon, and a lakefront that sits at a chilly 94 K.",
    "io": "The most volcanically active property in the Solar System, with hundreds of volcanoes and lava fountains tens of kilometers high. Nonstop fireworks courtesy of Jupiter, no permit required.",
}


def blurb_for(o: dict) -> str:
    if o["id"] in SOLAR_BLURBS:
        return SOLAR_BLURBS[o["id"]]
    cls = o["cls"]
    tmpl = _pick(o["id"] + ":blurb", BLURBS[cls])
    p = o.get("orbitalPeriodDays")
    t = o.get("tempK")
    # If a template needs a value the object lacks, fall back to a variant without it.
    if ("{period}" in tmpl and p is None) or ("{temp}" in tmpl and t is None):
        safe = [b for b in BLURBS[cls] if ("{period}" not in b or p is not None) and ("{temp}" not in b or t is not None)]
        tmpl = _pick(o["id"] + ":blurb2", safe) if safe else BLURBS["rocky"][0]
    return tmpl.format(
        name=o["name"], system=o["system"],
        period=_period_phrase(p).replace("about ", "") if p is not None else "",
        temp=_fmt(t) if t is not None else "",
    )
