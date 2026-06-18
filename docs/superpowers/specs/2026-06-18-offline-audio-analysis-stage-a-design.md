# Offline Audio Analysis — Stage A — Design

**Date:** 2026-06-18
**Status:** Approved (design); ready for implementation planning

## Goal

For **local audio files only**, analyze the whole decoded track **offline (look-ahead,
non-causal)** before playback, and drive the visuals from that precomputed timeline
instead of the real-time analyser. This delivers the user's #1 priority — **exact and
anticipatory timing** (drops fire at their precise moment; build-ups glow in the bars
*before* a known drop) — and the smoothness win (zero-phase smoothing kills the
"stop-and-start" jitter). Live capture (mic / tab) is **untouched** and stays real-time.

This is **Stage A**. Stage B (structural segmentation: intro/verse/chorus/drop →
scene/section-aware effects) is a deliberate follow-up, out of scope here.

## Background — current state

`AudioEngine.sample()` is called once per render frame. It reads the `AnalyserNode`
(`getByteFrequencyData` + `getByteTimeDomainData`), computes waveform RMS, and runs the
**causal** DSP in `FeatureExtractor.process(data, rms, dt)`:

- `OnsetDetector` — low-weighted, half-wave-rectified spectral flux → onset detection.
- `OnsetEnvelope` + `estimateTempo`/`autocorrelate` (`TempoEstimator.ts`) — running tempo.
- `BeatTracker` — a PLL that chases onsets to predict an on-grid beat pulse + phase.
- `DropDetector` — fast-vs-slow energy envelope with a build-up gate → drop envelope.

Output is `AudioFeatures` (`src/types.ts`): `loudness, energy, bands{bass,lowMid,mid,high},
beat, motionSpeed, tempoBpm, presence, drop, beatPhase, beatConfidence`. The `Renderer`
consumes `engine.sample()` each frame and has an `onFrame(features, hue)` hook (HUD).

Sources implement `AudioSource { label; connect(ctx): Promise<AudioNode>; stop() }`.
`FileSource` today just plays a looping `<audio>` element through the analyser — i.e. it
is real-time/causal like every other source.

The whole pipeline is **causal**: tempo must warm up, beats are chased not known, drops
are detected after the slam. Offline look-ahead removes all of those limitations for files.

## Chosen approach

**Approach B — a full non-causal offline analysis engine, built from scratch**, gated to
file playback with a clean fallback to the current real-time path. (Approaches A
"record & replay the causal path" and C "non-causal with maximal reuse" were considered;
B was chosen for highest quality and a clean, self-contained engine.) Where existing
*pure* math is a natural fit it is reused (`autocorrelate`/`estimateTempo`, band edges),
but the analysis is otherwise its own non-causal pipeline.

## Architecture & control flow

### The core seam: a `FeatureProvider` interface

`AudioEngine.sample()` is decoupled from "read the analyser" via one tiny interface:

```ts
interface FeatureProvider {
  sample(): AudioFeatures;
  setSensitivity?(value: number): void; // live path only
}
```

Two implementations:

- **`LiveFeatureProvider`** — the *current* path, extracted verbatim: owns the analyser,
  `data`/`timeData` buffers, and `FeatureExtractor`; each frame reads bytes, computes RMS,
  calls `extractor.process()`. **No behavior change for mic/tab.**
- **`AnalyzedFeatureProvider`** — new: holds a precomputed `AnalyzedTrack` and a playback
  clock; each frame *interpolates* the timeline and *looks up* events. No analyser.

`AudioEngine` holds a `provider: FeatureProvider`; `sample()` returns
`provider.sample()`; `setSensitivity()` forwards to the provider if supported.

`AudioSource` gains one optional capability so a source can supply its own provider:

```ts
interface AudioSource {
  label: string;
  connect(ctx: AudioContext): Promise<AudioNode>;
  stop(): void;
  createProvider?(ctx: AudioContext): FeatureProvider | Promise<FeatureProvider>;
}
```

Sources without `createProvider` get a `LiveFeatureProvider` built around an analyser,
exactly as today. `AudioEngine.use()`:

```ts
async use(source) {
  await teardown();
  ctx = new AudioContext();
  node = await source.connect(ctx);          // analyzed source decodes + analyzes here
  if (source.createProvider) {
    provider = await source.createProvider(ctx);
  } else {
    analyser = ctx.createAnalyser(); analyser.fftSize = FFT_SIZE; node.connect(analyser);
    provider = new LiveFeatureProvider(analyser, ctx.sampleRate, FFT_SIZE, sensitivity);
  }
}
```

### Control flow when a file is loaded

