# Audio handoff (Agent E)

Branch: `worktree-agent-abbf6323318d1c8e6`. Files: `client/src/audio/**` only. No npm dependencies,
Web Audio API only, no samples.

## What works

- `engine.ts`: lazy `AudioContext` (with the `webkitAudioContext` fallback), resumed on first call and
  again on the next tap or key if the browser refused (passive capture listeners on `pointerdown`,
  `touchend`, `keydown`, `click`), and on `visibilitychange` when a sound is active (iOS reports
  `interrupted` after a call or when another app takes the output).
- Master gain with 150 ms linear fades in and out, a 450 ms crossfade between objects, and a soft
  compressor as a limiter in front of `destination`, so storms and lava never clip.
- All five layers synthesized procedurally (details below).
- Public API exactly as the stub, plus a few extras (below).
- `voice.ts`: "Hear your voice there", mic through a delay-line granular pitch shifter at the
  planet's `pitchRatio`. Asks for the mic only when `startVoice()` is called and resolves `false`
  on any failure instead of throwing.
- `DevPanel.tsx`: every object from `useObjects()` with Play and Stop, the raw `sound` params,
  the derived filter settings, the context state, and a voice toggle.

## API (`client/src/audio/index.ts`)

```ts
playPlanetSound(obj: CelestialObject): void  // idempotent; a different object crossfades
stopSound(): void                            // 150 ms fade, then every node is released
isPlaying(): boolean
SOUND_DISCLAIMER                             // unchanged sentence for the card
getCurrentObjectId(): string | null          // id sounding now (also during its stop fade)
getAudioState(): string                      // 'none' | 'suspended' | 'running' | 'interrupted' | 'closed'
onAudioChange(fn): () => void                // fires on play, stop and context state changes
startVoice(ratio?: number): Promise<boolean> // mic, shifted by ratio (default: current object's pitchRatio)
stopVoice(): void
isVoiceActive(): boolean
getVoiceRatio(): number
windShape(sound), orbitToneHz(periodDays)    // the parameter mappings, for display or debugging
```

Every function is safe to call before a user gesture, repeatedly, and in any order. If Web Audio
is missing the calls are no-ops. Nothing throws; failures are logged with `console.debug` in dev.

The same object twice is a no-op. If `stopSound()` is in flight for that object, the stop is
cancelled and the voice fades back in. Calling with a different object builds the new voice, fades
the old one out over 450 ms and disposes it.

## How the synthesis works

All layers share one 6 second white noise buffer and one brown noise buffer (leaky integrator),
generated once per context. Nodes are created per object and released on stop or crossfade.

**wind (base loop, used by lava, storm and ice too)**

```
noise(loop, playbackRate = pitchRatio)
  -> highpass (thin air raises it)
  -> [bandpass body ~260 Hz x pitchRatio^0.75, Q 0.6]  +  [bandpass swirl ~900 Hz x pitchRatio, Q 3.5]
  -> lowshelf 160 Hz (+0 to +7 dB with density)
  -> lowpass (cutoff = 4000 / sqrt(density), clamped 380 to 14000 Hz)
  -> wind gain -> voice gain -> master -> limiter
```

Gusts: every 0.5 to 1.8 s a new random gust level is chosen and the wind gain, both band centres and
the swirl level ease toward it with `setTargetAtTime`. Storms use a wider gust range and faster
easing. `playbackRate` shifts the noise spectrum and the band centres scale with `pitchRatio`, so a
hot Jupiter (ratio 4) is bright and hissing and a cold CO2 world (ratio 0.8) is darker.

Density mapping (`windShape`): Earth 1 gives a 4 kHz cutoff and normal wind. Venus-like 90 gives
420 Hz, a +7 dB low shelf, and sounds muffled and heavy. Mars 0.01 raises the bands about 4x and
the highpass to about 620 Hz, lowers the level, and sounds thin and whispery. Measured spectral
centroids in headless Chrome: Venus-like 700 Hz, Earth 800 to 1200 Hz, Mars 1800 Hz.

**lava**: wind at 0.8 plus a rumble (brown noise below 110 Hz, level wandering) plus a 38 to 56 Hz
sine sub tone that drifts, plus crackle: every 30 to 280 ms a 12 to 90 ms burst of white noise
through a random bandpass (1.2 to 5.2 kHz, Q 3 to 9) with a 2 ms attack and exponential decay.

**storm**: wind with deep fast gusts plus thunder every 3.5 to 9 s (first one within 2 s): brown
noise with a 0.15 to 0.7 s attack and 2 to 5 s exponential decay through a lowpass that sweeps
from about 350 Hz down to about 80 Hz. About half the rolls get a short highpassed crack on top.
Each roll also pushes a gust into the wind.

**ice**: wind at 0.8 plus a thin whistle: a sine near 2.1 kHz x sqrt(pitchRatio) with a 0.35 Hz
vibrato and a quieter sine a fifth above, and the noise through a very narrow bandpass (Q 18) at
the same centre. The centre and level wander every 0.9 to 2.6 s.

