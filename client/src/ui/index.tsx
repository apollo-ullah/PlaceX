// PlaceX UI shell. Rendered on top of the 3D scene inside a fixed full-screen div.
//   <Shell big={false} /> explorer: landing until hasProfile, then HUD, leaderboard, ticker, listing card.
//   <Shell big />         venue display: stats, ticker, leaderboard, QR slot.
// The .px-root layer is pointer-events: none so taps fall through to the scene; each child re-enables them.
import './ui.css';
import { useHasProfile, useSelectedObjectId } from '../state';
import { ToastProvider } from './Toast';
import { Landing } from './Landing';
import { ConnectionPill, Credits, Search, Teleport } from './Hud';
import { Leaderboard } from './Leaderboard';
import { Ticker } from './Ticker';
import { ListingCard } from './ListingCard';
import { BigScreen } from './BigScreen';

export function Shell({ big = false }: { big?: boolean }) {
  return (
    <ToastProvider>
      {big ? <div className="px-root"><BigScreen /></div> : <Explorer />}
    </ToastProvider>
  );
}

function Explorer() {
  const hasProfile = useHasProfile();
  const selectedId = useSelectedObjectId();

  if (!hasProfile) return <div className="px-root"><Landing /></div>;

  return (
    <div className={`px-root ${selectedId ? 'px-root--card' : ''}`}>
      <div className="px-hud-top">
        <Credits />
        <Search />
        <Leaderboard />
      </div>
      <div className="px-hud-bottom">
        <Ticker />
        <Teleport />
        <span className="px-hud-bottom__spacer" />
      </div>
      <ConnectionPill />
      <ListingCard />
    </div>
  );
}
