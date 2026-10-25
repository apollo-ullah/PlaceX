// Audio dev panel: lists the catalog with Play and Stop per object and shows the computed
// sound parameters, so each layer can be verified without the UI. Mount it when the URL has
// ?audio=1 (see HANDOFF.md). It only needs the objects store, not the GameProvider.
import { useEffect, useState, type CSSProperties } from 'react';
import { useObjects } from '../state';
import type { CelestialObject } from '../types';
import {
  playPlanetSound, stopSound, isPlaying, getCurrentObjectId, getAudioState, onAudioChange,
  startVoice, stopVoice, isVoiceActive, windShape, orbitToneHz, SOUND_DISCLAIMER,
} from './index';

const panel: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 10000, overflow: 'auto', padding: 12,
  background: 'rgba(0,0,0,0.94)', color: '#f4f4f5', fontFamily: 'var(--font-mono, monospace)',
  fontSize: 12, lineHeight: 1.4, touchAction: 'pan-y',
};
const row: CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center',
  padding: '8px 0', borderTop: '1px solid #222',
};
const btn = (active = false): CSSProperties => ({
  minWidth: 44, minHeight: 44, padding: '0 14px', borderRadius: 8, border: '1px solid #444',
  background: active ? '#ffd54a' : '#161616', color: active ? '#000' : '#f4f4f5', cursor: 'pointer',
});
const muted: CSSProperties = { color: '#9a9aa3' };

const LAYER_COLOR: Record<string, string> = {
  wind: '#9ad0ff', lava: '#ff6a3d', storm: '#b84dff', ice: '#9ffff2', silence: '#9a9aa3',
};

export default function DevPanel() {
  const { list, loaded } = useObjects();
  const [, bump] = useState(0);
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceMsg, setVoiceMsg] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => onAudioChange(() => bump(n => n + 1)), []);
  useEffect(() => {
    const id = setInterval(() => bump(n => n + 1), 1000);   // context state can change on its own
    return () => clearInterval(id);
  }, []);

  const currentId = getCurrentObjectId();
  const current = list.find(o => o.id === currentId) ?? null;

  const toggleVoice = async () => {
    if (isVoiceActive()) { stopVoice(); setVoiceOn(false); setVoiceMsg(''); return; }
    setVoiceMsg('asking for the mic...');
    const ok = await startVoice(current?.sound.pitchRatio);
    setVoiceOn(ok);
    setVoiceMsg(ok ? `live at x${(current?.sound.pitchRatio ?? 1).toFixed(2)} (use headphones)` : 'mic unavailable or denied');
  };

  const q = filter.trim().toLowerCase();
  const shown = (q ? list.filter(o => o.name.toLowerCase().includes(q) || o.system.toLowerCase().includes(q)) : list).slice(0, 60);

  return (
    <div style={panel}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 14 }}>PlaceX audio dev panel</strong>
        <span style={muted}>context: {getAudioState()}</span>
        <span style={muted}>playing: {isPlaying() ? currentId : 'no'}</span>
        <button style={btn()} onClick={() => stopSound()}>Stop</button>
        <button style={btn(voiceOn)} onClick={() => void toggleVoice()}>{voiceOn ? 'Mute voice' : 'Hear your voice there'}</button>
        <span style={muted}>{voiceMsg}</span>
      </div>
      <div style={{ ...muted, marginBottom: 8 }}>{SOUND_DISCLAIMER}</div>
      <input
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="filter by name or system"
        style={{ width: '100%', minHeight: 40, padding: '0 10px', borderRadius: 8, border: '1px solid #444', background: '#111', color: '#f4f4f5', marginBottom: 8 }}
      />
      {!loaded && <div style={muted}>loading /data/objects.json...</div>}
      {shown.map(o => <Row key={o.id} o={o} active={o.id === currentId} />)}
      {loaded && list.length > shown.length && <div style={{ ...muted, paddingTop: 8 }}>showing {shown.length} of {list.length}, type to filter</div>}
    </div>
  );
}

function Row({ o, active }: { o: CelestialObject; active: boolean }) {
  const s = o.sound;
  const shape = windShape(s);
  const detail = s.layer === 'silence'
    ? `orbit tone ${orbitToneHz(o.orbitalPeriodDays).toFixed(0)} Hz from ${o.orbitalPeriodDays ?? '?'} d`
    : `lp ${shape.lowpassHz.toFixed(0)} Hz, hp ${shape.highpassHz.toFixed(0)} Hz, body ${shape.bodyHz.toFixed(0)} Hz`;
  return (
    <div style={row}>
      <div>
        <div>
          <strong>{o.name}</strong> <span style={muted}>{o.system}, {o.cls}</span>{' '}
          <span style={{ color: LAYER_COLOR[s.layer] ?? '#fff' }}>{s.layer}</span>
        </div>
        <div style={muted}>
          v {s.speedOfSound} m/s, pitch x{s.pitchRatio}, density {s.density}, {detail}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button style={btn(active)} onClick={() => playPlanetSound(o)}>{active ? 'Playing' : 'Play'}</button>
        <button style={btn()} onClick={() => stopSound()} aria-label={`stop ${o.name}`}>Stop</button>
      </div>
    </div>
  );
}
