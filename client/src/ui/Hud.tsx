// HUD: credits (top left), search (top), Teleport (bottom center), connection pill.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  formatCredits, searchObjects, useClaims, useConnection, useObjects, usePlayer, useSceneApi, useSceneStore,
} from '../state';
import { CREWS } from '../types';
import { CLASS_LABEL } from './format';
import { useToast } from './Toast';

export function Credits({ onOpenPortfolio }: { onOpenPortfolio?: () => void }) {
  const me = usePlayer();
  const credits = me?.credits ?? 0;
  const prev = useRef(credits);
  const [bump, setBump] = useState(false);
  useEffect(() => {
    if (prev.current !== credits) {
      prev.current = credits;
      setBump(true);
      const t = setTimeout(() => setBump(false), 500);
      return () => clearTimeout(t);
    }
  }, [credits]);
  const color = me ? CREWS[me.crew].color : 'var(--gold)';
  return (
    <button
      type="button"
      className="px-glass px-credits"
      style={{ '--crew': color } as CSSProperties}
      onClick={onOpenPortfolio}
      aria-label="Open your portfolio"
    >
      <span className="px-credits__dot" />
      <span className="px-credits__col">
        <span className="px-credits__name">{me?.callsign || 'captain'}</span>
        <span className={`px-credits__amt px-mono ${bump ? 'px-credits__amt--bump' : ''}`}>
          {formatCredits(credits)}<small>cr</small>
        </span>
      </span>
    </button>
  );
}

export function Search() {
  const { list, byId } = useObjects();
  const claims = useClaims();
  const api = useSceneApi();
  const select = useSceneStore(s => s.select);
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchObjects(list, q, 8), [list, q]);
  const open = focus && q.trim().length > 0;

  function pick(id: string) {
    setQ('');
    setFocus(false);
    inputRef.current?.blur();
    api?.flyTo(id);
    select(id);
  }
  void byId;

  return (
    <div className="px-search">
      <div className="px-glass px-search__box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 150)}
          onKeyDown={e => {
            if (e.key === 'Escape') { setQ(''); inputRef.current?.blur(); }
            if (e.key === 'Enter' && results[0]) pick(results[0].id);
          }}
          placeholder="Search a planet or star"
          aria-label="Search planets"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
        />
        {q && <button type="button" className="px-search__clear" aria-label="Clear" onMouseDown={e => e.preventDefault()} onClick={() => { setQ(''); inputRef.current?.focus(); }}>×</button>}
      </div>
      {open && (
        <div className="px-glass px-search__results" role="listbox">
          {results.length === 0 && <div className="px-search__empty">No listings match. The universe is big, try fewer letters.</div>}
          {results.map(o => {
            const c = claims.get(o.id);
            return (
              <button key={o.id} type="button" role="option" aria-selected={false} className="px-search__item" onMouseDown={e => e.preventDefault()} onClick={() => pick(o.id)}>
                <span className="px-lb__dot" style={{ '--c': c ? CREWS[c.ownerCrew].color : '#fff' } as CSSProperties} />
                <span><b>{o.name}</b><span>{o.system} · {CLASS_LABEL[o.cls]}</span></span>
                {c ? <span style={{ color: CREWS[c.ownerCrew].color, fontSize: 12 }}>{c.ownerCallsign}</span>
                   : <em className="px-mono">{formatCredits(o.priceCredits)} cr</em>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Teleport() {
  const api = useSceneApi();
  const toast = useToast();
  const [warp, setWarp] = useState(false);
  return (
    <div className="px-teleport-wrap">
      <button
        type="button"
        className={`px-btn px-teleport ${warp ? 'px-teleport--warp' : ''}`}
        onClick={() => {
          if (!api) { toast('Engines still warming up. One second.'); return; }
          setWarp(true);
          setTimeout(() => setWarp(false), 600);
          api.teleport();
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5z" /></svg>
        Teleport
      </button>
    </div>
  );
}

export function ConnectionPill() {
  const { connected, connectionError, mode } = useConnection();
  if (connected) return null;
  return (
    <div className="px-glass px-conn">
      <span className="px-spin" />
      {connectionError ? 'Reconnecting to the universe' : mode === 'mock' ? 'Loading' : 'Connecting to the universe'}
    </div>
  );
}
