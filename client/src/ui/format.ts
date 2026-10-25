// Copy and number formatting for the UI shell. Realtor voice, no em dashes.
import type { CelestialObject, EventView, PlanetClass, ReducerError } from '../types';
import { formatCredits } from '../state';

export const CLASS_LABEL: Record<PlanetClass, string> = {
  rocky: 'Rocky world',
  iron: 'Iron world',
  water: 'Water world',
  sub_neptune: 'Sub-Neptune',
  ice_giant: 'Ice giant',
  gas_giant: 'Gas giant',
  hot_jupiter: 'Hot Jupiter',
  lava: 'Lava world',
  carbon: 'Diamond world',
  star: 'Star',
  moon: 'Moon',
};

export const ERROR_COPY: Record<ReducerError, string> = {
  ALREADY_CLAIMED: 'Sniped. Someone beat you to it.',
  INSUFFICIENT_CREDITS: 'Not enough credits for this one.',
  AUCTION_ONLY: 'Auction only. Watch the big screen.',
  UNKNOWN_OBJECT: 'That listing fell off the map. Try another.',
  NO_PROFILE: 'Pick a callsign first, captain.',
  BAD_CALLSIGN: 'Callsigns are 2 to 16 characters. Letters, numbers, a dash if you like.',
  BAD_CREW: 'Pick a crew color to continue.',
  NOT_CLAIMED: 'Nobody owns it yet. Just claim it.',
  OWN_OBJECT: 'That one is already yours.',
  NO_AUCTION: 'No auction running for this listing.',
  AUCTION_ENDED: 'That auction already closed.',
  BID_TOO_LOW: 'Bid higher. The market is hot.',
  NOT_ADMIN: 'Admins only, sorry.',
  DISABLED: 'That feature is switched off right now.',
};

export function objectName(byId: Map<string, CelestialObject>, id: string): string {
  return byId.get(id)?.name ?? (id ? prettify(id) : 'somewhere');
}

function prettify(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export interface TickerParts {
  actor: string;
  verb: string;
  object: string | null;
  amount: string | null;
  kind: EventView['kind'];
}

/** Events worth a ticker line. Income fires once a minute per online player, so it is skipped. */
export function isTickerEvent(e: EventView): boolean {
  return e.kind !== 'income';
}

/** One ticker line: "ady claimed WASP-76 b for 852 cr". */
export function tickerParts(e: EventView, byId: Map<string, CelestialObject>): TickerParts {
  // Lead convention: `achievement` events carry the achievement kind in objectId, `income` has no objectId.
  const name = e.objectId && e.kind !== 'achievement' ? objectName(byId, e.objectId) : null;
  const cr = e.amount ? `${formatCredits(e.amount)} cr` : null;
  switch (e.kind) {
    case 'claim': return { actor: e.actorCallsign, verb: 'claimed', object: name, amount: cr, kind: e.kind };
    case 'takeover': return { actor: e.actorCallsign, verb: 'took over', object: name, amount: cr, kind: e.kind };
    case 'bid': return { actor: e.actorCallsign, verb: 'bid on', object: name, amount: cr, kind: e.kind };
    case 'auction_won': return { actor: e.actorCallsign, verb: 'won the auction for', object: name, amount: cr, kind: e.kind };
    case 'income': return { actor: e.actorCallsign, verb: cr ? `collected ${cr} in rent` : 'collected rent', object: null, amount: null, kind: e.kind };
    case 'achievement': return { actor: e.actorCallsign, verb: 'earned', object: ACHIEVEMENT_COPY[e.objectId]?.title ?? prettify(e.objectId || 'an achievement'), amount: null, kind: e.kind };
    case 'join': return { actor: e.actorCallsign, verb: 'just landed', object: null, amount: null, kind: e.kind };
    default: return { actor: e.actorCallsign, verb: e.kind, object: name, amount: cr, kind: e.kind };
  }
}

export function fmtDistance(ly: number): string {
  if (ly <= 0) return 'Right here';
  if (ly < 10) return `${ly.toFixed(2)} ly`;
  if (ly < 100) return `${ly.toFixed(1)} ly`;
  return `${Math.round(ly).toLocaleString('en-US')} ly`;
}

export function fmtTempK(k: number): string { return `${Math.round(k).toLocaleString('en-US')} K`; }
export function fmtTempC(k: number): string {
  const c = Math.round(k - 273.15);
  return `${c > 0 ? '+' : ''}${c.toLocaleString('en-US')} C`;
}

export function fmtDays(d: number): { v: string; unit: string } {
  if (d < 1) return { v: (d * 24).toFixed(1), unit: 'hours' };
  if (d < 100) return { v: d.toFixed(1), unit: 'days' };
  if (d < 2000) return { v: Math.round(d).toLocaleString('en-US'), unit: 'days' };
  return { v: (d / 365.25).toFixed(1), unit: 'years' };
}

export function fmtG(g: number): string { return g < 0.1 ? g.toFixed(3) : g.toFixed(2); }

export function fmtMult(m: number): string {
  if (Math.abs(m - Math.round(m)) < 0.005) return `${Math.round(m)}x`;
  return `${m.toFixed(2)}x`;
}

export function fmtUsdPerKg(v: number): string {
  if (v >= 1) return `$${v.toLocaleString('en-US')}/kg`;
  return `$${v.toFixed(2)}/kg`;
}

export const ACHIEVEMENT_COPY: Record<string, { title: string; line: string }> = {
  first_claim: { title: 'First Deed', line: 'Your first planet. The universe just got smaller.' },
  diamond_collector: { title: 'Diamond Collector', line: 'Three carbon worlds. Pressure makes diamonds.' },
  water_baron: { title: 'Water Baron', line: 'Three water worlds. Beachfront, everywhere.' },
  hell_landlord: { title: 'Hell Landlord', line: 'Three molten worlds. Bring sunscreen, and a lawyer.' },
  habitable_tycoon: { title: 'Habitable Zone Tycoon', line: 'Five habitable worlds. Prime real estate.' },
  system_complete: { title: 'System Complete', line: 'A whole star system, all yours.' },
  takeover_artist: { title: 'Takeover Artist', line: 'Your first hostile takeover. Ruthless.' },
};
