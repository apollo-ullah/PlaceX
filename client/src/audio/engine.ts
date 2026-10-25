// PlaceX audio engine. Web Audio API only, no samples, no dependencies.
//
// Everything you hear is synthesized from noise buffers and oscillators:
//   wind     filtered noise loop, playbackRate = pitchRatio, low-pass cutoff from density
//   lava     wind + crackle bursts (band-passed noise) + low rumble
//   storm    wind with deep gusts + distant thunder rolls
//   ice      wind + a thin, wandering high whistle
//   silence  one silent beat, then a soft orbit tone whose pitch maps from orbitalPeriodDays
//
// Every public function is safe to call before a user gesture, during SSR-less Vite dev
// and on iOS Safari. Failures are swallowed and logged at debug level.

import type { CelestialObject, SoundLayer, SoundParams } from '../types';

export const SOUND_DISCLAIMER = 'Space is silent. This is the wind you would hear standing in its atmosphere.';

const FADE = 0.15;         // seconds, start and stop fades (no clicks)
const CROSSFADE = 0.45;    // seconds, when switching between objects
const MASTER_LEVEL = 0.85;
const NOISE_SECONDS = 6;   // length of the looped noise buffers

type Listener = () => void;

interface Voice {
  id: string;
  gain: GainNode;
  level: number;                       // steady-state gain for this voice
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  timers: number[];
  disposed: boolean;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let limiter: DynamicsCompressorNode | null = null;
let whiteBuf: AudioBuffer | null = null;
let brownBuf: AudioBuffer | null = null;

let current: Voice | null = null;
let stopping = false;
let stopTimer = 0;
let gestureHooked = false;
const listeners = new Set<Listener>();

const log = (...a: unknown[]) => { if (import.meta.env.DEV) console.debug('[audio]', ...a); };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

// ---------------------------------------------------------------------------
// Context lifecycle
// ---------------------------------------------------------------------------

/** Returns the shared AudioContext, creating it lazily. Null when Web Audio is unavailable. */
export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const AC = w.AudioContext ?? w.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 12;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.005;
      limiter.release.value = 0.2;
      limiter.connect(ctx.destination);
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(limiter);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && current) tryResume();
      });
      log('context created, sampleRate', ctx.sampleRate);
    }
    tryResume();
    return ctx;
  } catch (e) {
    log('context unavailable', e);
    return null;
  }
}

/** The node that voice (mic) output should connect to; it bypasses the planet master fade. */
export function getOutputNode(): AudioNode | null {
  getAudioContext();
  return limiter;
}

function tryResume() {
  if (!ctx) return;
  // iOS reports 'interrupted' after a phone call or when another app grabs audio.
  if ((ctx.state as string) !== 'running') {
    ctx.resume().then(() => notify()).catch(() => { /* needs a gesture; hooked below */ });
    hookGesture();
  }
}

// Before the first user gesture, resume() is refused. We listen (once, passively) for the
// next tap or key and resume then, so a sound requested early starts on the first touch.
function hookGesture() {
  if (gestureHooked || typeof document === 'undefined') return;
  gestureHooked = true;
  const onGesture = () => {
    if (!ctx) return;
    if ((ctx.state as string) !== 'running') ctx.resume().then(() => notify()).catch(() => { /* retry on next gesture */ });
  };
  for (const ev of ['pointerdown', 'touchend', 'keydown', 'click']) {
    document.addEventListener(ev, onGesture, { capture: true, passive: true });
  }
}

function noiseBuffers(c: AudioContext): { white: AudioBuffer; brown: AudioBuffer } {
  if (!whiteBuf || !brownBuf) {
    const n = Math.floor(c.sampleRate * NOISE_SECONDS);
    whiteBuf = c.createBuffer(1, n, c.sampleRate);
    brownBuf = c.createBuffer(1, n, c.sampleRate);
    const w = whiteBuf.getChannelData(0);
    const b = brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const v = Math.random() * 2 - 1;
      w[i] = v;
      last = (last + 0.02 * v) / 1.02;   // leaky integrator: brown (1/f^2) noise
      b[i] = last * 3.5;
    }
  }
  return { white: whiteBuf, brown: brownBuf };
}

// ---------------------------------------------------------------------------
// Parameter mapping
// ---------------------------------------------------------------------------

export interface WindShape {
  pitchRatio: number;
  lowpassHz: number;    // falls as density rises: thick air is muffled
  highpassHz: number;   // rises as density falls: thin air is whispery
  bassDb: number;       // low shelf boost for crushing atmospheres
  level: number;        // wind loudness
  bodyHz: number;       // centre of the main wind band
  swirlHz: number;      // centre of the moving whistle band
}

