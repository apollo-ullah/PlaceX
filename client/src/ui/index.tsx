// PlaceX UI shell. Rendered on top of the 3D scene inside a fixed full-screen div.
//   <Shell big={false} /> explorer: landing until hasProfile, then HUD, leaderboard, ticker, auction, listing card.
//   <Shell big />         venue display: stats, auction strip, ticker, leaderboard, QR slot.
// The .px-root layer is pointer-events: none so taps fall through to the scene; each child re-enables them.
import './ui.css';
import { useCallback, useEffect, useState } from 'react';
import { useHasProfile, useSceneStore, useSelectedObjectId } from '../state';
import { ToastProvider } from './Toast';
import { Landing } from './Landing';
import { ConnectionPill, Credits, Search, Teleport } from './Hud';
import { Leaderboard } from './Leaderboard';
import { Ticker } from './Ticker';
import { ListingCard } from './ListingCard';
import { BigScreen } from './BigScreen';
import { AchievementToasts, IncomeToasts, Portfolio, TakeoverBanner } from './Extras';
import { AuctionPanel } from './AuctionPanel';
import { HelpButton, Tutorial, shouldAutoOpenTutorial } from './Tutorial';

export { AuctionPanel, BidControls } from './AuctionPanel';

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
  const select = useSceneStore(s => s.select);
  const [portfolio, setPortfolio] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  const closePortfolio = useCallback(() => setPortfolio(false), []);
  const closeTutorial = useCallback(() => setTutorial(false), []);
  const openTutorial = useCallback(() => {
    select(null);
    setPortfolio(false);
    setTutorial(true);
  }, [select]);

  // Opening a listing closes the portfolio, and vice versa, so the two sheets never stack.
  useEffect(() => { if (selectedId) setPortfolio(false); }, [selectedId]);
  const openPortfolio = useCallback(() => { select(null); setPortfolio(true); }, [select]);

  // First enter in this browser: coach them once the landing is gone.
  useEffect(() => {
    if (hasProfile && shouldAutoOpenTutorial()) setTutorial(true);
  }, [hasProfile]);

  if (!hasProfile) return <div className="px-root"><Landing /></div>;

  return (
    <div className={`px-root ${selectedId || portfolio ? 'px-root--card' : ''}`}>
      <div className="px-hud-top">
        <Credits onOpenPortfolio={openPortfolio} />
        <Search />
        <div className="px-hud-top__right">
          <HelpButton onOpen={openTutorial} />
          <Leaderboard />
        </div>
      </div>
      <div className="px-hud-bottom">
        <Ticker />
        <Teleport />
        <span className="px-hud-bottom__spacer" />
        <AuctionPanel />
      </div>
      <ConnectionPill />
      <ListingCard />
      <Portfolio open={portfolio} onClose={closePortfolio} />
      <TakeoverBanner />
      <AchievementToasts />
      <IncomeToasts />
      <Tutorial open={tutorial} onClose={closeTutorial} />
    </div>
  );
}
