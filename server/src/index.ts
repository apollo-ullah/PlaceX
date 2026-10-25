// PlaceX SpacetimeDB module (TypeScript). Schema is the contract; the lead owns it.
// Reducer bodies marked TODO(backend) are owned by the backend agent.
//
// Rules of the economy (from the PRD):
//   - Everyone starts with 10,000 credits. All credit changes happen inside reducers.
//   - One owner per object: `claim.objectId` is the primary key, so two concurrent
//     claims cannot both succeed. The loser's reducer throws ALREADY_CLAIMED.
//   - Hostile takeover costs 2x the object's price; the previous owner receives it.
//   - Earth, Moon and Mars are auction only.
//   - Error codes are thrown as SenderError('CODE') and reach the client as the
//     rejected promise's message. Codes are listed in client/src/types.ts.

import {
  schema, table, t, SenderError,
  type InferSchema, type ReducerCtx,
} from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';

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
const CALLSIGN_MIN = 2;
const CALLSIGN_MAX = 16;
const EVENT_KEEP = 200;
const INCOME_INTERVAL_MICROS = 60_000_000n;
const CREWS = new Set(['red', 'blue', 'green', 'purple', 'cyan', 'orange']);
const BLOCKED_WORDS = ['fuck', 'shit', 'nigg', 'fag', 'cunt', 'rape', 'hitler', 'nazi'];

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

function pushEvent(ctx: Ctx, kind: string, actorCallsign: string, objectId: string, amount: bigint) {
  ctx.db.event.insert({
    id: 0n,
    kind,
    actor: ctx.sender,
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

    ctx.db.claim.insert({ objectId, owner: ctx.sender, pricePaid: obj.priceCredits, claimedAt: ctx.timestamp });
    ctx.db.player.identity.update({
      ...p,
      credits: p.credits - obj.priceCredits,
      portfolioValue: p.portfolioValue + obj.priceCredits,
      claimCount: p.claimCount + 1,
    });
    pushEvent(ctx, 'claim', p.callsign, objectId, obj.priceCredits);
    // TODO(backend): award achievements (first_claim, diamond_collector, ...).
  }
);

export const hostileTakeover = spacetimedb.reducer(
  { objectId: t.string() },
  (ctx, { objectId }) => {
    // TODO(backend): implement.
    //   - requirePlayer; object must exist and be claimed by someone else (NOT_CLAIMED / OWN_OBJECT)
    //   - cost = TAKEOVER_MULT * obj.priceCredits; INSUFFICIENT_CREDITS if short
    //   - pay previous owner the full cost, move claim, update both portfolios and counts
    //   - pushEvent('takeover', ...)
    void TAKEOVER_MULT;
    throw new SenderError('DISABLED');
  }
);

export const placeBid = spacetimedb.reducer(
  { objectId: t.string(), amount: t.u64() },
  (ctx, { objectId, amount }) => {
    // TODO(backend): implement.
    //   - auction must exist and be active and not ended (NO_AUCTION / AUCTION_ENDED)
    //   - amount > highBid (BID_TOO_LOW); escrow bidder credits; refund previous high bidder
    //   - pushEvent('bid', ...)
    throw new SenderError('DISABLED');
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
    const cfg = ctx.db.config.id.find(0);
    if (!cfg || !cfg.incomeEnabled) return;
    // TODO(backend): for every claim, pay the owner; habitable planets pay more.
    //   Suggested: 1% of pricePaid per minute, 3% if habitableZone. Update player.credits.
    //   Write one 'income' event per player at most (not per planet) to keep the ticker sane.
    void timer;
  }
);

export const settleAuction = spacetimedb.reducer(
  { onSchedule: auctionSchedule },
  { timer: auctionSchedule.rowType },
  (ctx, { timer }) => {
    requireScheduler(ctx);
    // TODO(backend): transfer the object to the high bidder (credits already escrowed),
    //   mark the auction inactive, pushEvent('auction_won', ...), open the next auction
    //   on the rolling schedule (one every 20 minutes; Earth ends at 08:40 PT).
    void timer;
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
  for (const p of [...ctx.db.player.iter()]) {
    ctx.db.player.identity.update({ ...p, credits: STARTING_CREDITS, portfolioValue: 0n, claimCount: 0 });
  }
});