/** Maps the catalog sound params to filter settings. Exported so the dev panel can show them. */
export function windShape(s: SoundParams): WindShape {
  const pr = clamp(s.pitchRatio || 1, 0.25, 4);
  const d = Math.max(s.density, 0.001);
  const thinness = clamp(-Math.log10(d), 0, 2) / 2;   // 0 at Earth, 1 at density 0.01 (Mars)
  const heaviness = clamp(Math.log10(d), 0, 2) / 2;   // 0 at Earth, 1 at density 100 (Venus)
  return {
    pitchRatio: pr,
    lowpassHz: clamp(4000 / Math.sqrt(d), 380, 14000),   // Earth 4000, Jupiter 730, Venus 420, Mars 14000
    highpassHz: 70 + thinness * 1300,
    bassDb: heaviness * 7,
    level: 0.75 * (1 - 0.5 * thinness) * (1 + 0.1 * heaviness),
    bodyHz: 260 * Math.pow(pr, 0.75),
    swirlHz: 900 * pr,
  };
}

/** Orbit tone pitch: 1 day or less is 880 Hz, 10,000 days or more is 110 Hz, log scale. */
export function orbitToneHz(periodDays: number | null): number {
  if (!periodDays || !(periodDays > 0)) return 220;
  const t = clamp(Math.log10(periodDays), 0, 4) / 4;
  return 880 * Math.pow(110 / 880, t);
}

// ---------------------------------------------------------------------------
// Voice construction
// ---------------------------------------------------------------------------

function newVoice(c: AudioContext, id: string, level: number): Voice {
  const gain = c.createGain();
  gain.gain.value = 0;
  gain.connect(master!);
  return { id, gain, level, sources: [], nodes: [gain], timers: [], disposed: false };
}

function disposeVoice(v: Voice) {
  if (v.disposed) return;
  v.disposed = true;
  for (const t of v.timers) { clearTimeout(t); clearInterval(t); }
  for (const s of v.sources) { try { s.stop(); } catch { /* never started or already stopped */ } }
  for (const n of v.nodes) { try { n.disconnect(); } catch { /* already disconnected */ } }
  v.sources.length = 0;
  v.nodes.length = 0;
}

/** setTimeout that is cancelled when the voice is disposed. */
function later(v: Voice, ms: number, fn: () => void) {
  const t = window.setTimeout(() => { if (!v.disposed) fn(); }, ms);
  v.timers.push(t);
}

/** Repeats fn at random intervals in [minMs, maxMs] while the voice lives. */
function repeat(v: Voice, minMs: number, maxMs: number, fn: () => void) {
  const tick = () => {
    if (v.disposed) return;
    if (ctx && (ctx.state as string) === 'running') fn();
    later(v, rand(minMs, maxMs), tick);
  };
  later(v, rand(minMs, maxMs) * 0.3, tick);
}

function glide(p: AudioParam, value: number, tc: number) {
  if (!ctx) return;
  p.setTargetAtTime(value, ctx.currentTime, tc);
}

/** Looping noise source. */
function noise(c: AudioContext, v: Voice, buf: AudioBuffer, rate = 1): AudioBufferSourceNode {
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.loopStart = 0;
  src.loopEnd = buf.duration;
  src.playbackRate.value = rate;
  src.start(c.currentTime, Math.random() * buf.duration);
  v.sources.push(src);
  v.nodes.push(src);
  return src;
}

function osc(c: AudioContext, v: Voice, type: OscillatorType, hz: number, when = c.currentTime): OscillatorNode {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = hz;
  o.start(when);
  v.sources.push(o);
  v.nodes.push(o);
  return o;
}

function filter(c: AudioContext, v: Voice, type: BiquadFilterType, hz: number, q = 1, gainDb = 0): BiquadFilterNode {
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  f.gain.value = gainDb;
  v.nodes.push(f);
  return f;
}

function gainNode(c: AudioContext, v: Voice, value: number): GainNode {
  const g = c.createGain();
  g.gain.value = value;
  v.nodes.push(g);
  return g;
}

// --- Base wind loop ----------------------------------------------------------

interface Wind { out: GainNode; gust: (level: number) => void; shape: WindShape }

