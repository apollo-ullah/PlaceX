// Mock provider: same contract as LiveProvider, backed by local state and objects.json.
// Lets UI, scene and audio agents work before the backend is live. Enable with VITE_MOCK=1.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { GameContext, type GameActions, type GameState } from './game';
import { useObjectsStore } from './objects';
import type { AuctionView, ClaimView, Crew, EventView, PlayerView, PresenceView } from '../types';
import { CREW_IDS, STARTING_CREDITS, takeoverCost } from '../types';

const ME = 'c200ffffffffffffffffffffffffffffffffffffffffffffffffffffffff0001';
const BOT_NAMES = ['ady', 'nova', 'kepler', 'ziggy', 'orbit', 'luna', 'quasar', 'pixel'];

function bot(i: number): PlayerView {
  return {
    identity: `c200bot${i.toString(16).padStart(56, '0')}`,
    callsign: BOT_NAMES[i % BOT_NAMES.length],
    crew: CREW_IDS[i % CREW_IDS.length],
    credits: STARTING_CREDITS - 1200 * (i + 1),
    portfolioValue: 1200 * (i + 1),
    claimCount: i + 1,
    online: i % 3 !== 0,
    joinedAt: Date.now() - i * 60_000,
  };
}

export function MockProvider({ children }: { children: ReactNode }) {
  const { list, byId, loaded } = useObjectsStore();
  useEffect(() => { void useObjectsStore.getState().load(); }, []);

  const [me, setMe] = useState<PlayerView>({
    identity: ME, callsign: '', crew: 'blue', credits: STARTING_CREDITS,
    portfolioValue: 0, claimCount: 0, online: true, joinedAt: Date.now(),
  });
  const [bots, setBots] = useState<PlayerView[]>(() => Array.from({ length: 8 }, (_, i) => bot(i)));
  const [claims, setClaims] = useState<Map<string, ClaimView>>(new Map());
  const [events, setEvents] = useState<EventView[]>([]);
  const [presence, setPresence] = useState<PresenceView[]>([]);
  const [auctions, setAuctions] = useState<AuctionView[]>([]);
  const seeded = useRef(false);
  const auctionsRef = useRef(auctions);
  auctionsRef.current = auctions;
  const meRef = useRef(me);
  meRef.current = me;

  const push = useCallback((e: Omit<EventView, 'id' | 'ts'>) => {
    setEvents(prev => [{ ...e, id: String(Date.now() + Math.random()), ts: Date.now() }, ...prev].slice(0, 200));
  }, []);

  // Seed some bot claims and keep a slow trickle going so the ticker moves.
  useEffect(() => {
    if (!loaded || seeded.current || list.length === 0) return;
    seeded.current = true;
    const claimable = list.filter(o => !o.auctionOnly);
    const pick = () => claimable[Math.floor(Math.random() * claimable.length)];
    const botClaim = () => {
      const o = pick();
      const b = bots[Math.floor(Math.random() * bots.length)];
      setClaims(prev => {
        if (prev.has(o.id)) return prev;
        const next = new Map(prev);
        next.set(o.id, { objectId: o.id, owner: b.identity, ownerCallsign: b.callsign, ownerCrew: b.crew, pricePaid: o.priceCredits, claimedAt: Date.now(), forSale: false, askCredits: 0 });
        return next;
      });
      push({ kind: 'claim', actor: b.identity, actorCallsign: b.callsign, objectId: o.id, amount: o.priceCredits });
    };
    for (let i = 0; i < 12; i++) botClaim();
    const id = setInterval(botClaim, 6000);
    const pid = setInterval(() => {
      setPresence(bots.filter(b => b.online).map(b => {
        const o = pick();
        return { identity: b.identity, callsign: b.callsign, crew: b.crew, targetObjectId: o.id, x: o.x, y: o.y, z: o.z, updatedAt: Date.now() };
      }));
    }, 4000);

    // One live auction (Mars, else the first auction-only object) with a standing bot bid.
    // Ends in 10 minutes; `?auctionSecs=45` shortens it to demo settlement.
    const prize = list.find(o => o.id === 'mars') ?? list.find(o => o.auctionOnly);
    const secs = Number(new URLSearchParams(window.location.search).get('auctionSecs')) || 600;
    if (prize) {
      const b = bots[1];
      setAuctions([{
        objectId: prize.id, endsAt: Date.now() + secs * 1000, highBid: prize.priceCredits + 150,
        highBidder: b.identity, highBidderCallsign: b.callsign, active: true,
      }]);
    }
    // Bots occasionally outbid; settle when the clock runs out.
    let tick = 0;
    const aid = setInterval(() => {
      const now = Date.now();
      tick++;
      for (const a of auctionsRef.current) {
        if (!a.active) continue;
        if (now >= a.endsAt) {
          setAuctions(prev => prev.map(x => x.objectId === a.objectId ? { ...x, active: false } : x));
          if (a.highBidder) {
            const isMe = a.highBidder === ME;
            const crew = isMe ? meRef.current.crew : bots.find(b => b.identity === a.highBidder)?.crew ?? 'red';
            const callsign = a.highBidderCallsign ?? 'someone';
            setClaims(prev => new Map(prev).set(a.objectId, { objectId: a.objectId, owner: a.highBidder!, ownerCallsign: callsign, ownerCrew: crew, pricePaid: a.highBid, claimedAt: now, forSale: false, askCredits: 0 }));
            if (isMe) setMe(m => ({ ...m, portfolioValue: m.portfolioValue + a.highBid, claimCount: m.claimCount + 1 }));
            push({ kind: 'auction_won', actor: a.highBidder, actorCallsign: callsign, objectId: a.objectId, amount: a.highBid });
          }
        } else if (tick % 15 === 0 && Math.random() < 0.45) {
          const b = bots[Math.floor(Math.random() * bots.length)];
          if (b.identity === a.highBidder) continue;
          const amount = a.highBid + 50 + Math.floor(Math.random() * 3) * 50;
          if (a.highBidder === ME) setMe(m => ({ ...m, credits: m.credits + a.highBid }));
          setAuctions(prev => prev.map(x => x.objectId === a.objectId ? { ...x, highBid: amount, highBidder: b.identity, highBidderCallsign: b.callsign } : x));
          push({ kind: 'bid', actor: b.identity, actorCallsign: b.callsign, objectId: a.objectId, amount });
        }
      }
    }, 1000);
    return () => { clearInterval(id); clearInterval(pid); clearInterval(aid); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, list.length]);

  const actions = useMemo<GameActions>(() => ({
    setProfile: async (callsign, crew: Crew) => {
      const clean = callsign.trim();
      if (clean.length < 2 || clean.length > 16) throw new Error('BAD_CALLSIGN');
      setMe(m => ({ ...m, callsign: clean, crew }));
      push({ kind: 'join', actor: ME, actorCallsign: clean, objectId: '', amount: 0 });
    },
    claim: async objectId => {
      const o = byId.get(objectId);
      if (!o) throw new Error('UNKNOWN_OBJECT');
      if (!me.callsign) throw new Error('NO_PROFILE');
      if (o.auctionOnly) throw new Error('AUCTION_ONLY');
      if (claims.has(objectId)) throw new Error('ALREADY_CLAIMED');
      if (me.credits < o.priceCredits) throw new Error('INSUFFICIENT_CREDITS');
      await new Promise(r => setTimeout(r, 120));
      setClaims(prev => new Map(prev).set(objectId, { objectId, owner: ME, ownerCallsign: me.callsign, ownerCrew: me.crew, pricePaid: o.priceCredits, claimedAt: Date.now(), forSale: false, askCredits: 0 }));
      setMe(m => ({ ...m, credits: m.credits - o.priceCredits, portfolioValue: m.portfolioValue + o.priceCredits, claimCount: m.claimCount + 1 }));
      push({ kind: 'claim', actor: ME, actorCallsign: me.callsign, objectId, amount: o.priceCredits });
    },
    takeover: async objectId => {
      const o = byId.get(objectId);
      const c = claims.get(objectId);
      if (!o) throw new Error('UNKNOWN_OBJECT');
      if (!c) throw new Error('NOT_CLAIMED');
      if (c.owner === ME) throw new Error('OWN_OBJECT');
      const cost = takeoverCost(c.pricePaid, o.priceCredits, { forSale: c.forSale, askCredits: c.askCredits });
      if (me.credits < cost) throw new Error('INSUFFICIENT_CREDITS');
      await new Promise(r => setTimeout(r, 120));
      setClaims(prev => new Map(prev).set(objectId, { objectId, owner: ME, ownerCallsign: me.callsign, ownerCrew: me.crew, pricePaid: cost, claimedAt: Date.now(), forSale: false, askCredits: 0 }));
      setMe(m => ({ ...m, credits: m.credits - cost, portfolioValue: m.portfolioValue + cost, claimCount: m.claimCount + 1 }));
      setBots(bs => bs.map(b => b.identity === c.owner ? { ...b, credits: b.credits + cost, claimCount: Math.max(0, b.claimCount - 1) } : b));
      push({ kind: 'takeover', actor: ME, actorCallsign: me.callsign, objectId, amount: cost });
    },
    listForSale: async (objectId, askCredits) => {
      const o = byId.get(objectId);
      const c = claims.get(objectId);
      if (!o) throw new Error('UNKNOWN_OBJECT');
      if (!c) throw new Error('NOT_CLAIMED');
      if (c.owner !== ME) throw new Error('NOT_OWNER');
      const floor = Math.max(o.priceCredits, c.pricePaid);
      if (askCredits < floor) throw new Error('ASK_TOO_LOW');
      setClaims(prev => new Map(prev).set(objectId, { ...c, forSale: true, askCredits }));
      push({ kind: 'listed', actor: ME, actorCallsign: me.callsign, objectId, amount: askCredits });
    },
    cancelListing: async objectId => {
      const c = claims.get(objectId);
      if (!c) throw new Error('NOT_CLAIMED');
      if (c.owner !== ME) throw new Error('NOT_OWNER');
      if (!c.forSale) throw new Error('NOT_FOR_SALE');
      setClaims(prev => new Map(prev).set(objectId, { ...c, forSale: false, askCredits: 0 }));
    },
    buyListing: async objectId => {
      const c = claims.get(objectId);
      if (!c) throw new Error('NOT_CLAIMED');
      if (!c.forSale) throw new Error('NOT_FOR_SALE');
      if (c.owner === ME) throw new Error('OWN_OBJECT');
      if (me.credits < c.askCredits) throw new Error('INSUFFICIENT_CREDITS');
      const cost = c.askCredits;
      await new Promise(r => setTimeout(r, 120));
      setClaims(prev => new Map(prev).set(objectId, { objectId, owner: ME, ownerCallsign: me.callsign, ownerCrew: me.crew, pricePaid: cost, claimedAt: Date.now(), forSale: false, askCredits: 0 }));
      setMe(m => ({ ...m, credits: m.credits - cost, portfolioValue: m.portfolioValue + cost, claimCount: m.claimCount + 1 }));
      setBots(bs => bs.map(b => b.identity === c.owner ? { ...b, credits: b.credits + cost, claimCount: Math.max(0, b.claimCount - 1) } : b));
      push({ kind: 'sale', actor: ME, actorCallsign: me.callsign, objectId, amount: cost });
    },
    bid: async (objectId, amount) => {
      const o = byId.get(objectId);
      if (!o) throw new Error('UNKNOWN_OBJECT');
      if (!me.callsign) throw new Error('NO_PROFILE');
      const a = auctionsRef.current.find(x => x.objectId === objectId);
      if (!a || !a.active) throw new Error('NO_AUCTION');
      if (Date.now() >= a.endsAt) throw new Error('AUCTION_ENDED');
      if (amount < o.priceCredits || amount <= a.highBid) throw new Error('BID_TOO_LOW');
      const top = a.highBidder === ME;
      const cost = top ? amount - a.highBid : amount;
      if (me.credits < cost) throw new Error('INSUFFICIENT_CREDITS');
      await new Promise(r => setTimeout(r, 120));
      setMe(m => ({ ...m, credits: m.credits - cost }));
      if (!top && a.highBidder) setBots(bs => bs.map(b => b.identity === a.highBidder ? { ...b, credits: b.credits + a.highBid } : b));
      setAuctions(prev => prev.map(x => x.objectId === objectId ? { ...x, highBid: amount, highBidder: ME, highBidderCallsign: me.callsign } : x));
      push({ kind: 'bid', actor: ME, actorCallsign: me.callsign, objectId, amount });
    },
    sendPresence: () => { /* no-op in mock */ },
  }), [byId, claims, me, push]);

  const players = useMemo(() => [me, ...bots], [me, bots]);

  const value = useMemo<GameState>(() => ({
    mode: 'mock',
    connected: true,
    connectionError: null,
    identity: ME,
    me,
    hasProfile: me.callsign.length > 0,
    players,
    claims,
    events,
    presence,
    auctions,
    achievements: [],
    stats: {
      players: players.length,
      online: players.filter(p => p.online).length,
      claims: claims.size,
      totalValue: [...claims.values()].reduce((s, c) => s + c.pricePaid, 0),
    },
    actions,
  }), [me, players, claims, events, presence, auctions, actions]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
