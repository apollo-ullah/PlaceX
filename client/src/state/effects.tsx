// Cross-module effects owned by the lead: when anyone else claims or takes over an object,
// ask the scene to play a ripple there so every screen (and the big screen) sees it land.
import { useEffect, useRef } from 'react';
import { useGame } from './game';
import { useSceneStore } from './sceneStore';
import { CREWS } from '../types';

export function ClaimEffects() {
  const { events, identity, players } = useGame();
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    // Skip the backlog on first load; only animate events that arrive live.
    if (!primed.current) {
      for (const e of events) seen.current.add(e.id);
      primed.current = true;
      return;
    }
    const api = useSceneStore.getState().api;
    for (const e of events) {
      if (seen.current.has(e.id)) continue;
      seen.current.add(e.id);
      if ((e.kind === 'claim' || e.kind === 'takeover' || e.kind === 'auction_won') && e.actor !== identity && e.objectId) {
        const crew = players.find(p => p.identity === e.actor)?.crew ?? 'blue';
        api?.playClaimRipple?.(e.objectId, CREWS[crew].color);
      }
    }
    if (seen.current.size > 2000) seen.current = new Set(events.map(e => e.id));
  }, [events, identity, players]);

  return null;
}

/** Sends the camera focus and position to the server whenever the scene settles.
 *  The provider throttles to 5 Hz; the scene only updates these on settle. */
export function PresenceSync() {
  const { actions, hasProfile } = useGame();
  const focus = useSceneStore(s => s.focusObjectId);
  const pos = useSceneStore(s => s.cameraPos);
  useEffect(() => {
    if (!hasProfile || !focus) return;
    actions.sendPresence(focus, pos.x, pos.y, pos.z);
  }, [actions, hasProfile, focus, pos]);
  return null;
}
