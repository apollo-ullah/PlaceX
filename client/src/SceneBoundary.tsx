// Keeps the UI alive if WebGL is unavailable or the scene throws. Owned by the lead.
import { Component, type ReactNode } from 'react';

export class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error('[placex] scene failed, running without 3D', err); }
  render() {
    if (this.state.failed) {
      return (
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 40%, #0b0b14 0%, #000 70%)' }}>
          <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 56px)', left: 0, right: 0, textAlign: 'center', color: '#777', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            3D view unavailable on this device. Search still works.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