```
pick file
  → AnalyzedFileSource.connect(ctx):
       file → ArrayBuffer → ctx.decodeAudioData → AudioBuffer        [progress: decoding]
       mono mixdown (avg channels) → Float32 channel
       post {channel, sampleRate} to Worker (transferable)
       Worker runs analyzeTrack(), posting % progress                [progress: analyzing 0–100%]
       receive AnalyzedTrack
       build AudioBufferSourceNode from the decoded buffer (loop=true), route to destination, not started
       return the node
  → engine sees createProvider() → AnalyzedFeatureProvider(track, clock)
  → start playback (node.start at t0 = ctx.currentTime); hide overlay
each render frame:
  → provider.sample() interpolates AnalyzedTrack at the current playback position
```

### Master clock

Playback is via an **`AudioBufferSourceNode`** (we already decoded the buffer for
analysis), and position is derived from the audio clock:

```
position = (ctx.currentTime - t0 - ctx.outputLatency) ,  wrapped mod duration when looping
```

`ctx.currentTime` is sample-accurate, high-resolution and monotonic — far better than
`<audio>.currentTime` (~250 ms granularity in some browsers) for the exact sync that is
the #1 priority. `outputLatency` aligns visuals to what is *heard*. Looping is built in;
pause/resume = stop the node + remember the offset (no scrubbing exists today, so this is
sufficient). This resolves the handoff's tentative `<audio>.currentTime` suggestion.

### Analysis execution: Web Worker + progress

The whole-track STFT is ~1–3 s of work, so it runs **off the main thread in a Web
Worker** (Vite: `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`).
The render loop and UI stay smooth, and the worker posts progress (decoding → analyzing %
→ ready) which `main.ts` shows as a progress overlay. The decoded channel `Float32Array`
is transferred (zero-copy). The worker stays thin — it just calls `analyzeTrack()` — so
the DSP is unit-testable on the main thread without a worker.

### Fallback

Only `AnalyzedFileSource` takes the analyzed path; mic/tab are untouched. If
`decodeAudioData` fails (a codec the browser won't decode) or analysis throws, the file
source **degrades to the current real-time behavior** (play the file through an analyser,
producing a `LiveFeatureProvider`) so the app never dead-ends on a problem file.

## The offline analysis pipeline

`analyzeTrack(channel: Float32Array, sampleRate, onProgress)` → `AnalyzedTrack`. Stages:

### 1. STFT front-end

- Hann-windowed frames, `fftSize = 2048` (matches the real-time `FFT_SIZE` so band
  semantics line up), hop `512` → ~86 frames/sec (`frameRate = sampleRate / hop`).
- `fft.ts`: hand-rolled iterative radix-2 Cooley–Tukey FFT (real input → complex). No
  runtime deps; deterministic; unit-testable.
- `stft.ts`: framing + windowing + magnitude spectrum per frame.

### 2. Per-frame continuous channels (length = frameCount)

- **loudness** — RMS of each frame's time-domain samples (absolute amplitude, matching
  the existing absolute-loudness semantics; NOT auto-gain/normalized).
- **bands** — bass/lowMid/mid/high using the existing `BAND_EDGES`, computed on a
  log-magnitude scale so they read like the real-time path.
- **energy** — derived from loudness with the existing gamma/full-scale shaping
  (`ENERGY.fullScale`, `ENERGY.dynamicsGamma`) so visual energy matches the live look,
  then zero-phase smoothed (see step 6).
- **onset envelope (ODF)** — low-weighted, half-wave-rectified spectral flux mirroring
  `OnsetDetector`'s weighting; drives tempo + beat grid.

### 3. Global tempo

Autocorrelate the full ODF (reusing `autocorrelate`/`estimateTempo` from
`TempoEstimator.ts`) within `TEMPO.minBpm..maxBpm`, with octave-sanity correction
(prefer the musically plausible multiple). One stable BPM for the whole track beats the
running estimate that has to warm up.

### 4. Beat grid (dynamic programming)

`beatGrid.ts` — Ellis-style DP beat tracking ("Beat Tracking by Dynamic Programming"):
given the ODF and the target beat period τ (from the global tempo), build a cumulative
score `C[i] = O[i] + max_j (C[j] + penalty(i−j, τ))` with
`penalty = −α·(log((i−j)/τ))²` favoring inter-beat spacing near τ, then backtrace from
the max for the globally optimal beat sequence. Output: `beats` (times in seconds).
This is the heart of exact + anticipatory timing — beats placed with full hindsight, not
chased by a PLL, and a beat is still placed across a missing/weak onset.

### 5. Downbeats

`downbeats.ts` — assume 4/4; for each bar phase p ∈ {0,1,2,3} sum onset/energy at beats
where `(index − p) % 4 == 0`; pick the p with the most energy → downbeats are every 4th
beat from p. Output: `downbeats` (times in seconds). Cheap; gives musical bar boundaries.

### 6. Zero-phase smoothing

