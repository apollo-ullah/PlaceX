// PlaceX universe explorer. <Scene /> fills its parent; the UI Shell is layered on top.
// See HANDOFF.md in this folder for the layout mapping, the SceneApi and how to test.
import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useObjects } from '../state';
import { DEBUG, IS_MOBILE, rig } from './bus';
import { CameraRig, BASE_FOV } from './CameraRig';
import { Effects } from './Effects';
import { Interaction } from './Interaction';
import { Objects } from './Objects';
import { Stars } from './Stars';
import { SystemView } from './SystemView';

export { worldPosition, compressPoint, expandPoint, LAYOUT } from './layout';

const DPR = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);

function FpsProbe() {
  const acc = useRef({ frames: 0, t0: performance.now(), worst: 0 });
  useFrame((_, dt) => {
    const a = acc.current;
    a.frames++;
    a.worst = Math.max(a.worst, dt * 1000);
    const now = performance.now();
    if (now - a.t0 >= 500) {
      rig.fps = (a.frames * 1000) / (now - a.t0);
      rig.frameMs = a.worst;
      a.frames = 0; a.worst = 0; a.t0 = now;
    }
  });
  return null;
}

function DebugOverlay() {
  const { list } = useObjects();
  const [txt, setTxt] = useState('');
  useEffect(() => {
    const id = setInterval(() => {
      const cam = rig.camera;
      const pos = cam ? `${cam.position.x.toFixed(1)}, ${cam.position.y.toFixed(1)}, ${cam.position.z.toFixed(1)}` : '';
      setTxt(`${rig.fps.toFixed(0)} fps  worst ${rig.frameMs.toFixed(1)} ms\n${list.length} instances  dpr ${DPR}${IS_MOBILE ? '  mobile' : ''}\ncam ${pos}`);
    }, 500);
    return () => clearInterval(id);
  }, [list.length]);
  return (
    <pre style={{
      position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 8px)', right: 8, margin: 0,
      padding: '6px 8px', background: '#000a', color: '#9f9', font: '11px/1.4 monospace',
      borderRadius: 6, pointerEvents: 'none', zIndex: 9999, whiteSpace: 'pre',
    }}>{txt}</pre>
  );
}

export function Scene() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', overflow: 'hidden' }}>
      <Canvas
        dpr={DPR}
        flat
        gl={{ antialias: !IS_MOBILE, alpha: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: BASE_FOV, near: 0.02, far: 2000, position: [0, 42, 118] }}
        onCreated={({ gl }) => { gl.setClearColor('#000000', 1); }}
        style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
      >
        <Stars />
        <Objects />
        <SystemView />
        <Effects />
        <CameraRig />
        <Interaction />
        {DEBUG && <FpsProbe />}
      </Canvas>
      {DEBUG && <DebugOverlay />}
    </div>
  );
}
