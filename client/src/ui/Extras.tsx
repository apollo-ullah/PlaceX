// Phase 3 extras: portfolio drawer, HOSTILE TAKEOVER banner, achievement toasts, rent toasts.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatCredits, rentPerMinute, useAchievements, useClaims, useConnection, useEvents, useMyClaims,
  useObjects, usePlayer, usePresence, useSceneApi, useSceneStore,
} from '../state';
import type { ClaimView } from '../types';
import { Planet } from './Planet';
import { useToast } from './Toast';
import { ACHIEVEMENT_COPY, CLASS_LABEL } from './format';

export function Portfolio({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mine = useMyClaims();
  const me = usePlayer();
  const { byId } = useObjects();
  const presence = usePresence();
  const api = useSceneApi();
  const select = useSceneStore(s => s.select);
  const total = useMemo(() => mine.reduce((s, c) => s + c.pricePaid, 0), [mine]);
  const incomeMin = useMemo(() => mine.reduce((s, c) => {
    const o = byId.get(c.objectId);
    return s + rentPerMinute(c.pricePaid, !!o?.habitableZone);
  }, 0), [mine, byId]);
  const watchers = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of presence) {
      if (!mine.some(c => c.objectId === p.targetObjectId)) continue;
      m.set(p.targetObjectId, (m.get(p.targetObjectId) ?? 0) + 1);
    }
    return m;
  }, [presence, mine]);
  const threatened = useMemo(() => [...watchers.values()].reduce((s, n) => s + n, 0), [watchers]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function visit(id: string) {
    onClose();
    api?.flyTo(id);
    select(id);
  }

  return (
    <div className={`px-glass px-portfolio ${open ? 'px-portfolio--open' : ''}`} role="dialog" aria-label="Your portfolio" aria-hidden={!open}>
      <div className="px-card__grab" onClick={onClose}><i /></div>
      <button type="button" className="px-btn px-btn--icon px-card__close" aria-label="Close portfolio" onClick={onClose}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <div className="px-portfolio__head">
        <div>
          <h3>{me?.callsign ? `${me.callsign}'s portfolio` : 'Your portfolio'}</h3>
          <p>
            {mine.length === 0
              ? 'No holdings yet'
              : `${mine.length} ${mine.length === 1 ? 'world' : 'worlds'} · ${formatCredits(me?.credits ?? 0)} cr in the bank`}
          </p>
          {mine.length > 0 && (
            <p className="px-portfolio__income">
              Earning <b className="px-mono">+{formatCredits(incomeMin)} cr</b> / min in rent
              {threatened > 0 ? <> · <span className="px-portfolio__threat">{threatened} watching your land</span></> : null}
            </p>
          )}
        </div>
        <div className="px-portfolio__total">
          <b className="px-mono">{formatCredits(me?.portfolioValue ?? total)}<span style={{ fontSize: 12, marginLeft: 4 }}>cr</span></b>
          <span>Total value</span>
        </div>
      </div>
      {mine.length === 0 ? (
        <div className="px-portfolio__empty">
          <b>Nothing on the books yet.</b>
          Teleport somewhere, open a listing, tap Claim. The universe is waiting.
        </div>
      ) : (
        <div className="px-portfolio__grid">
          {mine.map(c => {
            const o = byId.get(c.objectId);
            const eyes = watchers.get(c.objectId) ?? 0;
            const rent = rentPerMinute(c.pricePaid, !!o?.habitableZone);
            return (
              <button
                key={c.objectId}
                type="button"
                className={`px-holding ${eyes ? 'px-holding--watched' : ''} ${c.forSale ? 'px-holding--sale' : ''}`}
                onClick={() => visit(c.objectId)}
              >
                <Planet cls={o?.cls ?? 'rocky'} size={44} />
                <b>{o?.name ?? c.objectId}</b>
                <span>{o ? CLASS_LABEL[o.cls] : 'Unknown class'}{o?.habitableZone ? ' · habitable' : ''}</span>
                <span className="px-mono">{formatCredits(c.pricePaid)} cr · +{formatCredits(rent)}/m</span>
                {c.forSale && <em className="px-holding__tag">For sale · {formatCredits(c.askCredits)} cr</em>}
                {eyes > 0 && <em className="px-holding__tag px-holding__tag--threat">{eyes} looking now</em>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Watches my claims; when one I owned switches owner, raise the banner. */
export function TakeoverBanner() {
  const claims = useClaims();
  const { identity } = useConnection();
  const { byId } = useObjects();
  const api = useSceneApi();
  const select = useSceneStore(s => s.select);
  const prev = useRef<Map<string, ClaimView> | null>(null);
  const [hit, setHit] = useState<{ claim: ClaimView; name: string; kind: 'takeover' | 'sale' } | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!identity) return;
    const before = prev.current;
    prev.current = claims;
    if (!before) return;
    for (const [id, was] of before) {
      if (was.owner !== identity) continue;
      const now = claims.get(id);
      if (now && now.owner !== identity) {
        // Sale events usually clear forSale; takeovers do too. Prefer sale copy when ask was set.
        const kind = was.forSale ? 'sale' : 'takeover';
        setHit({ claim: now, name: byId.get(id)?.name ?? id, kind });
        if (timer.current) clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setHit(null), 7000);
        try { navigator.vibrate?.([80, 40, 120]); } catch { /* no haptics */ }
        break;
      }
    }
  }, [claims, identity, byId]);

  if (!hit) return null;
  return (
    <div className={`px-banner ${hit.kind === 'sale' ? 'px-banner--sale' : ''}`} role="alert" onClick={() => { setHit(null); api?.flyTo(hit.claim.objectId); select(hit.claim.objectId); }}>
      <b>{hit.kind === 'sale' ? 'Sold' : 'Hostile takeover'}</b>
      <p>
        <span style={{ fontWeight: 700 }}>{hit.claim.ownerCallsign}</span>
        {hit.kind === 'sale' ? ' bought ' : ' just took '}
        <span style={{ fontWeight: 700 }}>{hit.name}</span>
        {hit.kind === 'sale' ? ' from your listing' : ' from you'}
        {' '}for <span className="px-mono">{formatCredits(hit.claim.pricePaid)} cr</span>. You got paid. Tap to scout it.
      </p>
    </div>
  );
}

/** Toasts for achievements earned during this session. */
export function AchievementToasts() {
  const achievements = useAchievements();
  const toast = useToast();
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(achievements.map(a => a.kind));
      return;
    }
    for (const a of achievements) {
      if (seen.current.has(a.kind)) continue;
      seen.current.add(a.kind);
      const c = ACHIEVEMENT_COPY[a.kind];
      toast(c ? `${c.title}: ${c.line}` : `Achievement unlocked: ${a.kind}`, 'gold', 4200);
    }
  }, [achievements, toast]);
  return null;
}

/** Personal rent toast when an income event for me lands. */
export function IncomeToasts() {
  const events = useEvents(30);
  const { identity } = useConnection();
  const toast = useToast();
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!identity) return;
    const mine = events.filter(e => e.kind === 'income' && e.actor === identity);
    if (!seen.current) {
      seen.current = new Set(mine.map(e => e.id));
      return;
    }
    for (const e of mine) {
      if (seen.current.has(e.id)) continue;
      seen.current.add(e.id);
      if (e.amount > 0) toast(`Rent collected: +${formatCredits(e.amount)} cr`, 'ok', 2800);
    }
  }, [events, identity, toast]);
  return null;
}
