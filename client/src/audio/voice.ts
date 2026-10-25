// "Hear your voice there": microphone input pitch-shifted by the planet's pitchRatio.
//
// Delay-line granular shifter (the classic two-tap "Jungle" design) built only from native
// nodes: two DelayNodes whose delayTime is swept by a looping ramp buffer, each with a
// half-sine gain window, offset by half a cycle so the sum is constant power. Sweeping the
// delay at rate k = 1 - ratio changes the output pitch by `ratio`.
//
// Mic permission is requested only when startVoice() is called. Any failure returns false.

import { getAudioContext, getOutputNode, getCurrentObjectId } from './engine';

let stream: MediaStream | null = null;
let nodes: AudioNode[] = [];
let sources: AudioScheduledSourceNode[] = [];
let outGain: GainNode | null = null;
let activeRatio = 1;
let rampUp: AudioBuffer | null = null;
let rampDown: AudioBuffer | null = null;
let window_: AudioBuffer | null = null;

const log = (...a: unknown[]) => { if (import.meta.env.DEV) console.debug('[voice]', ...a); };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function buffers(c: AudioContext) {
  if (!rampUp || !rampDown || !window_) {
    const n = c.sampleRate;   // one second each
    rampUp = c.createBuffer(1, n, c.sampleRate);
    rampDown = c.createBuffer(1, n, c.sampleRate);
    window_ = c.createBuffer(1, n, c.sampleRate);
    const u = rampUp.getChannelData(0), d = rampDown.getChannelData(0), w = window_.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      u[i] = t;
      d[i] = 1 - t;
      w[i] = Math.sin(Math.PI * t);
    }
  }
  return { rampUp, rampDown, window: window_ };
}

function loopSource(c: AudioContext, buf: AudioBuffer, rate: number, when: number, offset: number) {
  const s = c.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.playbackRate.value = rate;
  s.start(when, offset);
  sources.push(s);
  nodes.push(s);
  return s;
}

/** Builds one delay tap: input -> delay(swept) -> gain(windowed) -> out. */
function tap(c: AudioContext, input: AudioNode, out: AudioNode, grain: number, rate: number, ramp: AudioBuffer, win: AudioBuffer, when: number, offset: number) {
  const delay = c.createDelay(1);
  delay.delayTime.value = 0.01;
  const mod = loopSource(c, ramp, rate, when, offset);
  const modGain = c.createGain();
  modGain.gain.value = grain;
  mod.connect(modGain);
  modGain.connect(delay.delayTime);

  const g = c.createGain();
  g.gain.value = 0;
  const w = loopSource(c, win, rate, when, offset);
  w.connect(g.gain);

  input.connect(delay);
  delay.connect(g);
  g.connect(out);
  nodes.push(delay, modGain, g);
}

/**
 * Opens the microphone and plays it back shifted by `ratio` (default: the pitchRatio of the
 * object currently playing, or 1). Resolves true when live. Resolves false, never throws,
 * when there is no mic, no permission, no secure context, or no Web Audio.
 */
export async function startVoice(ratio?: number): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
    const c = getAudioContext();
    const out = getOutputNode();
    if (!c || !out) return false;
    if (stream) {
      if (ratio !== undefined && Math.abs(ratio - activeRatio) > 1e-3) { stopVoice(); }
      else return true;
    }

    const r = clamp(ratio ?? currentRatio(), 0.25, 4);
    const ms = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    // The user may have stopped the voice while the permission prompt was open.
    if (stream) { for (const t of ms.getTracks()) t.stop(); return true; }
    stream = ms;
    activeRatio = r;
    await c.resume().catch(() => { /* gesture already happened: getUserMedia needed one */ });

    const src = c.createMediaStreamSource(ms);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 120;
    const sum = c.createGain();
    sum.gain.value = 1;
    outGain = c.createGain();
    outGain.gain.value = 0;
    nodes.push(src, hp, sum, outGain);

    const { rampUp, rampDown, window: win } = buffers(c);
    const k = 1 - r;                        // delay slope, s/s
    if (Math.abs(k) < 1e-3) {
      hp.connect(sum);                      // no shift needed, pass through
    } else {
      const grain = Math.abs(k) > 1 ? 0.2 : 0.1;   // longer grains for big shifts: less buzz
      const rate = Math.abs(k) / grain;            // ramp cycles per second
      const ramp = k > 0 ? rampUp : rampDown;      // pitch down grows the delay, pitch up shrinks it
      const t0 = c.currentTime + 0.05;
      tap(c, hp, sum, grain, rate, ramp, win, t0, 0);
      tap(c, hp, sum, grain, rate, ramp, win, t0, 0.5);
    }
    src.connect(hp);
    sum.connect(outGain);
    outGain.connect(out);
    outGain.gain.setValueAtTime(0, c.currentTime);
    outGain.gain.linearRampToValueAtTime(0.9, c.currentTime + 0.15);
    log('live, ratio', r);
    return true;
  } catch (e) {
    log('start failed', e);
    stopVoice();
    return false;
  }
}

/** Stops the mic, fades out over 150 ms and releases the tracks. Safe when not active. */
export function stopVoice(): void {
  try {
    const c = getAudioContext();
    if (outGain && c) {
      const t = c.currentTime;
      outGain.gain.cancelScheduledValues(t);
      outGain.gain.setValueAtTime(outGain.gain.value, t);
      outGain.gain.linearRampToValueAtTime(0, t + 0.15);
    }
    const ns = nodes, ss = sources, st = stream;
    nodes = []; sources = []; stream = null; outGain = null;
    if (st) for (const tr of st.getTracks()) tr.stop();
    setTimeout(() => {
      for (const s of ss) { try { s.stop(); } catch { /* noop */ } }
      for (const n of ns) { try { n.disconnect(); } catch { /* noop */ } }
    }, 200);
  } catch (e) {
    log('stop failed', e);
  }
}

export function isVoiceActive(): boolean {
  return stream !== null;
}

/** The pitch ratio the voice is currently using, or would use. */
export function getVoiceRatio(): number {
  return stream ? activeRatio : currentRatio();
}

// The engine does not expose the object, only its id, so the caller usually passes the
// ratio explicitly. Fallback is a lookup through a registry the engine fills on play.
const ratioById = new Map<string, number>();
export function rememberRatio(id: string, ratio: number) { ratioById.set(id, ratio); }
function currentRatio(): number {
  const id = getCurrentObjectId();
  return (id && ratioById.get(id)) || 1;
}