function buildWind(c: AudioContext, v: Voice, s: SoundParams, opts: { gustMin: number; gustMax: number; gustTc: number; levelMul: number }): Wind {
  const shape = windShape(s);
  const { white } = noiseBuffers(c);

  const src = noise(c, v, white, shape.pitchRatio);
  const hp = filter(c, v, 'highpass', shape.highpassHz, 0.7);
  const shelf = filter(c, v, 'lowshelf', 160, 1, shape.bassDb);
  const lp = filter(c, v, 'lowpass', shape.lowpassHz, 0.9);
  const out = gainNode(c, v, shape.level * opts.levelMul);

  // Two parallel bands: a broad body and a narrower swirl that wanders with the gusts.
  const body = filter(c, v, 'bandpass', shape.bodyHz, 0.6);
  const bodyGain = gainNode(c, v, 1.0);
  const swirl = filter(c, v, 'bandpass', shape.swirlHz, 3.5);
  const swirlGain = gainNode(c, v, 0.35);

  src.connect(hp);
  hp.connect(body); body.connect(bodyGain); bodyGain.connect(shelf);
  hp.connect(swirl); swirl.connect(swirlGain); swirlGain.connect(shelf);
  shelf.connect(lp);
  lp.connect(out);

  const gust = (g: number) => {
    glide(out.gain, shape.level * opts.levelMul * g, opts.gustTc);
    glide(body.frequency, shape.bodyHz * (0.8 + 0.45 * g), opts.gustTc * 1.3);
    glide(swirl.frequency, shape.swirlHz * (0.65 + 0.7 * g), opts.gustTc * 0.8);
    glide(swirlGain.gain, 0.2 + 0.35 * g, opts.gustTc);
  };
  // Slow random gusts: pick a new target every 0.5 to 1.8 s and ease toward it.
  repeat(v, 500, 1800, () => gust(rand(opts.gustMin, opts.gustMax)));
  gust(rand(opts.gustMin, opts.gustMax));
  return { out, gust, shape };
}

// --- Layers ------------------------------------------------------------------

function addLavaLayer(c: AudioContext, v: Voice, wind: Wind) {
  const { white, brown } = noiseBuffers(c);

  // Low rumble: brown noise under 110 Hz plus a slow sub tone that drifts.
  const rumbleSrc = noise(c, v, brown, 0.9);
  const rumbleLp = filter(c, v, 'lowpass', 110, 1.2);
  const rumbleGain = gainNode(c, v, 0.9);
  rumbleSrc.connect(rumbleLp); rumbleLp.connect(rumbleGain); rumbleGain.connect(v.gain);
  repeat(v, 700, 2200, () => glide(rumbleGain.gain, rand(0.5, 1.2), 0.6));

  const sub = osc(c, v, 'sine', 46);
  const subGain = gainNode(c, v, 0.22);
  sub.connect(subGain); subGain.connect(v.gain);
  repeat(v, 1500, 4000, () => glide(sub.frequency, rand(38, 56), 1.2));

  // Crackle: short band-passed noise bursts at random intervals, each a few ms long.
  const crackleBus = gainNode(c, v, 0.8);
  crackleBus.connect(v.gain);
  repeat(v, 35, 320, () => {
    const t = c.currentTime;
    const burst = c.createBufferSource();
    burst.buffer = white;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = rand(1200, 5200);
    bp.Q.value = rand(3, 9);
    const env = c.createGain();
    const peak = rand(0.15, 0.7);
    const dur = rand(0.012, 0.09);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    burst.connect(bp); bp.connect(env); env.connect(crackleBus);
    burst.start(t, Math.random() * (white.duration - 0.2));
    burst.stop(t + dur + 0.01);
    burst.onended = () => { try { burst.disconnect(); bp.disconnect(); env.disconnect(); } catch { /* noop */ } };
  });
  wind.out.gain.value *= 0.7;
}

function addStormLayer(c: AudioContext, v: Voice, wind: Wind) {
  const { brown, white } = noiseBuffers(c);
  const thunderBus = gainNode(c, v, 1.0);
  thunderBus.connect(v.gain);

  const roll = () => {
    const t = c.currentTime + rand(0, 0.3);
    const attack = rand(0.15, 0.7);
    const decay = rand(2.0, 5.0);
    const peak = rand(0.5, 1.0);

    // The roll: brown noise swept through a falling low-pass.
    const src = c.createBufferSource();
    src.buffer = brown;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(rand(260, 420), t);
    lp.frequency.exponentialRampToValueAtTime(rand(60, 110), t + attack + decay);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(lp); lp.connect(env); env.connect(thunderBus);
    src.start(t, Math.random() * (brown.duration - 6));
    src.stop(t + attack + decay + 0.05);
    src.onended = () => { try { src.disconnect(); lp.disconnect(); env.disconnect(); } catch { /* noop */ } };

    // Sometimes a sharper crack rides on top of the roll.
    if (Math.random() < 0.45) {
      const crack = c.createBufferSource();
      crack.buffer = white;
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = rand(500, 1200);
      const cenv = c.createGain();
      const ct = t + attack * rand(0.3, 0.9);
      cenv.gain.setValueAtTime(0.0001, ct);
      cenv.gain.exponentialRampToValueAtTime(peak * 0.35, ct + 0.01);
      cenv.gain.exponentialRampToValueAtTime(0.0001, ct + rand(0.15, 0.4));
      crack.connect(hp); hp.connect(cenv); cenv.connect(thunderBus);
      crack.start(ct, Math.random() * (white.duration - 1));
      crack.stop(ct + 0.5);
      crack.onended = () => { try { crack.disconnect(); hp.disconnect(); cenv.disconnect(); } catch { /* noop */ } };
    }
    // Gust with the thunder so the wind reacts to the storm.
    wind.gust(rand(1.0, 1.35));
  };
  later(v, rand(600, 1800), roll);
  repeat(v, 3500, 9000, roll);
}

