// PlaceX SpacetimeDB module (TypeScript). Schema is the contract; the lead owns it.
// Reducer bodies (everything below the schema) are owned by the backend agent.
//
// Rules of the economy (from the PRD):
//   - Everyone starts with 10,000 credits. All credit changes happen inside reducers.
//   - One owner per object: `claim.objectId` is the primary key, so two concurrent
//     claims cannot both succeed. The loser's reducer throws ALREADY_CLAIMED.
//   - Hostile takeover costs 2x what the current owner paid (wage war). If the deed
//     is listed, the ask also floors the base so a takeover cannot undercut the sale.
//   - Earth, Moon and Mars are auction only.
//   - Error codes are thrown as SenderError('CODE') and reach the client as the
//     rejected promise's message. Codes are listed in client/src/types.ts.

import {
  schema, table, t, SenderError,
  type InferSchema, type ReducerCtx,
} from 'spacetimedb/server';
import { ScheduleAt, Timestamp, type Identity } from 'spacetimedb';

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** Static per-object metadata the server needs to price and validate. Long text
 *  (facts, blurbs) stays in objects.json on the client to keep subscriptions light. */
const celestialObject = table(
  { name: 'celestial_object', public: true },
  {
    id: t.string().primaryKey(),
    name: t.string(),
    system: t.string(),
    x: t.f32(),
    y: t.f32(),
    z: t.f32(),
    cls: t.string(),
    priceCredits: t.u64(),
    valueUsd: t.f64(),
    auctionOnly: t.bool(),
    habitableZone: t.bool(),
  }
);

const player = table(
  { name: 'player', public: true },
  {
    identity: t.identity().primaryKey(),
    callsign: t.string(),
    crew: t.string(),
    credits: t.u64(),
    portfolioValue: t.u64(),
    claimCount: t.u32(),
    online: t.bool(),
    joinedAt: t.timestamp(),
  }
);

const claim = table(
  { name: 'claim', public: true },
  {
    objectId: t.string().primaryKey(),
    owner: t.identity().index('btree'),
    pricePaid: t.u64(),
    claimedAt: t.timestamp(),
    // Player market: fixed-ask listing. Defaults keep existing rows migration-safe.
    forSale: t.bool().default(false),
    askCredits: t.u64().default(0n),
  }
);

const presence = table(
  { name: 'presence', public: true },
  {
    identity: t.identity().primaryKey(),
    targetObjectId: t.string(),
    camX: t.f32(),
    camY: t.f32(),
    camZ: t.f32(),
    updatedAt: t.timestamp(),
  }
);

/** Ticker feed. Pruned to the newest EVENT_KEEP rows inside reducers. */
const event = table(
  { name: 'event', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    kind: t.string(),
    actor: t.identity(),
    actorCallsign: t.string(),
    objectId: t.string(),
    amount: t.u64(),
    ts: t.timestamp(),
  }
);

const auction = table(
  { name: 'auction', public: true },
  {
    objectId: t.string().primaryKey(),
    endsAt: t.timestamp(),
    highBid: t.u64(),
    highBidder: t.option(t.identity()),
    active: t.bool(),
  }
);

const achievement = table(
  { name: 'achievement', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.identity().index('btree'),
    kind: t.string(),
    earnedAt: t.timestamp(),
  }
);

/** Single-row config. `admin` is the identity that published the module. */
const config = table(
  { name: 'config', public: true },
  {
    id: t.u8().primaryKey(),
    admin: t.identity(),
    incomeEnabled: t.bool(),
    auctionsEnabled: t.bool(),
  }
);

