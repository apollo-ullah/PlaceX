// Live ticker: newest event at the top.
import { useConnection, useEvents, useObjects } from '../state';
import type { CelestialObject, EventView } from '../types';
import { tickerParts } from './format';

export function TickerLine({ e, byId, me, big = false, fresh = false }: { e: EventView; byId: Map<string, CelestialObject>; me: string | null; big?: boolean; fresh?: boolean }) {
  const p = tickerParts(e, byId);
  const base = big ? 'px-big__line' : 'px-ticker__line';
  const cls = [base, p.kind === 'takeover' && `${base}--takeover`, e.actor === me && `${base}--me`, fresh && big && `${base}--new`].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <b>{p.actor}</b> {p.verb}{p.object && <> <b>{p.object}</b></>}{p.amount && <> for <span className="px-mono">{p.amount}</span></>}
    </div>
  );
}

export function Ticker() {
  const events = useEvents(30);
  const { byId } = useObjects();
  const { identity } = useConnection();
  return (
    <div className="px-glass px-ticker" aria-live="polite" aria-label="Live claims">
      <div className="px-ticker__head"><i /><span className="px-label">Live</span></div>
      <div className="px-ticker__list">
        {events.length === 0 && <div className="px-ticker__empty">Quiet out here. Make the first move.</div>}
        {events.map(e => <TickerLine key={e.id} e={e} byId={byId} me={identity} />)}
      </div>
    </div>
  );
}