function addIceLayer(c: AudioContext, v: Voice, wind: Wind) {
  const { white } = noiseBuffers(c);
  const pr = clamp(wind.shape.pitchRatio, 0.5, 2);
  const base = 2100 * Math.sqrt(pr);

  // A thin sine whistle with slow vibrato and a wandering centre pitch.
  const whistle = osc(c, v, 'sine', base);
  const shimmer = osc(c, v, 'sine', base * 1.5);
  const vib = osc(c, v, 'sine', 0.35);
  const vibDepth = gainNode(c, v, 22);
  vib.connect(vibDepth); vibDepth.connect(whistle.frequency); vibDepth.connect(shimmer.frequency);

  const wGain = gainNode(c, v, 0.045);
  const sGain = gainNode(c, v, 0.012);
  whistle.connect(wGain); shimmer.connect(sGain);
  wGain.connect(v.gain); sGain.connect(v.gain);

  // Airy component: the same noise, through a very narrow band around the whistle.
  const airSrc = noise(c, v, white, 1);
  const airBp = filter(c, v, 'bandpass', base, 18);
  const airGain = gainNode(c, v, 0.5);
  airSrc.connect(airBp); airBp.connect(airGain); airGain.connect(v.gain);

  repeat(v, 900, 2600, () => {
    const f = base * rand(0.85, 1.25);
    glide(whistle.frequency, f, 0.9);
    glide(shimmer.frequency, f * 1.5, 0.9);
    glide(airBp.frequency, f, 0.9);
    const g = rand(0.2, 1.0);
    glide(wGain.gain, 0.02 + 0.05 * g, 0.7);
    glide(sGain.gain, 0.004 + 0.014 * g, 0.7);
    glide(airGain.gain, 0.25 + 0.5 * g, 0.7);
  });
}

function buildSilence(c: AudioContext, v: Voice, obj: CelestialObject) {
  // One beat of nothing, then the orbit tone fades in: no atmosphere, here is the orbit instead.
  const start = c.currentTime + 1.0;
  const hz = orbitToneHz(obj.orbitalPeriodDays);

  const tone = osc(c, v, 'sine', hz, start);
  const harm = osc(c, v, 'sine', hz * 2, start);
  const vib = osc(c, v, 'sine', 0.28, start);
  const vibDepth = gainNode(c, v, hz * 0.005);
  vib.connect(vibDepth); vibDepth.connect(tone.frequency);

  const toneGain = gainNode(c, v, 0);
  const harmGain = gainNode(c, v, 0);
  tone.connect(toneGain); harm.connect(harmGain);
  toneGain.gain.setValueAtTime(0, start);
  toneGain.gain.linearRampToValueAtTime(0.26, start + 1.6);
  harmGain.gain.setValueAtTime(0, start);
  harmGain.gain.linearRampToValueAtTime(0.05, start + 2.2);

  // Slow breathing on the amplitude.
  const breath = osc(c, v, 'sine', 0.11, start);
  const breathDepth = gainNode(c, v, 0.06);
  breath.connect(breathDepth); breathDepth.connect(toneGain.gain);

  const lp = filter(c, v, 'lowpass', 2400, 0.7);
  toneGain.connect(lp); harmGain.connect(lp);

  // The tone slowly circles the listener. Pan rate follows the orbit, loosely.
  if (typeof c.createStereoPanner === 'function') {
    const pan = c.createStereoPanner();
    v.nodes.push(pan);
    const panLfo = osc(c, v, 'sine', clamp(1 / Math.max(obj.orbitalPeriodDays ?? 30, 1), 0.04, 0.25), start);
    const panDepth = gainNode(c, v, 0.6);
    panLfo.connect(panDepth); panDepth.connect(pan.pan);
    lp.connect(pan); pan.connect(v.gain);
  } else {
    lp.connect(v.gain);
  }
}