const incomeSchedule = table(
  { name: 'income_schedule' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

const auctionSchedule = table(
  { name: 'auction_schedule' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    objectId: t.string(),
  }
);

const spacetimedb = schema({
  celestialObject,
  player,
  claim,
  presence,
  event,
  auction,
  achievement,
  config,
  incomeSchedule,
  auctionSchedule,
});
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

// ---------------------------------------------------------------------------
// Constants and helpers (not exported: named exports are reserved for SpacetimeDB)
// ---------------------------------------------------------------------------

const STARTING_CREDITS = 10_000n;
const TAKEOVER_MULT = 2n;

/** Base for a hostile takeover: last price paid, never under an open ask. */
function takeoverBase(existing: { pricePaid: bigint; forSale: boolean; askCredits: bigint }, catalogPrice: bigint): bigint {
  let base = existing.pricePaid > 0n ? existing.pricePaid : catalogPrice;
  if (existing.forSale && existing.askCredits > base) base = existing.askCredits;
  return base;
}
const CALLSIGN_MIN = 2;
const CALLSIGN_MAX = 16;
const EVENT_KEEP = 200;
const INCOME_INTERVAL_MICROS = 60_000_000n;
const CREWS = new Set(['red', 'blue', 'green', 'purple', 'cyan', 'orange']);
const BLOCKED_WORDS = ['fuck', 'shit', 'nigg', 'fag', 'cunt', 'rape', 'hitler', 'nazi'];

// Passive income per tick (one tick per INCOME_INTERVAL_MICROS): 1% of the price paid,
// 3% for habitable-zone planets, at least 1 credit per planet.
const INCOME_RATE_PCT = 1n;
const INCOME_RATE_HABITABLE_PCT = 3n;

// Auctions roll one at a time, 20 minutes apart, so that Earth closes at 08:40 PT on
// Oct 25 2026 (PDT is UTC-7, so 15:40 UTC). The last three in the queue are Mars, Moon,
// Earth in that order; any other auction-only object is auctioned before them.
const AUCTION_SPACING_MICROS = 20n * 60_000_000n;
const AUCTION_MIN_DURATION_MICROS = 20n * 60_000_000n;
const EARTH_AUCTION_END_MICROS = BigInt(Date.UTC(2026, 9, 25, 15, 40, 0)) * 1000n;
const AUCTION_FINALE_ORDER = ['mars', 'moon', 'earth'];

// Achievement thresholds (kinds listed in client/src/types.ts).
const DIAMOND_COLLECTOR_N = 3;
const WATER_BARON_N = 3;
const HELL_LANDLORD_N = 3;
const HABITABLE_TYCOON_N = 5;
const SYSTEM_COMPLETE_MIN = 2;

function requireAdmin(ctx: Ctx) {
  const cfg = ctx.db.config.id.find(0);
  if (!cfg || !cfg.admin.equals(ctx.sender)) throw new SenderError('NOT_ADMIN');
}

function requireScheduler(ctx: Ctx) {
  if (!ctx.sender.equals(ctx.databaseIdentity)) throw new SenderError('NOT_ADMIN');
}

function requirePlayer(ctx: Ctx) {
  const p = ctx.db.player.identity.find(ctx.sender);
  if (!p || p.callsign.length === 0) throw new SenderError('NO_PROFILE');
  return p;
}

function cleanCallsign(raw: string): string {
  const s = raw.trim().replace(/[^A-Za-z0-9_\- ]/g, '').replace(/\s+/g, ' ');
  if (s.length < CALLSIGN_MIN || s.length > CALLSIGN_MAX) throw new SenderError('BAD_CALLSIGN');
  const lower = s.toLowerCase();
  for (const w of BLOCKED_WORDS) if (lower.includes(w)) throw new SenderError('BAD_CALLSIGN');
  return s;
}

/** Append a ticker event. `actor` defaults to the caller; scheduled reducers pass the
 *  player the event is about. For kind 'achievement', `objectId` carries the
 *  achievement kind (see HANDOFF.md). */
function pushEvent(ctx: Ctx, kind: string, actorCallsign: string, objectId: string, amount: bigint, actor: Identity = ctx.sender) {
  ctx.db.event.insert({
    id: 0n,
    kind,
    actor,
    actorCallsign,
    objectId,
    amount,
    ts: ctx.timestamp,
  });
  // Keep the table small: drop the oldest rows past EVENT_KEEP.
  const n = ctx.db.event.count();
  if (n > EVENT_KEEP) {
    const rows = [...ctx.db.event.iter()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const excess = Number(n) - EVENT_KEEP;
    for (let i = 0; i < excess; i++) ctx.db.event.id.delete(rows[i].id);
  }
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

/** Award `kind` to `who` once. Returns true if it was newly awarded. */
function awardOnce(ctx: Ctx, who: Identity, callsign: string, kind: string): boolean {
  for (const a of ctx.db.achievement.identity.filter(who)) {
    if (a.kind === kind) return false;
  }
  ctx.db.achievement.insert({ id: 0n, identity: who, kind, earnedAt: ctx.timestamp });
  pushEvent(ctx, 'achievement', callsign, kind, 0n, who);
  return true;
}

/** Re-evaluate collection achievements for `who` after they gained `gainedObjectId`. */
function checkCollectionAchievements(ctx: Ctx, who: Identity, callsign: string, gainedObjectId: string) {
  let total = 0, carbon = 0, water = 0, hell = 0, habitable = 0;
  const ownedBySystem = new Map<string, number>();
  for (const c of ctx.db.claim.owner.filter(who)) {
    const o = ctx.db.celestialObject.id.find(c.objectId);
    if (!o) continue;
    total++;
    if (o.cls === 'carbon') carbon++;
    if (o.cls === 'water') water++;
    if (o.cls === 'lava' || o.cls === 'hot_jupiter') hell++;
    if (o.habitableZone) habitable++;
    ownedBySystem.set(o.system, (ownedBySystem.get(o.system) ?? 0) + 1);
  }
  if (total >= 1) awardOnce(ctx, who, callsign, 'first_claim');
  if (carbon >= DIAMOND_COLLECTOR_N) awardOnce(ctx, who, callsign, 'diamond_collector');
  if (water >= WATER_BARON_N) awardOnce(ctx, who, callsign, 'water_baron');
  if (hell >= HELL_LANDLORD_N) awardOnce(ctx, who, callsign, 'hell_landlord');
  if (habitable >= HABITABLE_TYCOON_N) awardOnce(ctx, who, callsign, 'habitable_tycoon');

  // system_complete: every object in the gained object's system is owned by `who`.
  // Requires at least SYSTEM_COMPLETE_MIN objects so single-planet systems do not count.
  const gained = ctx.db.celestialObject.id.find(gainedObjectId);
  if (gained) {
    let inSystem = 0;
    for (const o of ctx.db.celestialObject.iter()) if (o.system === gained.system) inSystem++;
    const owned = ownedBySystem.get(gained.system) ?? 0;
    if (inSystem >= SYSTEM_COMPLETE_MIN && owned === inSystem) awardOnce(ctx, who, callsign, 'system_complete');
  }
}

// ---------------------------------------------------------------------------
// Auction helpers
// ---------------------------------------------------------------------------

function toMicros(ts: Timestamp): bigint {
  return ts.microsSinceUnixEpoch;
}

/** Auction-only objects that have never had an auction row, finale order last. */
function auctionQueue(ctx: Ctx): string[] {
  const ids: string[] = [];
  for (const o of ctx.db.celestialObject.iter()) {
    if (o.auctionOnly && !ctx.db.auction.objectId.find(o.id)) ids.push(o.id);
  }
  const rank = (id: string) => AUCTION_FINALE_ORDER.indexOf(id);
  ids.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  return ids;
}

/** Open the next auction in the queue, if any. `after` is the previous auction's end
 *  (or now). Ends are anchored to the fixed schedule when it is still reachable,
 *  otherwise rolled forward by AUCTION_SPACING_MICROS from the previous end. */
function openNextAuction(ctx: Ctx, after: bigint): string | null {
  const queue = auctionQueue(ctx);
  if (queue.length === 0) return null;
  const objectId = queue[0];
  const remainingAfterThis = BigInt(queue.length - 1);
  const scheduled = EARTH_AUCTION_END_MICROS - remainingAfterThis * AUCTION_SPACING_MICROS;
  const now = toMicros(ctx.timestamp);
  let endsAt = scheduled;
  if (endsAt < after + AUCTION_SPACING_MICROS) endsAt = after + AUCTION_SPACING_MICROS;
  if (endsAt < now + AUCTION_MIN_DURATION_MICROS) endsAt = now + AUCTION_MIN_DURATION_MICROS;
  ctx.db.auction.insert({ objectId, endsAt: new Timestamp(endsAt), highBid: 0n, highBidder: undefined, active: true });
  ctx.db.auctionSchedule.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(endsAt), objectId });
  return objectId;
}

function hasActiveAuction(ctx: Ctx): boolean {
  for (const a of ctx.db.auction.iter()) if (a.active) return true;
  return false;
}

/** Give `objectId` to `winner` for `pricePaid` credits (credits already deducted).
 *  Handles a stale claim by someone else, keeping both portfolios consistent. */
function transferClaim(ctx: Ctx, objectId: string, winner: Identity, pricePaid: bigint) {
  const existing = ctx.db.claim.objectId.find(objectId);
  if (existing) {
    const prev = ctx.db.player.identity.find(existing.owner);
    if (prev && !prev.identity.equals(winner)) {
      ctx.db.player.identity.update({
        ...prev,
        portfolioValue: prev.portfolioValue > existing.pricePaid ? prev.portfolioValue - existing.pricePaid : 0n,
        claimCount: prev.claimCount > 0 ? prev.claimCount - 1 : 0,
      });
    }
    ctx.db.claim.objectId.update({
      objectId, owner: winner, pricePaid, claimedAt: ctx.timestamp, forSale: false, askCredits: 0n,
    });
  } else {
    ctx.db.claim.insert({
      objectId, owner: winner, pricePaid, claimedAt: ctx.timestamp, forSale: false, askCredits: 0n,
    });
  }
  const w = ctx.db.player.identity.find(winner);
  if (w) {
    ctx.db.player.identity.update({
      ...w,
      portfolioValue: w.portfolioValue + pricePaid,
      claimCount: w.claimCount + (existing && existing.owner.equals(winner) ? 0 : 1),
    });
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export const init = spacetimedb.init(ctx => {
  // The publisher becomes admin. Scheduled jobs start disabled; the backend agent
  // flips them on once implemented (see setFlags).
  if (!ctx.db.config.id.find(0)) {
    ctx.db.config.insert({ id: 0, admin: ctx.sender, incomeEnabled: false, auctionsEnabled: false });
  }
  if (ctx.db.incomeSchedule.count() === 0n) {
    ctx.db.incomeSchedule.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(INCOME_INTERVAL_MICROS) });
  }
});

export const clientConnected = spacetimedb.clientConnected(ctx => {
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) {
    ctx.db.player.identity.update({ ...existing, online: true });
  } else {
    ctx.db.player.insert({
      identity: ctx.sender,
      callsign: '',
      crew: 'blue',
      credits: STARTING_CREDITS,
      portfolioValue: 0n,
      claimCount: 0,
      online: true,
      joinedAt: ctx.timestamp,
    });
  }
});

export const clientDisconnected = spacetimedb.clientDisconnected(ctx => {
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) ctx.db.player.identity.update({ ...existing, online: false });
  const pr = ctx.db.presence.identity.find(ctx.sender);
  if (pr) ctx.db.presence.identity.delete(ctx.sender);
});

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------

