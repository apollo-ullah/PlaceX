// Live auction: HUD panel with countdown, plus BidControls shared with the listing card.
import { useEffect, useState } from 'react';
import {
  formatCredits, reducerErrorCode, useActions, useAuctions, useConnection, useObjects, usePlayer,
  useSceneApi, useSceneStore,
} from '../state';
import type { AuctionView, CelestialObject } from '../types';
import { Planet } from './Planet';
import { useToast } from './Toast';
import { ERROR_COPY, fmtCountdown, minBid } from './format';

const DELTAS = [0, 50, 100, 250] as const;
type Delta = typeof DELTAS[number];

/** Wall clock that re-renders every `ms`. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** The one running auction and its listing, or null. */
export function useActiveAuction(): { auction: AuctionView; obj: CelestialObject } | null {
  const auctions = useAuctions();
  const { byId } = useObjects();
  const auction = auctions.find(a => a.active);
  const obj = auction ? byId.get(auction.objectId) : undefined;
  return auction && obj ? { auction, obj } : null;
}

function systemLine(obj: CelestialObject): string {
  return obj.system === 'Sol' ? 'Solar System' : `Orbits ${obj.system}`;
}

export function BidControls({ auction, obj, showStatus = false }: { auction: AuctionView; obj: CelestialObject; showStatus?: boolean }) {
  const me = usePlayer();
  const { identity } = useConnection();
  const actions = useActions();
  const toast = useToast();
  const now = useNow();
  const [delta, setDelta] = useState<Delta>(0);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  const remaining = auction.endsAt - now;
  const ended = remaining <= 0;
  const leading = !!identity && auction.highBidder === identity;
  const floor = minBid(obj.priceCredits, auction.highBid);
  const base = auction.highBid > 0 ? auction.highBid : obj.priceCredits;
  const amountFor = (d: Delta) => (d === 0 ? floor : Math.max(floor, base + d));
  const amount = amountFor(delta);
  const cost = leading ? amount - auction.highBid : amount;
  const credits = me?.credits ?? 0;
  const short = credits < cost;

  // A new high bid invalidates any error about the old one.
  useEffect(() => { setErr(null); }, [auction.highBid]);

  async function place() {
    if (pending || ended || !me) return;
    setPending(true);
    setErr(null);
    try {
      await actions.bid(obj.id, amount);
      setDelta(0);
      toast(`You lead on ${obj.name} at ${formatCredits(amount)} cr.`, 'gold');
    } catch (e) {
      const code = reducerErrorCode(e);
      setErr(code ? ERROR_COPY[code] : 'Something went sideways. Try again.');
      setShake(true);
      window.setTimeout(() => setShake(false), 500);
    } finally {
      setPending(false);
    }
  }

  const hint = err
    ?? (ended ? 'Gavel is down. Settling now.'
      : short ? `You have ${formatCredits(credits)} cr. This bid needs ${formatCredits(cost)}.`
      : leading ? 'You hold the high bid. Raising only costs the difference.'
      : auction.highBid > 0 ? `Beat ${formatCredits(auction.highBid)} cr to take the lead. Refunded if outbid.`
      : `Opening bid starts at the list price, ${formatCredits(obj.priceCredits)} cr.`);

  return (
    <div className="px-bid">
      {showStatus && (
        <div className={`px-bid__status ${remaining < 60_000 && !ended ? 'px-bid__status--urgent' : ''}`}>
          <span className="px-bid__stat">
            <span className="px-label">Closes in</span>
            <b className="px-mono">{ended ? '0:00' : fmtCountdown(remaining)}</b>
          </span>
          <span className="px-bid__stat px-bid__stat--right">
            <span className="px-label">High bid</span>
            {auction.highBid > 0
              ? <b className="px-mono">{formatCredits(auction.highBid)} <small>{leading ? 'you' : auction.highBidderCallsign ?? 'anon'}</small></b>
              : <b className="px-bid__none">No bids yet</b>}
          </span>
        </div>
      )}
      <div className="px-bid__chips" role="group" aria-label="Bid amount">
        {DELTAS.map(d => (
          <button
            key={d}
            type="button"
            className={`px-bid__chip ${delta === d ? 'px-bid__chip--on' : ''}`}
            aria-pressed={delta === d}
            disabled={ended}
            onClick={() => { setDelta(d); setErr(null); }}
          >
            <span>{d === 0 ? 'Min' : `+${d}`}</span>
            <small className="px-mono">{formatCredits(amountFor(d))}</small>
          </button>
        ))}
      </div>
      <button
        type="button"
        className={['px-btn px-btn--block px-btn--primary', pending && 'px-btn--pressed', shake && 'px-btn--shake'].filter(Boolean).join(' ')}
        disabled={pending || ended || !me}
        onClick={place}
      >
        {pending ? <><span className="px-spin" />Placing bid</>
          : ended ? 'Auction closed'
          : <>{leading ? 'Raise to' : 'Place bid'} <span className="px-mono">{formatCredits(amount)} cr</span></>}
      </button>
      <p className={`px-cta__hint ${err ? 'px-cta__hint--err' : leading && !short ? 'px-cta__hint--ok' : ''}`}>{hint}</p>
    </div>
  );
}

export function AuctionPanel() {
  const live = useActiveAuction();
  const { identity } = useConnection();
  const api = useSceneApi();
  const select = useSceneStore(s => s.select);
  const now = useNow();
  const [open, setOpen] = useState(false);
  const [bump, setBump] = useState(false);
  const highBid = live?.auction.highBid ?? 0;

  useEffect(() => {
    if (!highBid) return;
    setBump(true);
    const t = setTimeout(() => setBump(false), 700);
    return () => clearTimeout(t);
  }, [highBid]);

  if (!live) return null;
  const { auction, obj } = live;
  const remaining = auction.endsAt - now;
  const urgent = remaining > 0 && remaining < 60_000;
  const leading = !!identity && auction.highBidder === identity;

  function view() {
    if (api) api.flyTo(obj.id);
    select(obj.id);
  }

  return (
    <div className={['px-glass px-auction', open && 'px-auction--open', urgent && 'px-auction--urgent', leading && 'px-auction--lead'].filter(Boolean).join(' ')} aria-label={`Live auction for ${obj.name}`}>
      <button type="button" className="px-auction__head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <Planet cls={obj.cls} size={34} />
        <span className="px-auction__col">
          <span className="px-auction__eyebrow"><i />Live auction</span>
          <b className="px-auction__name">{obj.name}</b>
          <span className={`px-auction__high ${bump ? 'px-auction__high--bump' : ''}`}>
            {auction.highBid > 0
              ? <><span className="px-mono">{formatCredits(auction.highBid)} cr</span> {leading ? 'by you' : `by ${auction.highBidderCallsign ?? 'anon'}`}</>
              : 'No bids yet'}
          </span>
        </span>
        <span className="px-auction__clock">
          <b className="px-mono">{remaining > 0 ? fmtCountdown(remaining) : '0:00'}</b>
          <span>{open ? 'Hide' : 'Bid'}</span>
        </span>
      </button>
      {open && (
        <div className="px-auction__body">
          <BidControls auction={auction} obj={obj} />
          <button type="button" className="px-btn px-btn--ghost px-auction__view" onClick={view}>
            View the listing · {systemLine(obj)}
          </button>
        </div>
      )}
    </div>
  );
}
