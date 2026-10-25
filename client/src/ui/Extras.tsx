// Phase 3 extras: portfolio drawer, HOSTILE TAKEOVER banner, achievement toasts.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatCredits, useAchievements, useClaims, useConnection, useMyClaims, useObjects, usePlayer, useSceneApi, useSceneStore,
} from '../state';
import type { ClaimView } from '../types';
import { Planet } from './Planet';
import { useToast } from './Toast';
import { ACHIEVEMENT_COPY, CLASS_LABEL } from './format';

export function Portfolio({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mine = useMyClaims();
  const me = usePlayer();
  const { byId } = useObjects();
  const api = useSceneApi();
  const select = useSceneStore(s => s.select);
  const total = useMemo(() => mine.reduce((s, c) => s + c.pricePaid, 0), [mine]);

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
          <p>{mine.length === 0 ? 'No holdings yet' : `${mine.length} ${mine.length === 1 ? 'world' : 'worlds'} · ${formatCredits(me?.credits ?? 0)} cr in the bank`}</p>
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
            return (
              <button key={c.objectId} type="button" className="px-holding" onClick={() => visit(c.objectId)}>
                <Planet cls={o?.cls ?? 'rocky'} size={44} />
                <b>{o?.name ?? c.objectId}</b>
                <span>{o ? CLASS_LABEL[o.cls] : 'Unknown class'}{o?.habitableZone ? ' · habitable' : ''}</span>
                <span className="px-mono">{formatCredits(c.pricePaid)} cr</span>
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
  const [hit, setHit] = useState<{ claim: ClaimView; name: string } | null>(null);
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
        setHit({ claim: now, name: byId.get(id)?.name ?? id });
        if (timer.current) clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setHit(null), 7000);
        try { navigator.vibrate?.([80, 40, 120]); } catch { /* no haptics */ }
        break;
      }
    }
  }, [claims, identity, byId]);

  if (!hit) return null;
  return (
    <div className="px-banner" role="alert" onClick={() => { setHit(null); api?.flyTo(hit.claim.objectId); select(hit.claim.objectId); }}>
      <b>Hostile takeover</b>
      <p>
        <span style={{ fontWeight: 700 }}>{hit.claim.ownerCallsign}</span> just took <span style={{ fontWeight: 700 }}>{hit.name}</span> from you
        for <span className="px-mono">{formatCredits(hit.claim.pricePaid)} cr</span>. You got paid. Tap to take it back.
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
