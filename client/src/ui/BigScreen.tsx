// /big: venue display. Stats bar, full-height ticker, leaderboard, QR slot. No landing, no card.
import { useEffect, useRef, useState } from 'react';
import { formatCredits, useEvents, useObjects, useStats } from '../state';
import { LeaderboardPanel } from './Leaderboard';
import { TickerLine } from './Ticker';

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
  const events = useEvents(40);
  const { byId } = useObjects();
  const [tab, setTab] = useState<'value' | 'count'>('value');
  const [qrOk, setQrOk] = useState(true);
  const newest = useRef<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  // Rotate the leaderboard tab so both views get airtime.
  useEffect(() => {
    const id = setInterval(() => setTab(t => (t === 'value' ? 'count' : 'value')), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const top = events[0]?.id ?? null;
    if (top && top !== newest.current) {
      newest.current = top;
      setFresh(top);
      const t = setTimeout(() => setFresh(null), 2500);
      return () => clearTimeout(t);
    }
  }, [events]);

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
    </div>
  );
}
