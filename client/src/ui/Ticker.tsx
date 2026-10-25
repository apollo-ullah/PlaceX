// Live ticker: newest event at the top.
import { useMemo } from 'react';
import { useConnection, useEvents, useObjects } from '../state';
import type { CelestialObject, EventView } from '../types';
import { isTickerEvent, tickerParts } from './format';

export function TickerLine({ e, byId, me, big = false, fresh = false }: { e: EventView; byId: Map<string, CelestialObject>; me: string | null; big?: boolean; fresh?: boolean }) {
  const p = tickerParts(e, byId);
  const base = big ? 'px-big__line' : 'px-ticker__line';
  const cls = [base, p.kind === 'takeover' && `${base}--takeover`, p.kind === 'auction_won' && `${base}--won`, p.kind === 'bid' && `${base}--bid`, e.actor === me && `${base}--me`, fresh && big && `${base}--new`].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <b>{p.actor}</b> {p.verb}{p.object && <> <b>{p.object}</b></>}{p.amount && <> for <span className="px-mono">{p.amount}</span></>}
    </div>
  );
}

export function Ticker() {
  const all = useEvents(80);
  const events = useMemo(() => all.filter(isTickerEvent).slice(0, 30), [all]);
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
