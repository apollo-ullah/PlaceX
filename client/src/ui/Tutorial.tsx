// First-run how-to. Auto-opens once per browser after you enter; reopen anytime via Help.
import { useCallback, useEffect, useState } from 'react';
import { STARTING_CREDITS } from '../types';

const STORAGE_KEY = 'placex.tutorial.v1';

const STEPS: { title: string; body: string }[] = [
  {
    title: 'Fly, then claim',
    body: 'Tap Teleport for a random world, or search a name. Open a listing and hit Claim. One owner per planet. You start with '
      + STARTING_CREDITS.toLocaleString('en-US') + ' credits.',
  },
  {
    title: 'How you make credits',
    body: 'Owned planets pay rent every minute: about 1% of what you paid, 3% if habitable. List a deed for sale at your ask. Hostile takeovers cost 2× what the owner paid — and the next snipe doubles again. No cash shop.',
  },
  {
    title: 'Rivalry and auctions',
    body: 'Watch for eyes on your land in the portfolio. Earth, Moon, and Mars go up at live venue auctions. Bid from the auction panel or the listing card.',
  },
  {
    title: 'Your books',
    body: 'Tap your credits pill for the portfolio: rent per minute, for-sale tags, and who is scouting your worlds. Ready when you are.',
  },
];

function readSeen(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

function writeSeen() {
  try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* private mode */ }
}

/** Compact first-run coach. Controlled open, or auto after first profile. */
export function Tutorial({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  const finish = useCallback(() => {
    writeSeen();
    onClose();
  }, [onClose]);

  if (!open) return null;
  const last = step >= STEPS.length - 1;
  const s = STEPS[step];

  return (
    <div className="px-tut" role="dialog" aria-modal="true" aria-label="How to play">
      <button type="button" className="px-tut__scrim" aria-label="Close tutorial" onClick={finish} />
      <div className="px-glass px-tut__card">
        <div className="px-tut__top">
          <span className="px-label">How to play</span>
          <span className="px-mono px-tut__page">{step + 1}/{STEPS.length}</span>
        </div>
        <h2>{s.title}</h2>
        <p>{s.body}</p>
        <div className="px-tut__dots" aria-hidden>
          {STEPS.map((_, i) => <i key={i} className={i === step ? 'px-tut__dot px-tut__dot--on' : 'px-tut__dot'} />)}
        </div>
        <div className="px-tut__actions">
          {step > 0
            ? <button type="button" className="px-btn px-btn--ghost" onClick={() => setStep(n => n - 1)}>Back</button>
            : <button type="button" className="px-btn px-btn--ghost" onClick={finish}>Skip</button>}
          <button
            type="button"
            className="px-btn px-btn--primary"
            onClick={() => { if (last) finish(); else setStep(n => n + 1); }}
          >
            {last ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** True until the player finishes or skips the tutorial once in this browser. */
export function shouldAutoOpenTutorial(): boolean {
  return !readSeen();
}

/** Small HUD control that reopens the how-to. */
export function HelpButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="px-glass px-btn px-help" onClick={onOpen} aria-label="How to play">
      ?
    </button>
  );
}
