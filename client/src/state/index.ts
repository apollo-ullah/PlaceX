// Public surface of the state layer. Import from '../state' only.
import { createElement, type ReactNode } from 'react';
import { LiveProvider } from './LiveProvider';
import { MockProvider } from './MockProvider';

export * from './game';
export * from './objects';
export * from './sceneStore';
export { ClaimEffects, PresenceSync } from './effects';
export { LiveProvider, MockProvider };

export const IS_MOCK = import.meta.env.VITE_MOCK === '1';

/** Picks the live or mock provider from VITE_MOCK. */
export function GameProvider({ children }: { children: ReactNode }) {
  return createElement(IS_MOCK ? MockProvider : LiveProvider, null, children);
}