export const setProfile = spacetimedb.reducer(
  { callsign: t.string(), crew: t.string() },
  (ctx, { callsign, crew }) => {
    const clean = cleanCallsign(callsign);
    if (!CREWS.has(crew)) throw new SenderError('BAD_CREW');
    const p = ctx.db.player.identity.find(ctx.sender);
    if (!p) throw new SenderError('NO_PROFILE');
    const isNew = p.callsign.length === 0;
    ctx.db.player.identity.update({ ...p, callsign: clean, crew });
    if (isNew) pushEvent(ctx, 'join', clean, '', 0n);
  }
);

export const claimObject = spacetimedb.reducer(
  { objectId: t.string() },
  (ctx, { objectId }) => {
    const p = requirePlayer(ctx);
    const obj = ctx.db.celestialObject.id.find(objectId);
    if (!obj) throw new SenderError('UNKNOWN_OBJECT');
    if (obj.auctionOnly) throw new SenderError('AUCTION_ONLY');
    if (ctx.db.claim.objectId.find(objectId)) throw new SenderError('ALREADY_CLAIMED');
    if (p.credits < obj.priceCredits) throw new SenderError('INSUFFICIENT_CREDITS');

    ctx.db.claim.insert({
      objectId, owner: ctx.sender, pricePaid: obj.priceCredits, claimedAt: ctx.timestamp,
      forSale: false, askCredits: 0n,
    });
    ctx.db.player.identity.update({
      ...p,
      credits: p.credits - obj.priceCredits,
      portfolioValue: p.portfolioValue + obj.priceCredits,
      claimCount: p.claimCount + 1,
    });
    pushEvent(ctx, 'claim', p.callsign, objectId, obj.priceCredits);
    checkCollectionAchievements(ctx, ctx.sender, p.callsign, objectId);
  }
);

