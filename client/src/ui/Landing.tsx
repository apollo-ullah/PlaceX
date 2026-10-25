// Landing: callsign, crew color, Enter. Shown until the player has a profile.
import { useState, type CSSProperties, type FormEvent } from 'react';
import { useActions, useConnection, reducerErrorCode } from '../state';
import { CALLSIGN_MAX, CALLSIGN_MIN, CREWS, CREW_IDS, STARTING_CREDITS, type Crew } from '../types';
import { ERROR_COPY } from './format';

export function Landing() {
  const actions = useActions();
  const { connected, connectionError } = useConnection();
  const [callsign, setCallsign] = useState('');
  const [crew, setCrew] = useState<Crew>(() => CREW_IDS[Math.floor(Math.random() * CREW_IDS.length)]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const clean = callsign.trim();
  const valid = clean.length >= CALLSIGN_MIN && clean.length <= CALLSIGN_MAX;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!valid) { setErr(ERROR_COPY.BAD_CALLSIGN); return; }
    setErr(null);
    setBusy(true);
    try {
      await actions.setProfile(clean, crew);
    } catch (ex) {
      const code = reducerErrorCode(ex);
      setErr(code ? ERROR_COPY[code] : 'The universe hiccuped. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-landing">
      <div className="px-landing__brand"><i />PlaceX</div>
      <div className={`px-landing__status ${connected ? '' : 'px-landing__status--off'}`}>
        <i />{connected ? 'Universe online' : (connectionError ? 'Reconnecting' : 'Connecting')}
      </div>

      <div className="px-landing__inner">
        <div className="px-landing__eyebrow"><span className="px-label">Real estate for the real universe</span></div>
        <h1>Claim the universe <em>before someone else does.</em></h1>
        <p className="px-landing__sub">
          Thousands of real exoplanets, priced by physics, one owner each.
          You start with <b className="px-mono">{STARTING_CREDITS.toLocaleString('en-US')} credits</b>. No sign-up, just a callsign.
        </p>

        <form onSubmit={submit} noValidate>
          <div className="px-field">
            <div className="px-field__row">
              <label className="px-label" htmlFor="px-callsign">Callsign</label>
              <span className={`px-field__count px-mono ${clean.length > CALLSIGN_MAX ? 'px-field__err' : ''}`}>{clean.length}/{CALLSIGN_MAX}</span>
            </div>
            <input
              id="px-callsign"
              className="px-input"
              value={callsign}
              onChange={e => { setCallsign(e.target.value); if (err) setErr(null); }}
              placeholder="e.g. ady, nova, kepler"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={CALLSIGN_MAX + 4}
              enterKeyHint="go"
            />
            {err && <div className="px-field__err" role="alert">{err}</div>}
          </div>

          <div className="px-field">
            <div className="px-field__row">
              <span className="px-label">Crew</span>
              <span className="px-field__count">{CREWS[crew].name}</span>
            </div>
            <div className="px-crews" role="radiogroup" aria-label="Crew color">
              {CREW_IDS.map(id => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={crew === id}
                  aria-label={CREWS[id].name}
                  className={`px-crew ${crew === id ? 'px-crew--on' : ''}`}
                  style={{ '--c': CREWS[id].color } as CSSProperties}
                  onClick={() => setCrew(id)}
                >
                  <span className="px-crew__dot" />
                  <span className="px-crew__name">{CREWS[id].name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

          <button type="submit" className="px-btn px-btn--primary px-btn--block" disabled={busy || !connected}>
            {busy ? <><span className="px-spin" /> Opening the airlock</> : connected ? 'Enter the universe' : <><span className="px-spin" /> Connecting</>}
          </button>
          <p className="px-landing__fine">In-game credits only. Prices and sounds are physics-inspired estimates.</p>
        </form>
      </div>
    </div>
  );
}
