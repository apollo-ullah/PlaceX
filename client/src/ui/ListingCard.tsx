// Listing card for the selected object, with the claim and takeover flow.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import {
  formatCredits, formatUsd, reducerErrorCode, rentPerMinute, useActions, useAuctions, useClaim, useConnection,
  useObject, usePlayer, usePresence, useSceneApi, useSceneStore, useSelectedObjectId,
} from '../state';
import { playPlanetSound, stopSound, SOUND_DISCLAIMER } from '../audio';
import { CREWS, takeoverCost, type CelestialObject } from '../types';
import { Planet } from './Planet';
import { useToast } from './Toast';
import { BidControls } from './AuctionPanel';
import { CLASS_LABEL, ERROR_COPY, fmtDays, fmtDistance, fmtG, fmtMult, fmtTempC, fmtTempK, fmtUsdPerKg } from './format';

type Phase = 'idle' | 'pending' | 'claimed' | 'sniped' | 'insufficient' | 'auction' | 'bought';
type Stamp = 'sniped' | 'claimed' | null;

export function ListingCard() {
  const selectedId = useSelectedObjectId();
  const select = useSceneStore(s => s.select);
  const obj = useObject(selectedId);
  // Keep the last object around while the card slides out.
  const lastObj = useRef<CelestialObject | undefined>(obj);
  if (obj) lastObj.current = obj;
  const shown = obj ?? lastObj.current;
  const open = !!obj;

  const close = useCallback(() => { stopSound(); select(null); }, [select]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  return (
    <>
      <div className={`px-card-scrim ${open ? 'px-card-scrim--on' : ''}`} />
      {shown && <CardBody key={shown.id} obj={shown} open={open} onClose={close} />}
    </>
  );
}

function CardBody({ obj, open, onClose }: { obj: CelestialObject; open: boolean; onClose: () => void }) {
  const me = usePlayer();
  const { identity } = useConnection();
  const claim = useClaim(obj.id);
  const auction = useAuctions().find(a => a.objectId === obj.id && a.active);
  const actions = useActions();
  const api = useSceneApi();
  const toast = useToast();
  const presence = usePresence();
  const watchers = useMemo(
    () => presence.filter(p => p.targetObjectId === obj.id).length,
    [presence, obj.id]
  );

  const [phase, setPhase] = useState<Phase>('idle');
  const [stamp, setStamp] = useState<Stamp>(null);
  const [shortfall, setShortfall] = useState(0);
  const [why, setWhy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ask, setAsk] = useState(() => obj.priceCredits);
  const [listing, setListing] = useState(false);
  const timers = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); }, []);
  useEffect(() => () => { timers.current.forEach(clearTimeout); stopSound(); }, []);

  // If someone else grabs it while we are looking (and we did not just claim it), stamp SNIPED.
  const wasUnclaimed = useRef(!claim);
  useEffect(() => {
    if (claim && wasUnclaimed.current && claim.owner !== identity && phase !== 'pending') {
      setStamp('sniped');
      later(() => setStamp(null), 1600);
    }
    wasUnclaimed.current = !claim;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claim?.owner]);

  const mine = !!claim && claim.owner === identity;
  const onMarket = !!claim && claim.forSale && !mine;
  const isTakeover = !!claim && !mine && !onMarket;
  const buyCost = onMarket ? claim!.askCredits : 0;
  const snipeCost = claim
    ? takeoverCost(claim.pricePaid, obj.priceCredits, { forSale: claim.forSale, askCredits: claim.askCredits })
    : obj.priceCredits * 2;
  const cost = onMarket ? buyCost : isTakeover ? snipeCost : obj.priceCredits;
  const canAfford = (me?.credits ?? 0) >= cost;
  const rent = claim ? rentPerMinute(claim.pricePaid, obj.habitableZone) : rentPerMinute(obj.priceCredits, obj.habitableZone);
  const listFloor = Math.max(obj.priceCredits, claim?.pricePaid ?? obj.priceCredits);

  useEffect(() => {
    if (claim?.forSale) setAsk(claim.askCredits);
    else setAsk(listFloor);
  }, [claim?.forSale, claim?.askCredits, listFloor]);

  async function act() {
    if (!me || phase === 'pending' || phase === 'claimed' || phase === 'bought') return;
    setPhase('pending');
    try {
      if (onMarket) await actions.buyListing(obj.id);
      else if (isTakeover) await actions.takeover(obj.id);
      else await actions.claim(obj.id);
      setPhase(onMarket ? 'bought' : 'claimed');
      setStamp('claimed');
      api?.playClaimAnimation(obj.id, CREWS[me.crew].color);
      later(() => { setStamp(null); setPhase('idle'); }, 1500);
    } catch (e) {
      const code = reducerErrorCode(e);
      if (code === 'ALREADY_CLAIMED' || code === 'NOT_FOR_SALE') {
        setPhase('sniped');
        setStamp('sniped');
        later(() => { setStamp(null); setPhase('idle'); }, 1700);
      } else if (code === 'INSUFFICIENT_CREDITS') {
        setShortfall(Math.max(0, cost - me.credits));
        setPhase('insufficient');
        later(() => setPhase('idle'), 2600);
      } else if (code === 'AUCTION_ONLY') {
        setPhase('auction');
      } else {
        setPhase('idle');
        toast(code ? ERROR_COPY[code] : 'Something went sideways. Try again.', 'err');
      }
    }
  }

  async function listIt() {
    if (!me || listing) return;
    setListing(true);
    try {
      await actions.listForSale(obj.id, Math.round(ask));
      toast(`Listed ${obj.name} for ${formatCredits(ask)} cr.`, 'gold');
    } catch (e) {
      const code = reducerErrorCode(e);
      toast(code ? ERROR_COPY[code] : 'Could not list that deed.', 'err');
    } finally {
      setListing(false);
    }
  }

  async function delist() {
    if (!me || listing) return;
    setListing(true);
    try {
      await actions.cancelListing(obj.id);
      toast('Listing pulled. Still yours.', 'ok');
    } catch (e) {
      const code = reducerErrorCode(e);
      toast(code ? ERROR_COPY[code] : 'Could not cancel that listing.', 'err');
    } finally {
      setListing(false);
    }
  }

  function toggleSound() {
    if (playing) { stopSound(); setPlaying(false); }
    else { playPlanetSound(obj); setPlaying(true); }
  }

  // Swipe down to close (mobile grab handle).
  const cardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; dy: number } | null>(null);
  const onDown = (e: RPointerEvent) => { drag.current = { y0: e.clientY, dy: 0 }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); cardRef.current?.classList.add('px-card--dragging'); };
  const onMove = (e: RPointerEvent) => {
    if (!drag.current || !cardRef.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y0);
    drag.current.dy = dy;
    cardRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onUp = () => {
    const d = drag.current; drag.current = null;
    const el = cardRef.current; if (!el) return;
    el.classList.remove('px-card--dragging');
    el.style.transform = '';
    if (d && d.dy > 90) onClose();
  };

  const est = (f: string) => obj.estimated.includes(f);
  const pb = obj.priceBreakdown;
  const year = obj.orbitalPeriodDays != null ? fmtDays(obj.orbitalPeriodDays) : null;
  const ownerColor = claim ? CREWS[claim.ownerCrew].color : undefined;
  const lavaShake = obj.cls === 'lava' || obj.cls === 'hot_jupiter';
  const confetti = useMemo(() => Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2; const r = 90 + (i % 4) * 30;
    return { dx: `${Math.cos(a) * r}px`, dy: `${Math.sin(a) * r - 60}px`, delay: `${(i % 5) * 0.04}s`, color: i % 3 === 0 ? '#fff' : i % 3 === 1 ? 'var(--gold)' : (me ? CREWS[me.crew].color : 'var(--gold)') };
  }), [me]);

  const showAuction = obj.auctionOnly || phase === 'auction';

  return (
    <div
      ref={cardRef}
      className={`px-glass px-card ${open ? 'px-card--open' : ''} ${open && lavaShake ? 'px-card--lava-shake' : ''}`}
      data-cls={obj.cls}
      role="dialog"
      aria-label={`${obj.name} listing`}
      aria-hidden={!open}
      inert={!open ? true : undefined}
    >
      {stamp && (
        <div className={`px-stamp px-stamp--${stamp}`} aria-live="assertive">
          {stamp === 'claimed' && <div className="px-confetti">{confetti.map((c, i) => <i key={i} style={{ '--dx': c.dx, '--dy': c.dy, animationDelay: c.delay, background: c.color } as CSSProperties} />)}</div>}
          <div>
            <div className="px-stamp__text">{stamp === 'sniped' ? 'Sniped' : 'Claimed'}</div>
            <div className="px-stamp__sub">
              {stamp === 'sniped'
                ? (claim && claim.owner !== identity ? `${claim.ownerCallsign} got there first.` : 'Someone got there first.')
                : `${obj.name} is yours. Welcome home.`}
            </div>
          </div>
        </div>
      )}

      <div className="px-card__grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}><i /></div>
      <button type="button" className="px-btn px-btn--icon px-card__close" aria-label="Close listing" onClick={onClose}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>

      <div className="px-card__body">
        <div className="px-card__hero">
          <Planet cls={obj.cls} />
          <div className="px-card__title">
            <h2>{obj.name}</h2>
            <p>{obj.system === 'Sol' ? 'Solar System' : <>Orbits <b>{obj.system}</b></>}{obj.discoveryYear ? <> · found {obj.discoveryYear}</> : null}</p>
            <div className="px-card__tags">
              <span className="px-tag">{CLASS_LABEL[obj.cls]}</span>
              {obj.habitableZone && <span className="px-tag px-tag--hz">Habitable zone</span>}
              {obj.auctionOnly && <span className="px-tag px-tag--auction">Auction</span>}
            </div>
          </div>
        </div>

        <div className="px-price">
          <div className="px-price__amt px-mono">{formatCredits(obj.priceCredits)}<small>credits</small></div>
          <button type="button" className={`px-btn px-btn--ghost px-price__why ${why ? 'px-price__why--on' : ''}`} onClick={() => setWhy(w => !w)} aria-expanded={why}>
            Why this price {why ? '▴' : '▾'}
          </button>
        </div>
        {why && (
          <div className="px-breakdown">
            <div className="px-breakdown__row"><span>Composition ({CLASS_LABEL[obj.cls].toLowerCase()})</span><span className="px-mono">{fmtUsdPerKg(pb.compositionUsdPerKg)}</span></div>
            <div className="px-breakdown__row"><span>Habitable zone</span><span className="px-mono">{fmtMult(pb.habitableMult)}</span></div>
            <div className="px-breakdown__row"><span>Rarity</span><span className="px-mono">{fmtMult(pb.rarityMult)}</span></div>
            <div className="px-breakdown__row"><span>Distance premium</span><span className="px-mono">{fmtMult(pb.distanceMult)}</span></div>
            <div className="px-breakdown__row px-breakdown__row--total"><span>Estimated market value</span><span className="px-mono">{formatUsd(obj.valueUsd)}</span></div>
            <p className="px-breakdown__note">
              Market value is mass times dollars per kilogram times the multipliers. The claim price is 100 x (log10 of value minus 18) x the distance premium, floor 50. Physics-inspired, not an appraisal.
            </p>
          </div>
        )}

        <div className="px-chips">
          <Chip k="Distance" est={est('distanceLy')} v={fmtDistance(obj.distanceLy)} />
          <Chip k="Gravity" est={est('gravityG') || est('massEarth') || est('radiusEarth')} v={obj.gravityG != null ? <>{fmtG(obj.gravityG)}<small>g</small></> : 'Unknown'} />
          <Chip k="Temperature" est={est('tempK')} v={obj.tempK != null ? <>{fmtTempK(obj.tempK)}<small>{fmtTempC(obj.tempK)}</small></> : 'Unknown'} />
          <Chip k="Year length" est={est('orbitalPeriodDays')} v={year ? <>{year.v}<small>{year.unit}</small></> : 'Unknown'} />
        </div>

        <div className="px-fact">
          <div className="px-fact__head">
            <span className="px-label">Fun fact</span>
            {obj.factVerified
              ? <span className="px-badge px-badge--ok"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>Verified</span>
              : <span className="px-badge px-badge--dim">From the data</span>}
          </div>
          <p>{obj.fact}</p>
        </div>
        <p className="px-blurb">{obj.blurb}</p>

        <div className="px-sound">
          <div className="px-sound__row">
            <div className="px-sound__meta">
              <b>{obj.sound.layer === 'silence' ? 'Airless. Hear its orbit.' : 'Hear its atmosphere'}</b>
              <span className="px-mono">{obj.sound.layer === 'silence' ? 'no atmosphere' : `sound at ${Math.round(obj.sound.speedOfSound)} m/s, pitch ${obj.sound.pitchRatio.toFixed(2)}x`}</span>
            </div>
            <button type="button" className={`px-btn px-sound__btn ${playing ? 'px-sound__btn--on' : ''}`} onClick={toggleSound} aria-pressed={playing}>
              {playing ? <><span className="px-sound__bars"><i /><i /><i /><i /></span>Stop</> : <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>Play sound</>}
            </button>
          </div>
          <p className="px-sound__disc">{SOUND_DISCLAIMER}</p>
        </div>

        {claim && (
          <div className={`px-owner ${mine ? 'px-owner--me' : ''}`} style={{ '--c': ownerColor } as CSSProperties}>
            <span className="px-owner__dot" />
            <span className="px-owner__col">
              <span className="px-owner__k">{mine ? 'Yours' : claim.forSale ? 'For sale by' : 'Owned by'}</span>
              <span className="px-owner__name">{mine ? `${claim.ownerCallsign}, that is you` : claim.ownerCallsign}</span>
            </span>
            <span className="px-owner__paid px-mono">
              <small>{claim.forSale && !mine ? 'ask' : mine ? 'you paid' : 'paid'}</small>
              {formatCredits(claim.forSale && !mine ? claim.askCredits : claim.pricePaid)} cr
            </span>
          </div>
        )}

        {(mine || watchers > 0) && (
          <p className={`px-card__pulse ${watchers ? 'px-card__pulse--threat' : ''}`}>
            {mine
              ? <>Renting <b className="px-mono">+{formatCredits(rent)} cr</b> / min{watchers ? <> · <b>{watchers} looking now</b></> : null}</>
              : <><b>{watchers}</b> other player{watchers === 1 ? '' : 's'} looking here right now</>}
          </p>
        )}

        <div className="px-cta">
          {auction ? (
            <BidControls auction={auction} obj={obj} showStatus />
          ) : mine ? (
            <div className="px-sell">
              {claim?.forSale ? (
                <>
                  <p className="px-cta__hint px-cta__hint--ok">
                    Listed at <span className="px-mono">{formatCredits(claim.askCredits)} cr</span>. Waiting for a buyer.
                  </p>
                  <button type="button" className="px-btn px-btn--block px-btn--ghost" disabled={listing} onClick={delist}>
                    {listing ? <><span className="px-spin" /> Pulling listing</> : 'Cancel listing'}
                  </button>
                </>
              ) : (
                <>
                  <label className="px-sell__ask">
                    <span className="px-label">Ask price</span>
                    <input
                      className="px-input px-mono"
                      type="number"
                      min={listFloor}
                      step={50}
                      value={ask}
                      onChange={e => setAsk(Math.max(0, Number(e.target.value) || 0))}
                    />
                  </label>
                  <button type="button" className="px-btn px-btn--block px-btn--primary" disabled={listing || ask < listFloor} onClick={listIt}>
                    {listing ? <><span className="px-spin" /> Listing</> : <>List for sale <span className="px-mono">{formatCredits(ask)} cr</span></>}
                  </button>
                  <p className="px-cta__hint">Floor is {formatCredits(listFloor)} cr. Buyers pay your ask; a hostile takeover costs 2× that ask.</p>
                </>
              )}
            </div>
          ) : showAuction ? (
            <div className="px-auction-line">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4l6 6-8 8-6-6zM4 20h8" /></svg>
              {claim ? 'Sold at auction. Off the market for now.' : 'Auction only. Watch the big screen.'}
            </div>
          ) : (
            <>
              <button
                type="button"
                className={[
                  'px-btn px-btn--block',
                  onMarket ? 'px-btn--primary' : isTakeover ? 'px-btn--danger' : 'px-btn--primary',
                  phase === 'pending' && 'px-btn--pressed',
                  phase === 'insufficient' && 'px-btn--shake',
                ].filter(Boolean).join(' ')}
                disabled={phase === 'pending' || phase === 'claimed' || phase === 'bought' || !me}
                onClick={act}
              >
                {phase === 'pending' ? <><span className="px-spin" />{onMarket ? 'Closing the deal' : isTakeover ? 'Filing the takeover' : 'Filing the deed'}</>
                  : phase === 'claimed' || phase === 'bought' ? 'Yours'
                  : onMarket ? <>Buy now <span className="px-mono">{formatCredits(cost)} cr</span></>
                  : isTakeover ? <>Hostile takeover <span className="px-mono">{formatCredits(cost)} cr</span></>
                  : <>Claim for <span className="px-mono">{formatCredits(cost)} cr</span></>}
              </button>
              {onMarket && !obj.auctionOnly && (
                <button
                  type="button"
                  className="px-btn px-btn--block px-btn--danger"
                  disabled={phase === 'pending' || !me}
                  onClick={async () => {
                    if (!me) return;
                    setPhase('pending');
                    try {
                      await actions.takeover(obj.id);
                      setPhase('claimed');
                      setStamp('claimed');
                      api?.playClaimAnimation(obj.id, CREWS[me.crew].color);
                      later(() => { setStamp(null); setPhase('idle'); }, 1500);
                    } catch (e) {
                      const code = reducerErrorCode(e);
                      setPhase('idle');
                      toast(code ? ERROR_COPY[code] : 'Takeover failed.', 'err');
                    }
                  }}
                >
                  Or hostile takeover <span className="px-mono">{formatCredits(snipeCost)} cr</span>
                </button>
              )}
              <p className={`px-cta__hint ${phase === 'insufficient' ? 'px-cta__hint--err' : ''}`}>
                {phase === 'insufficient'
                  ? `Short by ${formatCredits(shortfall)} cr. Teleport somewhere cheaper.`
                  : phase === 'sniped' ? 'Sniped. Someone beat you to it.'
                  : onMarket ? `Pays ${claim?.ownerCallsign} their ask. Takeover is 2× the ask (${formatCredits(snipeCost)} cr).`
                  : isTakeover ? `Pays ${claim?.ownerCallsign} 2× what they paid. Next snipe doubles again.`
                  : !canAfford ? `You have ${formatCredits(me?.credits ?? 0)} cr. This one costs more.`
                  : 'One owner per planet. Tap before someone else does.'}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ k, v, est }: { k: string; v: ReactNode; est: boolean }) {
  return (
    <div className="px-chip">
      <span className="px-chip__k">{k}{est && <em title="Estimated, not measured">est.</em>}</span>
      <span className="px-chip__v px-mono">{v}</span>
    </div>
  );
}
