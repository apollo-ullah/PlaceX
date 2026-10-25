// Unit tests for the PlaceX module, run in-process with the SpacetimeDB test harness.
// Each test gets a fresh database: init runs as the module identity (which becomes
// admin), the 8 placeholder objects are seeded, and two players A and B join.
import { beforeEach, describe, expect, it } from 'vitest';
import { ConnectionId } from 'spacetimedb';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';
import spacetimedb, * as mod from '../src/index';

const makeHarness = () => createModuleTestHarness(spacetimedb, mod);
type Harness = ReturnType<typeof makeHarness>;

const OBJECTS = [
  { id: 'earth', name: 'Earth', system: 'Sol', cls: 'rocky', priceCredits: 9000n, auctionOnly: true, habitableZone: true },
  { id: 'moon', name: 'Moon', system: 'Sol', cls: 'moon', priceCredits: 4000n, auctionOnly: true, habitableZone: false },
  { id: 'mars', name: 'Mars', system: 'Sol', cls: 'rocky', priceCredits: 3000n, auctionOnly: true, habitableZone: false },
  { id: 'jupiter', name: 'Jupiter', system: 'Sol', cls: 'gas_giant', priceCredits: 2500n, auctionOnly: false, habitableZone: false },
  { id: 'proxima-cen-b', name: 'Proxima Centauri b', system: 'Proxima Centauri', cls: 'rocky', priceCredits: 1800n, auctionOnly: false, habitableZone: true },
  { id: 'trappist-1-e', name: 'TRAPPIST-1 e', system: 'TRAPPIST-1', cls: 'rocky', priceCredits: 1200n, auctionOnly: false, habitableZone: true },
  { id: 'wasp-76-b', name: 'WASP-76 b', system: 'WASP-76', cls: 'hot_jupiter', priceCredits: 900n, auctionOnly: false, habitableZone: false },
  { id: 'kelt-9-b', name: 'KELT-9 b', system: 'KELT-9', cls: 'hot_jupiter', priceCredits: 800n, auctionOnly: false, habitableZone: false },
].map((o, i) => ({ ...o, x: i, y: 0, z: 0, valueUsd: 1e20 }));

const player = (sub: string, conn: bigint) =>
  TestAuth.fromJwtPayload(JSON.stringify({ iss: 'placex-test', sub }), new ConnectionId(conn));

const A = player('alice', 1n);
const B = player('bob', 2n);
const ADMIN = TestAuth.internal();

let h: Harness;

function join(auth: TestAuth, callsign: string, crew = 'red') {
  h.withReducerTx(auth, ctx => mod.clientConnected(ctx, {}));
  h.withReducerTx(auth, ctx => mod.setProfile(ctx, { callsign, crew }));
  return h.withReducerTx(auth, ctx => ctx.sender);
}

function playerRow(auth: TestAuth) {
  return h.withReducerTx(auth, ctx => ctx.db.player.identity.find(ctx.sender)!);
}

function claim(auth: TestAuth, objectId: string) {
  return h.withReducerTx(auth, ctx => mod.claimObject(ctx, { objectId }));
}

function takeover(auth: TestAuth, objectId: string) {
  return h.withReducerTx(auth, ctx => mod.hostileTakeover(ctx, { objectId }));
}

function achievements(auth: TestAuth): string[] {
  return h.withReducerTx(auth, ctx => [...ctx.db.achievement.identity.filter(ctx.sender)].map(a => a.kind).sort());
}

beforeEach(() => {
  h = makeHarness();
  h.withReducerTx(ADMIN, ctx => mod.init(ctx, {}));
  h.withReducerTx(ADMIN, ctx => mod.seedObjects(ctx, { objects: OBJECTS }));
  join(A, 'alice', 'red');
  join(B, 'bob', 'blue');
});

describe('set_profile', () => {
  it('rejects bad callsigns and crews', () => {
    const bad = (callsign: string, crew = 'red') =>
      expect(() => h.withReducerTx(A, ctx => mod.setProfile(ctx, { callsign, crew })));
    bad('a').toThrow('BAD_CALLSIGN');                       // too short
    bad('x'.repeat(17)).toThrow('BAD_CALLSIGN');            // too long
    bad('!!!').toThrow('BAD_CALLSIGN');                     // nothing left after filtering
    bad('shithead').toThrow('BAD_CALLSIGN');                // blocked word
    bad('fine name', 'gold').toThrow('BAD_CREW');
  });

  it('keeps the first callsign on a double join and only emits one join event', () => {
    h.withReducerTx(A, ctx => mod.clientConnected(ctx, {}));
    h.withReducerTx(A, ctx => mod.setProfile(ctx, { callsign: 'alice2', crew: 'green' }));
    const p = playerRow(A);
    expect(p.callsign).toBe('alice2');
    expect(p.credits).toBe(10_000n);
    const joins = h.withReducerTx(A, ctx => [...ctx.db.event.iter()].filter(e => e.kind === 'join' && e.actor.equals(ctx.sender)));
    expect(joins.length).toBe(1);
  });
});

