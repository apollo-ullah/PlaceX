// App composition. Owned by the lead.
// Routes: "/" explorer, "/big" big screen mode (Phase 3).
import { Routes, Route } from 'react-router-dom';
import { GameProvider } from './state';
import { Scene } from './scene';
import { Shell } from './ui';
import { lazy, Suspense } from 'react';

const AudioDevPanel = lazy(() => import('./audio/DevPanel'));
const audioDev = typeof location !== 'undefined' && new URLSearchParams(location.search).get('audio') === '1';

export default function App() {
  return (
    <GameProvider>
      <Routes>
        <Route path="/" element={<Explorer />} />
        <Route path="/big" element={<Explorer big />} />
      </Routes>
    </GameProvider>
  );
}

function Explorer({ big = false }: { big?: boolean }) {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Scene />
      <Shell big={big} />
      {audioDev && <Suspense fallback={null}><AudioDevPanel /></Suspense>}
    </div>
  );
}
