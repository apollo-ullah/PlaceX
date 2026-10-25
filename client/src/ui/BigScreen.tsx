// /big: venue display. Stats bar, full-height ticker, leaderboard, QR slot, live auction strip,
// and a SOLD flash when an auction settles. No landing, no card.
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCredits, useEvents, useObjects, useStats } from '../state';
import type { CelestialObject, EventView } from '../types';
import { LeaderboardPanel } from './Leaderboard';
import { TickerLine } from './Ticker';
import { Planet } from './Planet';
import { useActiveAuction, useNow } from './AuctionPanel';
import { fmtCountdown, isTickerEvent, objectName } from './format';

function AuctionStrip() {
  const live = useActiveAuction();
  const now = useNow();
  if (!live) return null;
  const { auction, obj } = live;
  const remaining = auction.endsAt - now;
  const urgent = remaining > 0 && remaining < 60_000;
  return (
    <div className={`px-glass px-big__auction ${urgent ? 'px-big__auction--urgent' : ''}`}>
      <Planet cls={obj.cls} size={110} />
      <div className="px-big__auction-main">
        <div className="px-big__auction-eyebrow"><i />Live auction</div>
        <div className="px-big__auction-name">{obj.name}</div>
        <div className="px-big__auction-sys">{obj.system === 'Sol' ? 'Solar System' : `Orbits ${obj.system}`} · opens at {formatCredits(obj.priceCredits)} cr</div>
      </div>
      <div className="px-big__auction-stat">
        <span>High bid</span>
        {auction.highBid > 0 ? (
          <>
            <b key={auction.highBid} className="px-mono px-gold px-big__auction-bid">{formatCredits(auction.highBid)}</b>
            <em>{auction.highBidderCallsign ?? 'anon'}</em>
          </>
        ) : <b className="px-big__auction-none">No bids yet</b>}
      </div>
      <div className="px-big__auction-stat px-big__auction-clock">
        <span>Gavel in</span>
        <b className="px-mono">{remaining > 0 ? fmtCountdown(remaining) : '0:00'}</b>
      </div>
    </div>
  );
}

function SoldFlash({ e, byId }: { e: EventView; byId: Map<string, CelestialObject> }) {
  return (
    <div className="px-big__sold" aria-live="assertive">
      <div className="px-big__sold-stamp">Sold</div>
      <div className="px-big__sold-line">
        <b>{objectName(byId, e.objectId)}</b> to <b className="px-gold">{e.actorCallsign}</b> for <span className="px-mono">{formatCredits(e.amount)} cr</span>
      </div>
    </div>
  );
}

function Num({ n, label, gold = false }: { n: number; label: string; gold?: boolean }) {
  return (
    <div className="px-big__num">
      <b className={`px-mono ${gold ? 'px-gold' : ''}`}>{n.toLocaleString('en-US')}</b>
      <span>{label}</span>
    </div>
  );
}

export function BigScreen() {
  const stats = useStats();
  const all = useEvents(100);
  const events = useMemo(() => all.filter(isTickerEvent).slice(0, 40), [all]);
  const { byId } = useObjects();
  const [tab, setTab] = useState<'value' | 'count'>('value');
  const [qrOk, setQrOk] = useState(true);
  const newest = useRef<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [sold, setSold] = useState<EventView | null>(null);

  // Rotate the leaderboard tab so both views get airtime.
  useEffect(() => {
    const id = setInterval(() => setTab(t => (t === 'value' ? 'count' : 'value')), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const top = events[0]?.id ?? null;
    if (top && top !== newest.current) {
      const first = newest.current === null;
      newest.current = top;
      setFresh(top);
      if (!first && events[0].kind === 'auction_won') setSold(events[0]);
      const t = setTimeout(() => setFresh(null), 2500);
      return () => clearTimeout(t);
    }
  }, [events]);

  useEffect(() => {
    if (!sold) return;
    const t = setTimeout(() => setSold(null), 7000);
    return () => clearTimeout(t);
  }, [sold]);

  const origin = typeof window !== 'undefined' ? window.location.origin.replace(/^https?:\/\//, '') : 'placex';

  return (
    <div className="px-big">
      <div className="px-glass px-big__stats">
        <div className="px-big__brand"><i />PlaceX <small>Real estate for the real universe</small></div>
        <div className="px-big__nums">
          <Num n={stats.players} label="players" />
          <Num n={stats.claims} label="planets claimed" gold />
          <Num n={stats.online} label="online now" />
          <div className="px-big__num"><b className="px-mono">{formatCredits(stats.totalValue)}</b><span>credits deployed</span></div>
        </div>
        <div className="px-big__live"><i />Live</div>
      </div>

      <div className="px-glass px-big__ticker">
        <div className="px-ticker__head"><i /><span className="px-label">Live claims</span></div>
        <div className="px-big__lines">
          {events.length === 0 && <div className="px-big__line">Quiet out here. Scan the code and make the first move.</div>}
          {events.map(e => <TickerLine key={e.id} e={e} byId={byId} me={null} big fresh={e.id === fresh} />)}
        </div>
      </div>

      <div className="px-glass px-big__lb">
        <LeaderboardPanel tab={tab} onTab={setTab} limit={12} />
      </div>

      <div className="px-glass px-big__qr">
        {qrOk
          ? <img src="/qr.png" alt="QR code to play PlaceX" onError={() => setQrOk(false)} />
          : <div className="px-big__qr-fallback"><span>Scan to play</span></div>}
        <div className="px-big__qr-copy">
          <b>Claim a planet from your phone.</b>
          <p>Scan the code, pick a callsign, own a real exoplanet before the person next to you does.</p>
          <p className="px-mono">{origin}</p>
        </div>
      </div>

      <AuctionStrip />
      {sold && <SoldFlash key={sold.id} e={sold} byId={byId} />}
    </div>
  );
}