function buildVoice(c: AudioContext, obj: CelestialObject): Voice {
  const layer: SoundLayer = obj.sound?.layer ?? 'wind';
  const v = newVoice(c, obj.id, 1.0);
  if (layer === 'silence') {
    buildSilence(c, v, obj);
    return v;
  }
  const s: SoundParams = {
    speedOfSound: obj.sound?.speedOfSound ?? 343,
    pitchRatio: obj.sound?.pitchRatio ?? 1,
    density: obj.sound?.density > 0 ? obj.sound.density : 1,
    layer,
  };
  switch (layer) {
    case 'lava': {
      const wind = buildWind(c, v, s, { gustMin: 0.35, gustMax: 0.9, gustTc: 0.5, levelMul: 0.8 });
      wind.out.connect(v.gain);
      addLavaLayer(c, v, wind);
      break;
    }
    case 'storm': {
      const wind = buildWind(c, v, s, { gustMin: 0.25, gustMax: 1.3, gustTc: 0.35, levelMul: 1.0 });
      wind.out.connect(v.gain);
      addStormLayer(c, v, wind);
      break;
    }
    case 'ice': {
      const wind = buildWind(c, v, s, { gustMin: 0.3, gustMax: 1.0, gustTc: 0.6, levelMul: 0.8 });
      wind.out.connect(v.gain);
      addIceLayer(c, v, wind);
      break;
    }
    case 'wind':
    default: {
      const wind = buildWind(c, v, s, { gustMin: 0.35, gustMax: 1.0, gustTc: 0.5, levelMul: 1.0 });
      wind.out.connect(v.gain);
    }
  }
  return v;
}

// ---------------------------------------------------------------------------
// Fades
// ---------------------------------------------------------------------------

function rampGain(p: AudioParam, to: number, seconds: number) {
  if (!ctx) return;
  const t = ctx.currentTime;
  p.cancelScheduledValues(t);
  p.setValueAtTime(p.value, t);
  p.linearRampToValueAtTime(to, t + seconds);
}

function notify() { for (const l of listeners) { try { l(); } catch { /* listener error is not ours */ } } }

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Starts the atmosphere sound for an object. Idempotent: the same object is a no-op,
 * a different object crossfades. Safe before a user gesture (starts on the next tap).
 */
export function playPlanetSound(obj: CelestialObject): void {
  try {
    if (!obj) return;
    const c = getAudioContext();
    if (!c || !master) return;

    if (current && current.id === obj.id && !current.disposed) {
      if (stopping) {
        // A stop was in flight for this same object: cancel it and fade back in.
        clearTimeout(stopTimer);
        stopping = false;
        rampGain(master.gain, MASTER_LEVEL, FADE);
        rampGain(current.gain.gain, current.level, FADE);
        notify();
      }
      return;
    }

    clearTimeout(stopTimer);
    stopping = false;
    const prev = current;
    const next = buildVoice(c, obj);
    current = next;

    const fade = prev ? CROSSFADE : FADE;
    if (prev) {
      rampGain(prev.gain.gain, 0, fade);
      const old = prev;
      window.setTimeout(() => disposeVoice(old), fade * 1000 + 60);
    }
    rampGain(master.gain, MASTER_LEVEL, FADE);
    rampGain(next.gain.gain, next.level, fade);
    log('play', obj.id, obj.sound);
    notify();
  } catch (e) {
    log('play failed', e);
  }
}

/** Fades out over 150 ms and releases every node. Safe to call when nothing is playing. */
export function stopSound(): void {
  try {
    if (!ctx || !master || !current || stopping) return;
    stopping = true;
    rampGain(master.gain, 0, FADE);
    rampGain(current.gain.gain, 0, FADE);
    const v = current;
    stopTimer = window.setTimeout(() => {
      disposeVoice(v);
      if (current === v) current = null;
      stopping = false;
      notify();
    }, FADE * 1000 + 60);
    log('stop', v.id);
    notify();
  } catch (e) {
    log('stop failed', e);
  }
}

export function isPlaying(): boolean {
  return current !== null && !current.disposed && !stopping;
}

/** The id of the object currently sounding (also during its stop fade), else null. */
export function getCurrentObjectId(): string | null {
  return current && !current.disposed ? current.id : null;
}

/** State of the underlying context for diagnostics: 'none' before it exists. */
export function getAudioState(): string {
  return ctx ? (ctx.state as string) : 'none';
}

/** Subscribe to play, stop and context-state changes. Returns an unsubscribe function. */
export function onAudioChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