**silence**: nothing for 1.0 s (the previous voice's crossfade tail may still be fading), then an
orbit tone fades in over 1.6 s: sine at `orbitToneHz(orbitalPeriodDays)` with 0.5 percent vibrato
at 0.28 Hz, a quiet second harmonic, 0.11 Hz amplitude breathing, and a slow stereo circle whose
rate loosely follows the period. Pitch mapping: log scale, 1 day or less is 880 Hz, 10,000 days or
more is 110 Hz, unknown period is 220 Hz. The Moon (27.3 d) lands at 417 Hz, a 3,000 day orbit at
about 195 Hz.

**voice** (`voice.ts`): mic -> highpass 120 Hz -> two DelayNodes whose `delayTime` is swept by a
looping ramp buffer (slope 1 - ratio), each with a half-sine gain window, offset by half a cycle so
the sum is constant power -> output gain -> limiter (bypasses the planet master fade, so voice and
planet are independent). Grain 100 ms, or 200 ms when the shift is more than an octave to reduce
buzz. Ratio is clamped to [0.25, 4]. At ratio 4 (KELT-9 b) there is an audible 15 Hz grain
flutter; that is the expected cost of a native-node shifter and still reads as "chipmunk".

## How to test

1. `cd client && npm install && VITE_MOCK=1 npm run dev`
2. Mount the panel. The lead owns `App.tsx`; the smallest wiring is:

```tsx
import DevPanel from './audio/DevPanel';
const audioDev = new URLSearchParams(location.search).get('audio') === '1';
// inside Explorer, after <Shell />:
{audioDev && <DevPanel />}
```

   `DevPanel` only reads the objects store, so it also works outside `GameProvider`. It covers the
   whole screen at z-index 10000 with 44 px buttons and a filter box, fine at 390 px.
3. Open `http://localhost:5173/?audio=1`, tap Play on Earth (wind), Mars (thin), Jupiter (storm),
   WASP-76 b (storm at ratio 4), Moon (silence, then the 417 Hz orbit tone). There is no `ice` or
   `lava` object in the 8-object placeholder catalog; they will appear once the pipeline lands.
   Until then the panel's filter box is the way to find them in the full catalog.
4. Switch between objects without pressing Stop to hear the crossfade. Press Play twice on the same
   object: nothing should change. Press Stop then Play on the same object quickly: it fades back.
5. "Hear your voice there": use headphones. With the phone speaker it will feed back at ratio
   close to 1. Needs `https` or `localhost` for `getUserMedia`; on a LAN `http://` address the
   button reports "mic unavailable or denied" and nothing else happens.

What was verified without ears: a headless Chrome harness drove the real bundle through all 8
objects plus synthetic ice, Venus-like and lava objects and measured the output with an
AnalyserNode and a ScriptProcessor. Every layer produced signal, the fade-in and the stop envelope
ramp over about 150 to 200 ms with no instant jumps, crossfades never dip to zero, a repeated
`playPlanetSound` left the level unchanged, 30 rapid switches in 1.5 s ended with exactly one
voice, the Moon's tone peaked at 410 Hz (one FFT bin from 417), and the floor after stop was
exactly zero. The harness is not in the repo (it needs an esbuild bundle and a local server).

## iOS notes

- Create and resume happen inside `playPlanetSound`. When the card's Play button is a real tap,
  iOS allows the context. If `playPlanetSound` is ever called from a timer or an effect first, the
  context stays `suspended`, nodes are built and scheduled, and the gesture listeners resume it on
  the next tap, so sound starts then. Nothing is lost.
- iOS Safari uses a 44.1 or 48 kHz context; buffers are generated at `ctx.sampleRate`, so no
  resampling issues.
- The silent switch: Web Audio on iOS respects the ring/silent switch in some versions. If the
  phone is on silent nothing plays and there is no API to detect it. The card copy could say
  "turn your ringer on" if testers hit this.
- `createStereoPanner` is guarded; older WebKit without it still gets the mono orbit tone.
- The mic: `getUserMedia` needs a secure context and switches iOS to the voice-chat audio route,
  which lowers speaker volume while the mic is open. `stopVoice()` stops the tracks so the route
  comes back.
- `ScriptProcessorNode` is not used in production code, only in the test harness.

## Known issues and notes for the lead

- Only `wind`, `storm` and `silence` exist in the placeholder catalog, so `lava` and `ice` were
  tuned against synthetic objects (Jupiter with layer ice at ratio 1.6; Earth with layer lava at
  ratio 2.6, density 5). Worth a listen once the pipeline's `objects.json` is in.
- `density` 0 with a non-silence layer is treated as Earth density 1 rather than producing
  silence. `pitchRatio` outside [0.25, 4] is clamped.
- The lava sub tone at 46 Hz is inaudible on phone speakers; the crackle and the mid rumble carry
  the layer there.
- There is no global volume control. If the UI wants one, add a `setVolume(0..1)` that scales
  `MASTER_LEVEL`; a two-line change in `engine.ts`.
- No contract changes requested. `CelestialObject.sound` and `orbitalPeriodDays` are all the engine
  reads.
