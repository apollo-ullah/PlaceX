// STUB. The UI agent replaces this whole folder. Contract:
//   - export function Shell({ big }: { big?: boolean }) renders landing (until hasProfile),
//     HUD, listing card for useSelectedObjectId(), leaderboard, ticker. `big` is the /big route.
import { useState } from 'react';
import { useActions, useClaims, useHasProfile, useObject, usePlayer, useSelectedObjectId, useSceneStore, useEvents, reducerErrorCode, formatCredits } from '../state';

export function Shell({ big = false }: { big?: boolean }) {
  const hasProfile = useHasProfile();
  const me = usePlayer();
  const actions = useActions();
  const selectedId = useSelectedObjectId();
  const obj = useObject(selectedId);
  const claims = useClaims();
  const api = useSceneStore(s => s.api);
  const events = useEvents(5);
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const box: React.CSSProperties = { position: 'absolute', background: '#111c', padding: 12, borderRadius: 8, fontFamily: 'monospace', fontSize: 13 };

  if (!hasProfile) {
    return (
      <div style={{ ...box, inset: 0, display: 'grid', placeItems: 'center' }}>
        <form onSubmit={e => { e.preventDefault(); actions.setProfile(name, 'blue').catch(e => setErr(reducerErrorCode(e) ?? String(e))); }}>
          <h1>Claim the universe before someone else does.</h1>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="callsign" />
          <button type="submit">Enter</button>
          {err && <p>{err}</p>}
        </form>
      </div>
    );
  }

  return (
    <>
      <div style={{ ...box, top: 12, left: 12 }}>
        {me?.callsign} · {formatCredits(me?.credits ?? 0)} cr · {big ? 'BIG' : 'explorer'}
        <button onClick={() => api?.teleport()} style={{ marginLeft: 8 }}>Teleport</button>
      </div>
      <div style={{ ...box, bottom: 12, left: 12, maxWidth: 320 }}>
        {events.map(e => <div key={e.id}>{e.actorCallsign} {e.kind} {e.objectId} {e.amount ? formatCredits(e.amount) : ''}</div>)}
      </div>
      {obj && (
        <div style={{ ...box, bottom: 12, right: 12, width: 300 }}>
          <b>{obj.name}</b> · {obj.cls} · {formatCredits(obj.priceCredits)} cr
          <div>{claims.get(obj.id) ? `owned by ${claims.get(obj.id)!.ownerCallsign}` : 'unclaimed'}</div>
          <button onClick={() => { setErr(null); actions.claim(obj.id).catch(e => setErr(reducerErrorCode(e) ?? String(e))); }}>Claim</button>
          {err && <div style={{ color: '#f66' }}>{err}</div>}
        </div>
      )}
    </>
  );
}