describe('claim_object', () => {
  it('race: two identities claim the same object, exactly one wins', () => {
    claim(A, 'wasp-76-b');
    expect(() => claim(B, 'wasp-76-b')).toThrow('ALREADY_CLAIMED');
    const owners = h.withReducerTx(A, ctx => [...ctx.db.claim.iter()].filter(c => c.objectId === 'wasp-76-b'));
    expect(owners.length).toBe(1);
    expect(owners[0].owner.equals(playerRow(A).identity)).toBe(true);
    expect(playerRow(A).credits).toBe(10_000n - 900n);
    expect(playerRow(B).credits).toBe(10_000n);
  });

  it('rejects insufficient credits without side effects (claim and takeover)', () => {
    h.withReducerTx(ADMIN, ctx => mod.seedObjects(ctx, { objects: [
      { id: 'pricey', name: 'Pricey', system: 'P', x: 20, y: 0, z: 0, cls: 'rocky', priceCredits: 6000n, valueUsd: 1e22, auctionOnly: false, habitableZone: false },
      { id: 'too-much', name: 'Too Much', system: 'T', x: 21, y: 0, z: 0, cls: 'rocky', priceCredits: 10_001n, valueUsd: 1e23, auctionOnly: false, habitableZone: false },
    ] }));
    expect(() => claim(A, 'too-much')).toThrow('INSUFFICIENT_CREDITS');
    expect(playerRow(A).credits).toBe(10_000n);
    expect(playerRow(A).claimCount).toBe(0);
    expect(h.withReducerTx(A, ctx => ctx.db.claim.objectId.find('too-much'))).toBeNull();

    claim(A, 'pricey'); // A: 4000 left
    expect(() => takeover(B, 'pricey')).toThrow('INSUFFICIENT_CREDITS'); // costs 12000
    expect(playerRow(B).credits).toBe(10_000n);
    expect(playerRow(A).credits).toBe(4000n);
    expect(h.withReducerTx(A, ctx => ctx.db.claim.objectId.find('pricey')!.owner.equals(ctx.sender))).toBe(true);
  });

  it('rejects auction-only objects and unknown ids', () => {
    expect(() => claim(A, 'earth')).toThrow('AUCTION_ONLY');
    expect(() => claim(A, 'nope')).toThrow('UNKNOWN_OBJECT');
    expect(playerRow(A).credits).toBe(10_000n);
  });

  it('requires a profile', () => {
    const C = player('carol', 3n);
    h.withReducerTx(C, ctx => mod.clientConnected(ctx, {}));
    expect(() => claim(C, 'jupiter')).toThrow('NO_PROFILE');
  });
});

describe('hostile_takeover', () => {
  it('pays the previous owner 2x, moves the claim and updates both portfolios', () => {
    claim(A, 'wasp-76-b'); // A pays 900
    takeover(B, 'wasp-76-b'); // B pays 1800 to A
    const a = playerRow(A);
    const b = playerRow(B);
    expect(a.credits).toBe(10_000n - 900n + 1800n);
    expect(a.portfolioValue).toBe(0n);
    expect(a.claimCount).toBe(0);
    expect(b.credits).toBe(10_000n - 1800n);
    expect(b.portfolioValue).toBe(1800n);
    expect(b.claimCount).toBe(1);
    const c = h.withReducerTx(A, ctx => ctx.db.claim.objectId.find('wasp-76-b')!);
    expect(c.owner.equals(b.identity)).toBe(true);
    expect(c.pricePaid).toBe(1800n);
    const ev = h.withReducerTx(A, ctx => [...ctx.db.event.iter()].filter(e => e.kind === 'takeover'));
    expect(ev.length).toBe(1);
    expect(ev[0].amount).toBe(1800n);
    expect(ev[0].objectId).toBe('wasp-76-b');
    expect(achievements(B)).toContain('takeover_artist');
  });

  it('escalates: each takeover costs 2x the last price paid', () => {
    claim(A, 'wasp-76-b'); // 900
    takeover(B, 'wasp-76-b'); // 1800
    takeover(A, 'wasp-76-b'); // 3600
    const c = h.withReducerTx(ADMIN, ctx => ctx.db.claim.objectId.find('wasp-76-b')!);
    expect(c.pricePaid).toBe(3600n);
    expect(c.owner.equals(playerRow(A).identity)).toBe(true);
    expect(playerRow(A).credits).toBe(10_000n - 900n + 1800n - 3600n);
    expect(playerRow(B).credits).toBe(10_000n - 1800n + 3600n);
  });

  it('cannot undercut an open ask with a cheap takeover', () => {
    claim(A, 'wasp-76-b'); // A paid 900
    h.withReducerTx(A, ctx => mod.listForSale(ctx, { objectId: 'wasp-76-b', askCredits: 5000n }));
    // Catalog 2x would be 1800; ask floors the base so takeover is 10_000.
    takeover(B, 'wasp-76-b');
    const c = h.withReducerTx(ADMIN, ctx => ctx.db.claim.objectId.find('wasp-76-b')!);
    expect(c.pricePaid).toBe(10_000n);
    expect(c.forSale).toBe(false);
    expect(playerRow(B).credits).toBe(0n);
    expect(playerRow(A).credits).toBe(10_000n - 900n + 10_000n);
  });

  it('validates ownership and auction-only objects', () => {
    expect(() => takeover(B, 'wasp-76-b')).toThrow('NOT_CLAIMED');
    claim(A, 'wasp-76-b');
    expect(() => takeover(A, 'wasp-76-b')).toThrow('OWN_OBJECT');
    expect(() => takeover(B, 'earth')).toThrow('AUCTION_ONLY');
    expect(() => takeover(B, 'nope')).toThrow('UNKNOWN_OBJECT');
  });
});

