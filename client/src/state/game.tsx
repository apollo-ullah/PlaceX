// Game state context and hooks. Owned by the lead. UI, scene and audio agents read
// state only through these hooks and never import spacetimedb directly.
import { createContext, useContext, useMemo } from 'react';
import type {
  AchievementView, AuctionView, ClaimView, Crew, EventView, LeaderboardEntry,
  LiveStats, PlayerView, PresenceView, ReducerError,
} from '../types';

export interface GameActions {
  setProfile: (callsign: string, crew: Crew) => Promise<void>;
  claim: (objectId: string) => Promise<void>;
  takeover: (objectId: string) => Promise<void>;
  bid: (objectId: string, amount: number) => Promise<void>;
  listForSale: (objectId: string, askCredits: number) => Promise<void>;
  cancelListing: (objectId: string) => Promise<void>;
  buyListing: (objectId: string) => Promise<void>;
  /** Throttled to 5 Hz inside the provider. Safe to call every frame. */
  sendPresence: (targetObjectId: string, x: number, y: number, z: number) => void;
}

export interface GameState {
  mode: 'live' | 'mock';
  connected: boolean;
  connectionError: string | null;
  identity: string | null;
  me: PlayerView | null;
  /** True once the player has chosen a callsign. */
  hasProfile: boolean;
  players: PlayerView[];
  claims: Map<string, ClaimView>;
  /** Newest first. */
  events: EventView[];
  /** Only rows updated in the last 30 seconds, excluding self. */
  presence: PresenceView[];
  auctions: AuctionView[];
  achievements: AchievementView[];
  stats: LiveStats;
  actions: GameActions;
}

export const GameContext = createContext<GameState | null>(null);

export function useGame(): GameState {
  const g = useContext(GameContext);
  if (!g) throw new Error('useGame must be used inside <GameProvider>');
  return g;
}

export function useConnection() {
  const { connected, connectionError, identity, mode } = useGame();
  return { connected, connectionError, identity, mode };
}

export function usePlayer(): PlayerView | null {
  return useGame().me;
}

export function useHasProfile(): boolean {
  return useGame().hasProfile;
}

/** Map of objectId to claim. */
export function useClaims(): Map<string, ClaimView> {
  return useGame().claims;
}

export function useClaim(objectId: string | null | undefined): ClaimView | undefined {
  const claims = useClaims();
  return objectId ? claims.get(objectId) : undefined;
}

/** Claims owned by the current player. */
export function useMyClaims(): ClaimView[] {
  const { claims, identity } = useGame();
  return useMemo(() => {
    if (!identity) return [];
    const out: ClaimView[] = [];
    for (const c of claims.values()) if (c.owner === identity) out.push(c);
    return out.sort((a, b) => b.claimedAt - a.claimedAt);
  }, [claims, identity]);
}

export function useLeaderboard(by: 'value' | 'count' = 'value', limit = 20): LeaderboardEntry[] {
  const { players } = useGame();
  return useMemo(() => {
    const rows = players
      .filter(p => p.callsign.length > 0)
      .map(p => ({
        identity: p.identity, callsign: p.callsign, crew: p.crew,
        portfolioValue: p.portfolioValue, claimCount: p.claimCount, online: p.online,
      }));
    rows.sort((a, b) =>
      by === 'value'
        ? b.portfolioValue - a.portfolioValue || b.claimCount - a.claimCount
        : b.claimCount - a.claimCount || b.portfolioValue - a.portfolioValue
    );
    return rows.slice(0, limit);
  }, [players, by, limit]);
}

export function useEvents(limit = 50): EventView[] {
  const { events } = useGame();
  return useMemo(() => events.slice(0, limit), [events, limit]);
}

export function usePresence(): PresenceView[] {
  return useGame().presence;
}

export function useAuctions(): AuctionView[] {
  return useGame().auctions;
}

export function useAchievements(): AchievementView[] {
  const { achievements, identity } = useGame();
  return useMemo(() => achievements.filter(a => a.identity === identity), [achievements, identity]);
}

export function useStats(): LiveStats {
  return useGame().stats;
}

export function useActions(): GameActions {
  return useGame().actions;
}

const KNOWN_ERRORS: ReducerError[] = [
  'ALREADY_CLAIMED', 'INSUFFICIENT_CREDITS', 'AUCTION_ONLY', 'UNKNOWN_OBJECT', 'NO_PROFILE',
  'BAD_CALLSIGN', 'BAD_CREW', 'NOT_CLAIMED', 'OWN_OBJECT', 'NOT_OWNER', 'NO_AUCTION', 'AUCTION_ENDED',
  'BID_TOO_LOW', 'ASK_TOO_LOW', 'NOT_FOR_SALE', 'NOT_ADMIN', 'DISABLED',
];

/** Rent paid each income tick for one holding (mirrors the server formula). */
export function rentPerMinute(pricePaid: number, habitableZone: boolean): number {
  const pct = habitableZone ? 3 : 1;
  return Math.max(1, Math.floor(pricePaid * pct / 100));
}

/** Extract a known reducer error code from a rejected action, or null. */
export function reducerErrorCode(err: unknown): ReducerError | null {
  const msg = err instanceof Error ? err.message : String(err);
  for (const code of KNOWN_ERRORS) if (msg.includes(code)) return code;
  return null;
}

export function formatCredits(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return Math.round(n).toLocaleString('en-US');
}

export function formatUsd(v: number): string {
  if (!isFinite(v) || v <= 0) return '$0';
  const units: [number, string][] = [
    [1e33, ' decillion'], [1e30, ' nonillion'], [1e27, ' octillion'], [1e24, ' septillion'],
    [1e21, ' sextillion'], [1e18, ' quintillion'], [1e15, ' quadrillion'], [1e12, ' trillion'],
    [1e9, ' billion'], [1e6, ' million'],
  ];
  for (const [u, label] of units) if (v >= u) return `$${(v / u).toFixed(1)}${label}`;
  return `$${Math.round(v).toLocaleString('en-US')}`;
}