export const listForSale = spacetimedb.reducer(
  { objectId: t.string(), askCredits: t.u64() },
  (ctx, { objectId, askCredits }) => {
    const p = requirePlayer(ctx);
    const obj = ctx.db.celestialObject.id.find(objectId);
    if (!obj) throw new SenderError('UNKNOWN_OBJECT');
    const existing = ctx.db.claim.objectId.find(objectId);
    if (!existing) throw new SenderError('NOT_CLAIMED');
    if (!existing.owner.equals(ctx.sender)) throw new SenderError('NOT_OWNER');
    // Floor at the higher of catalog list price and what you paid (after a wage war).
    const floor = existing.pricePaid > obj.priceCredits ? existing.pricePaid : obj.priceCredits;
    if (askCredits < floor) throw new SenderError('ASK_TOO_LOW');
    const activeAuction = ctx.db.auction.objectId.find(objectId);
    if (activeAuction && activeAuction.active) throw new SenderError('AUCTION_ONLY');

    ctx.db.claim.objectId.update({ ...existing, forSale: true, askCredits });
    pushEvent(ctx, 'listed', p.callsign, objectId, askCredits);
  }
);

export const cancelListing = spacetimedb.reducer(
  { objectId: t.string() },
  (ctx, { objectId }) => {
    requirePlayer(ctx);
    const existing = ctx.db.claim.objectId.find(objectId);
    if (!existing) throw new SenderError('NOT_CLAIMED');
    if (!existing.owner.equals(ctx.sender)) throw new SenderError('NOT_OWNER');
    if (!existing.forSale) throw new SenderError('NOT_FOR_SALE');
    ctx.db.claim.objectId.update({ ...existing, forSale: false, askCredits: 0n });
  }
);

