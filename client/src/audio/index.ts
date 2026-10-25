// STUB. The audio agent replaces this whole folder. Contract:
//   playPlanetSound(obj): start the atmosphere sound for a CelestialObject (idempotent)
//   stopSound(): fade out and stop
//   isPlaying(): boolean
//   SOUND_DISCLAIMER: honest copy shown on the card
import type { CelestialObject } from '../types';

export const SOUND_DISCLAIMER = 'Space is silent. This is the wind you would hear standing in its atmosphere.';

let playing = false;
export function playPlanetSound(obj: CelestialObject): void {
  playing = true;
  console.info('[audio stub] play', obj.id, obj.sound);
}
export function stopSound(): void { playing = false; }
export function isPlaying(): boolean { return playing; }