`smooth.ts` — every continuous channel gets a **forward + backward** smoothing pass
(EMA each direction), which is **zero-phase**: smooth with **no lag**. This is what
removes the stop-and-start jitter the user dislikes.

### 7. Drops + anticipation

`drops.ts` — non-causal scan of the (smoothed) energy + bass curves: find a **sustained
build** (a rising bass-weighted signal over ~1–2 bars) followed by a **sudden slam**
(sharp positive jump), confirmed using look-ahead, then **snap the drop time to the
nearest downbeat** (where drops actually land). Each drop = `{ time, intensity,
buildStart }`. A gradual swell with no slam must NOT register.

**Anticipation channel** — precompute a 0..1 ramp rising from each drop's `buildStart` to
its `time` (0 elsewhere). Baked into the timeline so it is deterministic and testable.

### `AnalyzedTrack` (the worker's output)

```ts
interface Drop { time: number; intensity: number; buildStart: number; }

interface AnalyzedTrack {
  duration: number;
  sampleRate: number;
  frameRate: number;          // continuous-channel frames per second
  tempoBpm: number;
  // continuous channels, length = frameCount
  loudness: Float32Array;
  energy: Float32Array;
  bass: Float32Array;
  lowMid: Float32Array;
  mid: Float32Array;
  high: Float32Array;
  onset: Float32Array;
  anticipation: Float32Array;
  // events (times in seconds)
  beats: Float32Array;
  downbeats: Float32Array;
  drops: Drop[];
}
```

## Playback: `AnalyzedFeatureProvider`

`sample()` maps the current playback position → `AudioFeatures`:

- **continuous fields** (`loudness, energy, bands`) — linear-interpolate the channels at
  `position * frameRate`.
- **`tempoBpm`** — the track's global BPM (known immediately, no warm-up).
- **`beatPhase`** — from the two surrounding beats: `(t − beatPrev) / (beatNext − beatPrev)`.
  `beatConfidence` is pinned high (the grid is known). `beat` is a pulse peaking near
  phase 0 (reuse the existing pulse shape so beat-driven effects look the same).
- **`drop`** — from the nearest drop event: `intensity · decay(t − drop.time)` using the
  existing `DROP.decayPerSec` tail; 0 before the drop.
- **`anticipation`** — interpolated from the anticipation channel.
- **`presence`/`motionSpeed`** — computed from energy/tempo as today (`computeMotionSpeed`).
- **loop** — wrap `position` by `duration`; events/channels read mod duration.

## Type + Renderer change (the one visible new behavior)

- **`AudioFeatures` gains `anticipation: number`** (0..1). The live path always sets `0`,
  so it is backward-compatible. `SILENT` in `AudioEngine` includes `anticipation: 0`.
- **`Renderer`** gains a small **build-up effect** driven by `anticipation`: a pre-drop
  glow / charge that swells in the bars before a slam (e.g. a rising core glow or
  brightening). Everything else (drops, bands, tempo, beat) flows through the **existing**
  fields — just exact and smooth.

Downbeats are computed and stored and are available for a future bar-accent effect (and
they feed Stage B), but **no new downbeat-driven effect is wired in Stage A** — keeping
scope focused on timing + smoothness + anticipation.

## Components (files)

### New — offline engine (`src/audio/offline/`)

- **`fft.ts`** — iterative radix-2 FFT (real → complex), pure.
- **`stft.ts`** — Hann framing + magnitude spectra, pure.
- **`featureTimeline.ts`** — per-frame loudness/energy/bands/ODF channels from STFT.
- **`tempoGlobal.ts`** — global tempo via autocorrelation (wraps `TempoEstimator`).
- **`beatGrid.ts`** — DP beat tracking → beat times.
- **`downbeats.ts`** — 4/4 bar-phase inference → downbeat times.
- **`drops.ts`** — non-causal drop detection + anticipation channel.
- **`smooth.ts`** — forward/backward (zero-phase) smoothing util.
- **`analyzeTrack.ts`** — orchestrates the pipeline; emits progress; returns `AnalyzedTrack`.
- **`worker.ts`** — thin Web Worker entry: receives `{channel, sampleRate}`, calls
  `analyzeTrack` with a progress callback that `postMessage`s, posts back the track.
- **`types.ts`** — `AnalyzedTrack`, `Drop`.

### New — providers (`src/audio/providers/`)

- **`FeatureProvider.ts`** — the interface.
- **`LiveFeatureProvider.ts`** — current analyser path, extracted from `AudioEngine`.
- **`AnalyzedFeatureProvider.ts`** — timeline lookup → `AudioFeatures`.

### New — source

- **`src/audio/sources/AnalyzedFileSource.ts`** — decode + spawn worker (progress) +
  `AudioBufferSourceNode` playback + `createProvider()`; falls back to real-time on error.

