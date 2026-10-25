// PlaceX shared contract. Owned by the lead. Agents build against this file and must
// not edit it; ask the lead for changes.

export type PlanetClass =
  | 'rocky' | 'iron' | 'water' | 'sub_neptune' | 'ice_giant'
  | 'gas_giant' | 'hot_jupiter' | 'lava' | 'carbon' | 'star' | 'moon';

export type SoundLayer = 'wind' | 'lava' | 'storm' | 'ice' | 'silence';

export interface PriceBreakdown {
  compositionUsdPerKg: number;
  habitableMult: number;
  rarityMult: number;
  distanceMult: number;
}

export interface SoundParams {
  speedOfSound: number;   // m/s in the planet's assumed atmosphere
  pitchRatio: number;     // speedOfSound / 343, clamped to [0.25, 4]
  density: number;        // relative atmosphere density, 0 (airless) to ~100 (crushing)
  layer: SoundLayer;
}

export interface CelestialObject {
  id: string;            // stable slug, e.g. "wasp-76-b", "earth"
  name: string;
  system: string;        // host star name, "Sol" for the Solar System
  x: number; y: number; z: number;   // light years, Earth at origin
  distanceLy: number;
  cls: PlanetClass;
  massEarth: number | null;
  radiusEarth: number | null;
  tempK: number | null;
  orbitalPeriodDays: number | null;
  gravityG: number | null;
  discoveryYear: number | null;
  estimated: string[];   // field names that were estimated rather than measured
  valueUsd: number;      // market value from the pricing model
  priceCredits: number;  // claim price in credits
  priceBreakdown: PriceBreakdown;
  sound: SoundParams;
  fact: string;
  factVerified: boolean;
  blurb: string;         // realtor listing copy, no em dashes
  auctionOnly: boolean;
  habitableZone: boolean;
}

// Crews are fixed. The server stores the crew id string; the client maps it to a color.
export const CREWS = {
  red:    { name: 'Red Dwarfs',    color: '#ff4d4d' },
  blue:   { name: 'Blue Giants',   color: '#4da6ff' },
  green:  { name: 'Green Zone',    color: '#4dff88' },
  purple: { name: 'Purple Nebula', color: '#b84dff' },
  cyan:   { name: 'Cyan Comets',   color: '#4dfff0' },
  orange: { name: 'Orange Flares', color: '#ffa64d' },
} as const;
export type Crew = keyof typeof CREWS;
export const CREW_IDS = Object.keys(CREWS) as Crew[];
export const GOLD = '#ffd54a';       // the player's own planets pulse gold
export const UNCLAIMED = '#ffffff';  // unclaimed objects glow white
export const HABITABLE = '#7ef0d0';  // unclaimed habitable-zone worlds (mint, not crew green)

export const STARTING_CREDITS = 10_000;
export const TAKEOVER_MULT = 2;
export const CALLSIGN_MIN = 2;
export const CALLSIGN_MAX = 16;

// Error codes thrown by reducers. They arrive on the client as the rejected
// promise's `message`. See state/actions for the helper that extracts them.
export type ReducerError =
  | 'ALREADY_CLAIMED'
  | 'INSUFFICIENT_CREDITS'
  | 'AUCTION_ONLY'
  | 'UNKNOWN_OBJECT'
  | 'NO_PROFILE'
  | 'BAD_CALLSIGN'
  | 'BAD_CREW'
  | 'NOT_CLAIMED'
  | 'OWN_OBJECT'
  | 'NOT_OWNER'
  | 'NO_AUCTION'
  | 'AUCTION_ENDED'
  | 'BID_TOO_LOW'
  | 'ASK_TOO_LOW'
  | 'NOT_FOR_SALE'
  | 'NOT_ADMIN'
  | 'DISABLED';

// Event conventions: `achievement` events carry the AchievementKind in `objectId`;
// `income` events have an empty `objectId` and `amount` = credits paid that minute.
// `listed` / `sale` are the player fixed-ask market.
export type EventKind =
  | 'claim' | 'takeover' | 'bid' | 'auction_won' | 'income' | 'achievement' | 'join'
  | 'listed' | 'sale';

export type AchievementKind =
  | 'first_claim' | 'diamond_collector' | 'water_baron' | 'hell_landlord'
  | 'habitable_tycoon' | 'system_complete' | 'takeover_artist';

// Plain-object views the UI consumes. Providers (live or mock) convert bigint and
// Identity into number and hex string so UI code never touches SDK types.
export interface PlayerView {
  identity: string;        // hex
  callsign: string;
  crew: Crew;
  credits: number;
  portfolioValue: number;
  claimCount: number;
  online: boolean;
  joinedAt: number;        // ms since epoch
}

export interface ClaimView {
  objectId: string;
  owner: string;           // identity hex
  ownerCallsign: string;
  ownerCrew: Crew;
  pricePaid: number;
  claimedAt: number;       // ms since epoch
  forSale: boolean;
  askCredits: number;      // meaningful when forSale
}

export interface EventView {
  id: string;
  kind: EventKind;
  actor: string;           // identity hex
  actorCallsign: string;
  objectId: string;
  amount: number;
  ts: number;              // ms since epoch
}

export interface PresenceView {
  identity: string;
  callsign: string;
  crew: Crew;
  targetObjectId: string;
  x: number; y: number; z: number;
  updatedAt: number;
}

export interface AuctionView {
  objectId: string;
  endsAt: number;          // ms since epoch
  highBid: number;
  highBidder: string | null;
  highBidderCallsign: string | null;
  active: boolean;
}

export interface AchievementView {
  identity: string;
  kind: AchievementKind;
  earnedAt: number;
}

export interface LeaderboardEntry {
  identity: string;
  callsign: string;
  crew: Crew;
  portfolioValue: number;
  claimCount: number;
  online: boolean;
}

export interface LiveStats {
  players: number;
  online: number;
  claims: number;
  totalValue: number;
}