export const buyListing = spacetimedb.reducer(
  { objectId: t.string() },
  (ctx, { objectId }) => {
    const p = requirePlayer(ctx);
    const obj = ctx.db.celestialObject.id.find(objectId);
    if (!obj) throw new SenderError('UNKNOWN_OBJECT');
    const existing = ctx.db.claim.objectId.find(objectId);
    if (!existing) throw new SenderError('NOT_CLAIMED');
    if (!existing.forSale || existing.askCredits === 0n) throw new SenderError('NOT_FOR_SALE');
    if (existing.owner.equals(ctx.sender)) throw new SenderError('OWN_OBJECT');
    const cost = existing.askCredits;
    if (p.credits < cost) throw new SenderError('INSUFFICIENT_CREDITS');

    ctx.db.claim.objectId.update({
      objectId, owner: ctx.sender, pricePaid: cost, claimedAt: ctx.timestamp,
      forSale: false, askCredits: 0n,
    });
    ctx.db.player.identity.update({
      ...p,
      credits: p.credits - cost,
      portfolioValue: p.portfolioValue + cost,
      claimCount: p.claimCount + 1,
    });
    const prev = ctx.db.player.identity.find(existing.owner);
    if (prev) {
      ctx.db.player.identity.update({
        ...prev,
        credits: prev.credits + cost,
        portfolioValue: prev.portfolioValue > existing.pricePaid ? prev.portfolioValue - existing.pricePaid : 0n,
        claimCount: prev.claimCount > 0 ? prev.claimCount - 1 : 0,
      });
    }
    pushEvent(ctx, 'sale', p.callsign, objectId, cost);
    checkCollectionAchievements(ctx, ctx.sender, p.callsign, objectId);
  }
);

export const hostileTakeover = spacetimedb.reducer(
  { objectId: t.string() },
  (ctx, { objectId }) => {
    const p = requirePlayer(ctx);
    const obj = ctx.db.celestialObject.id.find(objectId);
    if (!obj) throw new SenderError('UNKNOWN_OBJECT');
    // Auction prizes are protected: Earth cannot be sniped for 2x after a public auction.
    if (obj.auctionOnly) throw new SenderError('AUCTION_ONLY');
    const existing = ctx.db.claim.objectId.find(objectId);
    if (!existing) throw new SenderError('NOT_CLAIMED');
    if (existing.owner.equals(ctx.sender)) throw new SenderError('OWN_OBJECT');
    // Wage war: 2x last paid. Listed ask floors the base so sniping cannot beat the ask.
    const cost = TAKEOVER_MULT * takeoverBase(existing, obj.priceCredits);
    if (p.credits < cost) throw new SenderError('INSUFFICIENT_CREDITS');

    // Move the claim and clear any open ask.
    ctx.db.claim.objectId.update({
      objectId, owner: ctx.sender, pricePaid: cost, claimedAt: ctx.timestamp,
      forSale: false, askCredits: 0n,
    });

    // Buyer pays 2x the base and books the object at what they paid.
    ctx.db.player.identity.update({
      ...p,
      credits: p.credits - cost,
      portfolioValue: p.portfolioValue + cost,
      claimCount: p.claimCount + 1,
    });

    // Previous owner receives the full cost and loses the object from their books.
    const prev = ctx.db.player.identity.find(existing.owner);
    if (prev) {
      ctx.db.player.identity.update({
        ...prev,
        credits: prev.credits + cost,
        portfolioValue: prev.portfolioValue > existing.pricePaid ? prev.portfolioValue - existing.pricePaid : 0n,
        claimCount: prev.claimCount > 0 ? prev.claimCount - 1 : 0,
      });
    }

    pushEvent(ctx, 'takeover', p.callsign, objectId, cost);
    awardOnce(ctx, ctx.sender, p.callsign, 'takeover_artist');
    checkCollectionAchievements(ctx, ctx.sender, p.callsign, objectId);
  }
);

