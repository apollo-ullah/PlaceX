// PlaceX audio. Public contract (fixed):
//   playPlanetSound(obj): start the atmosphere sound for a CelestialObject (idempotent)
//   stopSound(): fade out and stop
//   isPlaying(): boolean
//   SOUND_DISCLAIMER: honest copy shown on the card
// Extras:
//   getCurrentObjectId(): id of the object sounding now, or null
//   startVoice(ratio?) / stopVoice() / isVoiceActive(): mic pitch-shifted to the planet
//   onAudioChange(fn): subscribe to play and stop events (used by the dev panel)
// The dev panel lives in ./DevPanel.tsx and is imported separately so this module stays
// free of React. See HANDOFF.md.
import type { CelestialObject } from '../types';
import { playPlanetSound as play } from './engine';
import { rememberRatio } from './voice';

export {
  SOUND_DISCLAIMER,
  stopSound,
  isPlaying,
  getCurrentObjectId,
  getAudioState,
  onAudioChange,
  windShape,
  orbitToneHz,
} from './engine';
export { startVoice, stopVoice, isVoiceActive, getVoiceRatio } from './voice';

export function playPlanetSound(obj: CelestialObject): void {
  if (obj?.id) rememberRatio(obj.id, obj.sound?.pitchRatio ?? 1);
  play(obj);
}
