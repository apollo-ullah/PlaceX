// Leaderboard: tabs "By value" and "By count". Collapsible panel on the right.
import { useState, type CSSProperties } from 'react';
import { formatCredits, useConnection, useLeaderboard } from '../state';
import { CREWS } from '../types';

type Tab = 'value' | 'count';

export function LeaderboardPanel({ tab, onTab, limit = 20, showHead = true }: { tab: Tab; onTab: (t: Tab) => void; limit?: number; showHead?: boolean }) {
  const rows = useLeaderboard(tab, limit);
  const { identity } = useConnection();
  return (
    <>
      {showHead && (
        <div className="px-lb__head">
          <span className="px-label">Top owners</span>
          <Tabs tab={tab} onTab={onTab} />
        </div>
      )}
      <div className="px-lb__list">
        {rows.length === 0 && <div className="px-lb__empty">Nobody owns anything yet. Be the first landlord.</div>}
        {rows.map((r, i) => (
          <div key={r.identity} className={`px-lb__row ${r.identity === identity ? 'px-lb__row--me' : ''}`}>
            <span className="px-lb__rank px-mono">{i + 1}</span>
            <span className={`px-lb__dot ${r.online ? '' : 'px-lb__dot--off'}`} style={{ '--c': CREWS[r.crew].color } as CSSProperties} title={r.online ? 'online' : 'offline'} />
            <span className="px-lb__name">{r.callsign}{r.identity === identity && <small>you</small>}</span>
            <span className="px-lb__val px-mono">
              {tab === 'value' ? <>{formatCredits(r.portfolioValue)}<small>cr</small></> : <>{r.claimCount}<small>{r.claimCount === 1 ? 'planet' : 'planets'}</small></>}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

export function Tabs({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <div className="px-tabs" role="tablist">
      <button type="button" role="tab" aria-selected={tab === 'value'} className={`px-tab ${tab === 'value' ? 'px-tab--on' : ''}`} onClick={() => onTab('value')}>By value</button>
      <button type="button" role="tab" aria-selected={tab === 'count'} className={`px-tab ${tab === 'count' ? 'px-tab--on' : ''}`} onClick={() => onTab('count')}>By count</button>
    </div>
  );
}

export function Leaderboard() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('value');
  const rows = useLeaderboard('value', 1);
  const leader = rows[0];
  return (
    <div style={{ position: 'relative', justifySelf: 'end' }}>
      <button
        type="button"
        className={`px-glass px-btn px-lb-toggle ${open ? 'px-btn--pressed' : ''}`}
        style={{ paddingLeft: 12, paddingRight: 14 }}
        aria-expanded={open}
        aria-label="Toggle leaderboard"
        onClick={() => setOpen(o => !o)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={open ? 'var(--gold)' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" /></svg>
        {leader && !open ? <span style={{ color: CREWS[leader.crew].color, fontSize: 13 }}>{leader.callsign}</span> : <span style={{ fontSize: 13 }}>Top</span>}
      </button>
      <div className={`px-glass px-lb ${open ? '' : 'px-lb--closed'}`} aria-hidden={!open}>
        <LeaderboardPanel tab={tab} onTab={setTab} />
      </div>
    </div>
  );
}