export const placeBid = spacetimedb.reducer(
  { objectId: t.string(), amount: t.u64() },
  (ctx, { objectId, amount }) => {
    const cfg = ctx.db.config.id.find(0);
    if (!cfg || !cfg.auctionsEnabled) throw new SenderError('DISABLED');
    const p = requirePlayer(ctx);
    const obj = ctx.db.celestialObject.id.find(objectId);
    if (!obj) throw new SenderError('UNKNOWN_OBJECT');
    const a = ctx.db.auction.objectId.find(objectId);
    if (!a || !a.active) throw new SenderError('NO_AUCTION');
    if (toMicros(ctx.timestamp) >= toMicros(a.endsAt)) throw new SenderError('AUCTION_ENDED');
    // Opening bid is the listed price; afterwards every bid must beat the high bid.
    if (amount < obj.priceCredits || amount <= a.highBid) throw new SenderError('BID_TOO_LOW');

    const isTopBidder = a.highBidder !== undefined && a.highBidder.equals(ctx.sender);
    if (isTopBidder) {
      // Raising your own bid: only the difference is escrowed.
      const extra = amount - a.highBid;
      if (p.credits < extra) throw new SenderError('INSUFFICIENT_CREDITS');
      ctx.db.player.identity.update({ ...p, credits: p.credits - extra });
    } else {
      if (p.credits < amount) throw new SenderError('INSUFFICIENT_CREDITS');
      ctx.db.player.identity.update({ ...p, credits: p.credits - amount });
      // Refund the outbid player.
      if (a.highBidder !== undefined) {
        const prev = ctx.db.player.identity.find(a.highBidder);
        if (prev) ctx.db.player.identity.update({ ...prev, credits: prev.credits + a.highBid });
      }
    }

    ctx.db.auction.objectId.update({ ...a, highBid: amount, highBidder: ctx.sender });
    pushEvent(ctx, 'bid', p.callsign, objectId, amount);
  }
);

export const updatePresence = spacetimedb.reducer(
  { targetObjectId: t.string(), x: t.f32(), y: t.f32(), z: t.f32() },
  (ctx, { targetObjectId, x, y, z }) => {
    const row = { identity: ctx.sender, targetObjectId, camX: x, camY: y, camZ: z, updatedAt: ctx.timestamp };
    if (ctx.db.presence.identity.find(ctx.sender)) ctx.db.presence.identity.update(row);
    else ctx.db.presence.insert(row);
  }
);

// ---------------------------------------------------------------------------
// Scheduled
// ---------------------------------------------------------------------------

export const payIncome = spacetimedb.reducer(
  { onSchedule: incomeSchedule },
  { timer: incomeSchedule.rowType },
  (ctx, { timer }) => {
    requireScheduler(ctx);
    void timer;
    const cfg = ctx.db.config.id.find(0);
    if (!cfg || !cfg.incomeEnabled) return;

    // Sum income per owner first so each player gets one credit update and at most
    // one 'income' event per tick.
    const byOwner = new Map<string, { owner: Identity; total: bigint }>();
    for (const c of ctx.db.claim.iter()) {
      const o = ctx.db.celestialObject.id.find(c.objectId);
      if (!o) continue;
      const pct = o.habitableZone ? INCOME_RATE_HABITABLE_PCT : INCOME_RATE_PCT;
      let pay = (c.pricePaid * pct) / 100n;
      if (pay < 1n) pay = 1n;
      const key = c.owner.toHexString();
      const acc = byOwner.get(key);
      if (acc) acc.total += pay;
      else byOwner.set(key, { owner: c.owner, total: pay });
    }
    for (const { owner, total } of byOwner.values()) {
      const p = ctx.db.player.identity.find(owner);
      if (!p) continue;
      ctx.db.player.identity.update({ ...p, credits: p.credits + total });
      // Only online players get a ticker line, so the feed is not flooded by idle owners.
      if (p.online) pushEvent(ctx, 'income', p.callsign, '', total, owner);
    }
  }
);