describe('achievements', () => {
  it('awards first_claim once and hell_landlord at three hot worlds', () => {
    claim(A, 'wasp-76-b');
    expect(achievements(A)).toEqual(['first_claim']);
    claim(A, 'kelt-9-b');
    expect(achievements(A)).toEqual(['first_claim']);
    // Add a third hot world to the catalog and claim it.
    h.withReducerTx(ADMIN, ctx => mod.seedObjects(ctx, { objects: [
      { id: 'hd-189733-b', name: 'HD 189733 b', system: 'HD 189733', x: 9, y: 0, z: 0, cls: 'hot_jupiter', priceCredits: 700n, valueUsd: 1e20, auctionOnly: false, habitableZone: false },
    ] }));
    claim(A, 'hd-189733-b');
    expect(achievements(A)).toEqual(['first_claim', 'hell_landlord']);
    // Re-checking never duplicates.
    claim(A, 'jupiter');
    expect(achievements(A)).toEqual(['first_claim', 'hell_landlord']);
    const evs = h.withReducerTx(A, ctx => [...ctx.db.event.iter()].filter(e => e.kind === 'achievement'));
    expect(evs.map(e => e.objectId).sort()).toEqual(['first_claim', 'hell_landlord']);
  });
});

describe('auctions and income (gated by config flags)', () => {
  it('place_bid is DISABLED until auctions are enabled', () => {
    expect(() => h.withReducerTx(A, ctx => mod.placeBid(ctx, { objectId: 'mars', amount: 3000n }))).toThrow('DISABLED');
  });

  it('set_flags opens the rolling schedule and bids escrow and refund', () => {
    h.withReducerTx(ADMIN, ctx => mod.setFlags(ctx, { incomeEnabled: false, auctionsEnabled: true }));
    const open = h.withReducerTx(ADMIN, ctx => [...ctx.db.auction.iter()].filter(a => a.active));
    expect(open.map(a => a.objectId)).toEqual(['mars']);
    const timers = h.withReducerTx(ADMIN, ctx => [...ctx.db.auctionSchedule.iter()]);
    expect(timers.length).toBe(1);

    expect(() => h.withReducerTx(A, ctx => mod.placeBid(ctx, { objectId: 'mars', amount: 100n }))).toThrow('BID_TOO_LOW');
    expect(() => h.withReducerTx(A, ctx => mod.placeBid(ctx, { objectId: 'earth', amount: 9000n }))).toThrow('NO_AUCTION');
    h.withReducerTx(A, ctx => mod.placeBid(ctx, { objectId: 'mars', amount: 3000n }));
    expect(playerRow(A).credits).toBe(7000n);
    h.withReducerTx(B, ctx => mod.placeBid(ctx, { objectId: 'mars', amount: 3500n }));
    expect(playerRow(A).credits).toBe(10_000n); // refunded
    expect(playerRow(B).credits).toBe(6500n);
    expect(() => h.withReducerTx(A, ctx => mod.placeBid(ctx, { objectId: 'mars', amount: 3500n }))).toThrow('BID_TOO_LOW');

    // Settle: B wins Mars, Moon opens next.
    const timer = timers[0];
    h.withReducerTx(ADMIN, ctx => mod.settleAuction(ctx, { timer }));
    const b = playerRow(B);
    expect(b.claimCount).toBe(1);
    expect(b.portfolioValue).toBe(3500n);
    expect(b.credits).toBe(6500n);
    const mars = h.withReducerTx(ADMIN, ctx => ctx.db.claim.objectId.find('mars')!);
    expect(mars.owner.equals(b.identity)).toBe(true);
    const won = h.withReducerTx(ADMIN, ctx => [...ctx.db.event.iter()].filter(e => e.kind === 'auction_won'));
    expect(won.length).toBe(1);
    const nowOpen = h.withReducerTx(ADMIN, ctx => [...ctx.db.auction.iter()].filter(a => a.active));
    expect(nowOpen.map(a => a.objectId)).toEqual(['moon']);
  });

  it('pay_income is a no-op until enabled, then pays habitable planets 3x', () => {
    claim(A, 'wasp-76-b');     // 900 -> 9 per tick
    claim(B, 'trappist-1-e');  // 1200 habitable -> 36 per tick
    const timer = h.withReducerTx(ADMIN, ctx => [...ctx.db.incomeSchedule.iter()][0]);
    h.withReducerTx(ADMIN, ctx => mod.payIncome(ctx, { timer }));
    expect(playerRow(A).credits).toBe(9100n);
    h.withReducerTx(ADMIN, ctx => mod.setFlags(ctx, { incomeEnabled: true, auctionsEnabled: false }));
    h.withReducerTx(ADMIN, ctx => mod.payIncome(ctx, { timer }));
    expect(playerRow(A).credits).toBe(9109n);
    expect(playerRow(B).credits).toBe(8836n);
    const income = h.withReducerTx(ADMIN, ctx => [...ctx.db.event.iter()].filter(e => e.kind === 'income'));
    expect(income.length).toBe(2);
  });

  it('scheduled reducers reject non-scheduler callers', () => {
    const timer = h.withReducerTx(ADMIN, ctx => [...ctx.db.incomeSchedule.iter()][0]);
    expect(() => h.withReducerTx(A, ctx => mod.payIncome(ctx, { timer }))).toThrow('NOT_ADMIN');
    expect(() => h.withReducerTx(A, ctx => mod.setFlags(ctx, { incomeEnabled: true, auctionsEnabled: true }))).toThrow('NOT_ADMIN');
  });
});

