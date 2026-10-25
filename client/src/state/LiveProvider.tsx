// Live SpacetimeDB-backed provider. Owned by the lead.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SpacetimeDBProvider, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { DbConnection, tables } from '../bindings';
import type { Identity, Timestamp } from 'spacetimedb';
import { GameContext, type GameActions, type GameState } from './game';
import type {
  AchievementKind, AchievementView, AuctionView, ClaimView, Crew, EventKind, EventView,
  PlayerView, PresenceView,
} from '../types';
import { CREWS } from '../types';

const TOKEN_KEY = 'placex.token';
const PRESENCE_MS = 200;          // 5 Hz
const PRESENCE_TTL_MS = 30_000;

export const STDB_URI = import.meta.env.VITE_STDB_URI ?? 'ws://127.0.0.1:3000';
export const STDB_DB = import.meta.env.VITE_STDB_DB ?? 'placex-local';

function readToken(): string | undefined {
  try { return localStorage.getItem(TOKEN_KEY) ?? undefined; } catch { return undefined; }
}
function saveToken(t: string) {
  try { localStorage.setItem(TOKEN_KEY, t); } catch { /* private mode */ }
}

const builder = DbConnection.builder()
  .withUri(STDB_URI)
  .withDatabaseName(STDB_DB)
  .withToken(readToken())
  .withAutomaticReconnect()
  .onConnect((_conn, identity, token) => {
    saveToken(token);
    console.info('[placex] connected as', identity.toHexString());
  })
  .onConnectError((_ctx, err) => {
    console.error('[placex] connect error', err);
    // A stale token is the usual cause; drop it so the next load gets a fresh identity.
    if (/token|auth|401/i.test(String(err))) { try { localStorage.removeItem(TOKEN_KEY); } catch { /* noop */ } }
  });

export function LiveProvider({ children }: { children: ReactNode }) {
  return (
    <SpacetimeDBProvider connectionBuilder={builder}>
      <LiveState>{children}</LiveState>
    </SpacetimeDBProvider>
  );
}

const ms = (t: Timestamp) => Number(t.toMillis());
const hex = (i: Identity) => i.toHexString();
const asCrew = (c: string): Crew => (c in CREWS ? (c as Crew) : 'blue');

function LiveState({ children }: { children: ReactNode }) {
  const conn = useSpacetimeDB();
  const [players] = useTable(tables.player);
  const [claims] = useTable(tables.claim);
  const [events] = useTable(tables.event);
  const [presenceRows] = useTable(tables.presence);
  const [auctions] = useTable(tables.auction);
  const [achievements] = useTable(tables.achievement);

  const identity = conn.identity ? hex(conn.identity) : null;

  // Tick every 5 s so stale presence rows age out of the view.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const playerViews = useMemo<PlayerView[]>(
    () => players.map(p => ({
      identity: hex(p.identity),
      callsign: p.callsign,
      crew: asCrew(p.crew),
      credits: Number(p.credits),
      portfolioValue: Number(p.portfolioValue),
      claimCount: p.claimCount,
      online: p.online,
      joinedAt: ms(p.joinedAt),
    })),
    [players]
  );

  const playersById = useMemo(() => {
    const m = new Map<string, PlayerView>();
    for (const p of playerViews) m.set(p.identity, p);
    return m;
  }, [playerViews]);

  const me = identity ? playersById.get(identity) ?? null : null;

  const claimMap = useMemo(() => {
    const m = new Map<string, ClaimView>();
    for (const c of claims) {
      const owner = hex(c.owner);
      const p = playersById.get(owner);
      m.set(c.objectId, {
        objectId: c.objectId,
        owner,
        ownerCallsign: p?.callsign ?? '???',
        ownerCrew: p?.crew ?? 'blue',
        pricePaid: Number(c.pricePaid),
        claimedAt: ms(c.claimedAt),
      });
    }
    return m;
  }, [claims, playersById]);

  const eventViews = useMemo<EventView[]>(
    () => events
      .map(e => ({
        id: e.id.toString(),
        kind: e.kind as EventKind,
        actor: hex(e.actor),
        actorCallsign: e.actorCallsign,
        objectId: e.objectId,
        amount: Number(e.amount),
        ts: ms(e.ts),
      }))
      .sort((a, b) => b.ts - a.ts || (a.id < b.id ? 1 : -1)),
    [events]
  );

  const presence = useMemo<PresenceView[]>(
    () => presenceRows
      .filter(r => now - ms(r.updatedAt) < PRESENCE_TTL_MS && hex(r.identity) !== identity)
      .map(r => {
        const id = hex(r.identity);
        const p = playersById.get(id);
        return {
          identity: id,
          callsign: p?.callsign ?? '???',
          crew: p?.crew ?? 'blue',
          targetObjectId: r.targetObjectId,
          x: r.camX, y: r.camY, z: r.camZ,
          updatedAt: ms(r.updatedAt),
        };
      }),
    [presenceRows, playersById, identity, now]
  );

  const auctionViews = useMemo<AuctionView[]>(
    () => auctions.map(a => {
      const bidder = a.highBidder ? hex(a.highBidder) : null;
      return {
        objectId: a.objectId,
        endsAt: ms(a.endsAt),
        highBid: Number(a.highBid),
        highBidder: bidder,
        highBidderCallsign: bidder ? playersById.get(bidder)?.callsign ?? null : null,
        active: a.active,
      };
    }),
    [auctions, playersById]
  );

  const achievementViews = useMemo<AchievementView[]>(
    () => achievements.map(a => ({ identity: hex(a.identity), kind: a.kind as AchievementKind, earnedAt: ms(a.earnedAt) })),
    [achievements]
  );

  const stats = useMemo(() => {
    let totalValue = 0;
    for (const c of claimMap.values()) totalValue += c.pricePaid;
    return {
      players: playerViews.filter(p => p.callsign.length > 0).length,
      online: playerViews.filter(p => p.online).length,
      claims: claimMap.size,
      totalValue,
    };
  }, [playerViews, claimMap]);

  const lastPresence = useRef(0);
  const getConnection = conn.getConnection;
  const actions = useMemo<GameActions>(() => {
    const reducers = () => {
      const c = getConnection();
      if (!c) throw new Error('NOT_CONNECTED');
      return c.reducers;
    };
    return {
      setProfile: (callsign, crew) => reducers().setProfile({ callsign, crew }),
      claim: objectId => reducers().claimObject({ objectId }),
      takeover: objectId => reducers().hostileTakeover({ objectId }),
      bid: (objectId, amount) => reducers().placeBid({ objectId, amount: BigInt(Math.round(amount)) }),
      sendPresence: (targetObjectId, x, y, z) => {
        const t = Date.now();
        if (t - lastPresence.current < PRESENCE_MS) return;
        lastPresence.current = t;
        const c = getConnection();
        if (!c || !conn.isActive) return;
        void c.reducers.updatePresence({ targetObjectId, x, y, z }).catch(() => { /* presence is best effort */ });
      },
    };
  }, [getConnection, conn.isActive]);

  const value = useMemo<GameState>(() => ({
    mode: 'live',
    connected: conn.isActive,
    connectionError: conn.connectionError ? String(conn.connectionError) : null,
    identity,
    me,
    hasProfile: !!me && me.callsign.length > 0,
    players: playerViews,
    claims: claimMap,
    events: eventViews,
    presence,
    auctions: auctionViews,
    achievements: achievementViews,
    stats,
    actions,
  }), [conn.isActive, conn.connectionError, identity, me, playerViews, claimMap, eventViews, presence, auctionViews, achievementViews, stats, actions]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