export const settleAuction = spacetimedb.reducer(
  { onSchedule: auctionSchedule },
  { timer: auctionSchedule.rowType },
  (ctx, { timer }) => {
    requireScheduler(ctx);
    // Settlement always runs, even if auctions were disabled mid-way, so escrowed
    // credits are never stranded. The flag only gates opening and bidding.
    const a = ctx.db.auction.objectId.find(timer.objectId);
    let endedAt = toMicros(ctx.timestamp);
    if (a && a.active) {
      endedAt = toMicros(a.endsAt);
      if (a.highBidder !== undefined && a.highBid > 0n) {
        const winner = ctx.db.player.identity.find(a.highBidder);
        transferClaim(ctx, a.objectId, a.highBidder, a.highBid);
        if (winner) {
          pushEvent(ctx, 'auction_won', winner.callsign, a.objectId, a.highBid, a.highBidder);
          checkCollectionAchievements(ctx, a.highBidder, winner.callsign, a.objectId);
        }
      }
      ctx.db.auction.objectId.update({ ...a, active: false });
    }
    const cfg = ctx.db.config.id.find(0);
    if (cfg && cfg.auctionsEnabled && !hasActiveAuction(ctx)) openNextAuction(ctx, endedAt);
  }
);

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

const SeedObject = t.object('SeedObject', {
  id: t.string(),
  name: t.string(),
  system: t.string(),
  x: t.f32(),
  y: t.f32(),
  z: t.f32(),
  cls: t.string(),
  priceCredits: t.u64(),
  valueUsd: t.f64(),
  auctionOnly: t.bool(),
  habitableZone: t.bool(),
});

/** Upsert a chunk of objects. Called by scripts/seed.ts with chunks of ~500. */
export const seedObjects = spacetimedb.reducer(
  { objects: t.array(SeedObject) },
  (ctx, { objects }) => {
    requireAdmin(ctx);
    for (const o of objects) {
      if (ctx.db.celestialObject.id.find(o.id)) ctx.db.celestialObject.id.update(o);
      else ctx.db.celestialObject.insert(o);
    }
  }
);

/** Flip scheduled features on or off without republishing. */
export const setFlags = spacetimedb.reducer(
  { incomeEnabled: t.bool(), auctionsEnabled: t.bool() },
  (ctx, { incomeEnabled, auctionsEnabled }) => {
    requireAdmin(ctx);
    const cfg = ctx.db.config.id.find(0);
    if (!cfg) throw new SenderError('NOT_ADMIN');
    ctx.db.config.id.update({ ...cfg, incomeEnabled, auctionsEnabled });
    // Turning auctions on starts the rolling schedule if nothing is open.
    if (auctionsEnabled && !hasActiveAuction(ctx)) openNextAuction(ctx, toMicros(ctx.timestamp));
  }
);

/** Local dev only: wipe game state (not the object catalog). */
export const adminReset = spacetimedb.reducer(ctx => {
  requireAdmin(ctx);
  for (const r of [...ctx.db.claim.iter()]) ctx.db.claim.objectId.delete(r.objectId);
  for (const r of [...ctx.db.event.iter()]) ctx.db.event.id.delete(r.id);
  for (const r of [...ctx.db.presence.iter()]) ctx.db.presence.identity.delete(r.identity);
  for (const r of [...ctx.db.achievement.iter()]) ctx.db.achievement.id.delete(r.id);
  for (const r of [...ctx.db.auction.iter()]) ctx.db.auction.objectId.delete(r.objectId);
  for (const r of [...ctx.db.auctionSchedule.iter()]) ctx.db.auctionSchedule.scheduledId.delete(r.scheduledId);
  // Players are deleted too, so test callsigns vanish; connected clients get a fresh
  // row on their next connect and see the landing again.
  for (const p of [...ctx.db.player.iter()]) ctx.db.player.identity.delete(p.identity);
});