describe('player market (fixed ask)', () => {
  it('lists, buys, and pays the seller', () => {
    claim(A, 'wasp-76-b');
    expect(() => h.withReducerTx(A, ctx => mod.listForSale(ctx, { objectId: 'wasp-76-b', askCredits: 100n }))).toThrow('ASK_TOO_LOW');
    h.withReducerTx(A, ctx => mod.listForSale(ctx, { objectId: 'wasp-76-b', askCredits: 1200n }));
    const listed = h.withReducerTx(A, ctx => ctx.db.claim.objectId.find('wasp-76-b')!);
    expect(listed.forSale).toBe(true);
    expect(listed.askCredits).toBe(1200n);

    expect(() => h.withReducerTx(A, ctx => mod.buyListing(ctx, { objectId: 'wasp-76-b' }))).toThrow('OWN_OBJECT');
    h.withReducerTx(B, ctx => mod.buyListing(ctx, { objectId: 'wasp-76-b' }));
    const a = playerRow(A);
    const b = playerRow(B);
    expect(a.credits).toBe(10_000n - 900n + 1200n);
    expect(a.claimCount).toBe(0);
    expect(b.credits).toBe(10_000n - 1200n);
    expect(b.claimCount).toBe(1);
    const sold = h.withReducerTx(ADMIN, ctx => ctx.db.claim.objectId.find('wasp-76-b')!);
    expect(sold.forSale).toBe(false);
    expect(sold.owner.equals(playerRow(B).identity)).toBe(true);
    const sales = h.withReducerTx(ADMIN, ctx => [...ctx.db.event.iter()].filter(e => e.kind === 'sale'));
    expect(sales.length).toBe(1);
  });

  it('lets the owner cancel a listing', () => {
    claim(A, 'jupiter');
    h.withReducerTx(A, ctx => mod.listForSale(ctx, { objectId: 'jupiter', askCredits: 2500n }));
    h.withReducerTx(A, ctx => mod.cancelListing(ctx, { objectId: 'jupiter' }));
    const row = h.withReducerTx(A, ctx => ctx.db.claim.objectId.find('jupiter')!);
    expect(row.forSale).toBe(false);
    expect(() => h.withReducerTx(B, ctx => mod.buyListing(ctx, { objectId: 'jupiter' }))).toThrow('NOT_FOR_SALE');
  });
});