### Modified

- **`src/audio/AudioEngine.ts`** — hold a `FeatureProvider`; `sample()`/`setSensitivity()`
  delegate; `use()` builds the live provider or uses `source.createProvider()`. `SILENT`
  gains `anticipation: 0`.
- **`src/audio/sources/AudioSource.ts`** — add optional `createProvider?(ctx)`.
- **`src/types.ts`** — `AudioFeatures` gains `anticipation: number`.
- **`src/visual/Renderer.ts`** — add the anticipation build-up effect.
- **`src/main.ts`** — build `AnalyzedFileSource(file, onProgress)`; show/hide the analysis
  progress overlay.
- **`index.html` / a CSS file** — the progress overlay element + styling.
- **`src/config.ts`** — Stage A constants (STFT hop, DP penalty α, drop/build thresholds,
  anticipation lead bars, zero-phase smoothing factors).

## Behavior details

- **File-only.** The analyzed path is exclusive to `AnalyzedFileSource`. Mic/tab keep the
  `LiveFeatureProvider` and behave exactly as today.
- **Paused until ready.** Playback does not start until analysis completes; the progress
  overlay shows decoding → analyzing % → ready.
- **Exact drops.** Drops fire from precomputed timestamps (downbeat-snapped), not detected
  after the slam.
- **Anticipation.** `anticipation` ramps up across the bars before each drop, driving a
  pre-drop build-up glow.
- **Smooth motion.** Zero-phase smoothing means continuous channels have no reaction lag
  and no stop-and-start jitter.
- **Looping.** `AudioBufferSourceNode.loop = true`; position wraps mod duration; the
  timeline reads continuously across the wrap.

## Error handling / edge cases

- **Unsupported codec / `decodeAudioData` rejection** — caught; fall back to real-time
  file playback (`LiveFeatureProvider`). FLAC coverage varies by browser; mp3/wav/m4a/ogg
  are fine.
- **Analysis throws** — caught; same real-time fallback; playback still works.
- **Very short / silent files** — `beatGrid`/tempo may find no stable period; provider
  degrades gracefully (no beat grid → reactive-style `beat` from the ODF channel; no drops
  → no anticipation). Must not crash.
- **Worker unavailable** (rare) — fall back to running `analyzeTrack` on the main thread
  (the worker is thin, so this is a direct call) or to the real-time path.
- **Tempo octave errors** — octave-sanity correction in `tempoGlobal`.
- **AudioContext autoplay policy** — `ctx` resume / `node.start()` happen from the same
  user gesture that picked the file (the existing pattern), so playback is allowed.
- **outputLatency undefined** (older browsers) — treat as 0.

## Testing

All DSP is pure functions over synthetic signals (fits the existing vitest style):

- **`fft`** — FFT of a known sinusoid peaks at the expected bin; DC handled; Parseval sanity.
- **`stft`** — frame count for a given length/hop; window applied.
- **`featureTimeline`** — a loud full-spectrum buffer → high energy/bands; silence → ~0;
  band energy lands in the right band.
- **`tempoGlobal`** — a click train at a known BPM → that BPM (incl. an octave case).
- **`beatGrid`** — regular pulses → beats on the pulses; a deleted onset → a beat still
  placed by the DP; off-grid noise doesn't derail the grid.
- **`downbeats`** — accented-beat-1 4/4 input → correct bar phase.
- **`drops`** — build+slam → a drop at the slam, snapped to a downbeat; a gradual swell →
  no drop; cooldown respected; anticipation ramp rises into each drop and is 0 elsewhere.
- **`smooth`** — zero-phase property (a symmetric impulse stays symmetric — no lag), and
  it actually reduces variance.
- **`AnalyzedFeatureProvider`** — channel interpolation between frames; `beatPhase` wraps
  0→1 across a beat; `drop` decays after an event; `anticipation` carried through; loop
  wrap continuity. Built on a tiny hand-made `AnalyzedTrack`.
- **`analyzeTrack`** — end-to-end on a small synthetic buffer (metronome + a slam): plausible
  tempo, beats, one drop; progress callback reaches 100%.
- **Browser (Playwright / manual):** load a real file → progress overlay → playback with
  exact drops, pre-drop glow, and smooth motion; mic/tab unchanged.

## Out of scope (YAGNI)

- **Stage B** — structural segmentation (intro/verse/chorus/drop) and section/scene-aware
  effects. Downbeats are computed here to feed it later.
- New downbeat/bar-accent visual effects (data stored, effect deferred).
- Scrubbing / seek UI, waveform display, caching analysis across reloads.
- Per-section tempo changes (single global tempo in Stage A).
- Any change to live capture (mic/tab) behavior or DSP.
- Spotify/YouTube audio (DRM + ToS — ruled out; engine is fed files the user owns).
