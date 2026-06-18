# essentia.js Audio Analysis (tempo + beats + bands) — Design

**Date:** 2026-06-18
**Status:** Approved (design); ready for implementation planning
**Branch:** builds on `feature/offline-analysis-stage-a`

## Goal

Replace the weakest parts of our hand-rolled offline DSP — global tempo, the beat grid, and
frequency-band energies — with **essentia.js** (MTG/UPF's Essentia C++ library compiled to
WebAssembly), which is research-grade and far more robust on real music. Everything runs in
the existing analysis **Web Worker** and produces the **same `AnalyzedTrack`**, so the
feature provider, the (per-band-normalized) waveform, and the main visualizer are unchanged.
Our existing pure-DSP `analyzeTrack` stays as a **fallback** when the WASM can't load.

**License note:** essentia.js is **AGPL-3.0**. The user has chosen to open-source this
project under AGPL, so the dependency is acceptable.

## Background — current state

Stage A added offline file analysis: `AnalyzedFileSource` decodes a file, the worker runs
`analyzeTrack(channel, sampleRate) → AnalyzedTrack`, playback runs through a `Transport`, and
`AnalyzedFeatureProvider` reads the timeline. The waveform panel renders a stacked,
per-band-normalized 3-band waveform.

Our pure DSP (`src/audio/offline/`): `fft`/`stft`/`featureTimeline` (bands, loudness, onset),
`tempoGlobal` (autocorrelation), `beatGrid` (dynamic-programming), `downbeats`, `drops`,
`smooth`, orchestrated by `analyzeTrack`. Verified-accurate on clean synthetic signals, but
the tempo/beat tracking is fragile on real music and band energies are hand-calibrated.

`AnalyzedTrack` (unchanged target): `duration, sampleRate, frameRate, tempoBpm` plus
continuous channels `loudness, presence, bass, lowMid, mid, high, onset, anticipation`
(length = frameCount at `frameRate`) and events `beats, downbeats, drops`.

## Architecture & data flow

### Worker dispatch with fallback

The worker tries the essentia analyzer; on any failure it falls back to the pure DSP:

```
worker.onmessage({channel, sampleRate}):
  try:   track = await analyzeTrackEssentia(channel, sampleRate, onProgress)  // WASM
  catch: track = analyzeTrack(channel, sampleRate, onProgress)                // pure-DSP fallback
  postMessage({type:'done', track})
```

The dispatch is extracted into a pure, testable helper:

```ts
async function analyzeWithFallback(
  channel: Float32Array, sampleRate: number,
  essentiaFn: (c: Float32Array, sr: number, p?: ProgressCb) => Promise<AnalyzedTrack>,
  pureFn: (c: Float32Array, sr: number, p?: ProgressCb) => AnalyzedTrack,
  onProgress?: ProgressCb,
): Promise<AnalyzedTrack>
```

so a throwing `essentiaFn` provably routes to `pureFn`.

### What essentia computes

- **Tempo + beats** — `RhythmExtractor2013` (method `multifeature`) on the whole mono signal
  → `bpm`, `ticks` (beat times, seconds), `confidence`. `tempoBpm = bpm`, `beats = ticks`.
- **Per-frame bands / onset / loudness** — frame the signal at the existing hop
  (`OFFLINE.hop = 512`) / `FFT_SIZE = 2048` via essentia `FrameGenerator → Windowing →
  Spectrum`, then per frame: `FrequencyBands` (using `BAND_EDGES` mapped to bass/lowMid/mid/
  high), `OnsetDetection` (onset envelope), and `RMS` (loudness). `frameRate = sampleRate /
  OFFLINE.hop` (unchanged), so timeline interpolation downstream is unaffected.

### What stays ours (reused pure helpers)

`assembleTrack` takes the raw essentia outputs and produces the final `AnalyzedTrack` using
the **existing, tested** helpers — `smoothZeroPhase` (zero-phase band/loudness smoothing),
the presence gate, the internal energy curve, `findDownbeats` (4/4 inference on essentia's
beats — essentia gives beats, not downbeats), `findDrops`, and the anticipation ramp. The
waveform's per-band normalization (`bandPeaks`/`sampleBands`) is unchanged and still applies
(essentia bands still carry natural spectral tilt).

### Distribution

`essentia.js` is added to `package.json` and **bundled by Vite** (WASM served locally,
offline-safe, version-pinned). The main integration risk is Vite bundling the WASM correctly
**inside the worker**; the first implementation task is a build spike to prove it.

## Components (files)

### New
- **`src/audio/offline/essentia.ts`** — `getEssentia(): Promise<Essentia>`: lazy, once-per-
  worker init of `EssentiaWASM` + `Essentia`. Hides all WASM-init detail.
- **`src/audio/offline/assembleTrack.ts`** — pure: `assembleTrack(raw): AnalyzedTrack` where
  `raw = { tempoBpm, beats, loudness, bass, lowMid, mid, high, onset, duration, sampleRate,
  frameRate }`. Applies smoothing/presence/energy/downbeats/drops/anticipation. No WASM.
- **`src/audio/offline/essentiaAnalyze.ts`** — `analyzeTrackEssentia(channel, sampleRate,
  onProgress?): Promise<AnalyzedTrack>`. Runs `RhythmExtractor2013` + the per-frame
  `Spectrum/FrequencyBands/OnsetDetection/RMS` loop, converts each essentia vector to a JS
  array and frees it immediately, emits progress, and calls `assembleTrack`.

### Modified
- **`src/audio/offline/analyzeTrack.ts`** — refactor to build its raw channels/beats from the
  pure DSP, then call the shared `assembleTrack` (DRY: one assembly path; the existing
  `analyzeTrack` test guards the refactor). Remains the synchronous fallback.
- **`src/audio/offline/worker.ts`** — `onmessage` becomes async; uses `analyzeWithFallback`
  (new pure helper, co-located in worker.ts or its own file) to try essentia then fall back.
- **`package.json`** — add `essentia.js`.
- **`vite.config.ts`** — WASM-in-worker config the spike proves necessary (typically
  `optimizeDeps: { exclude: ['essentia.js'] }` plus asset handling so the `.wasm` is emitted).
- **`src/config.ts`** — small `ESSENTIA` block: `{ rhythmMethod: 'multifeature', onsetMethod:
  'complex' }` (band edges and hop already live in `BAND_EDGES` / `OFFLINE` / `FFT_SIZE`).

## WASM memory management

essentia algorithm outputs and `arrayToVector` inputs are C++ `std::vector`s that must be
explicitly freed. Every call follows: build input vector → run algorithm → `vectorToArray`
the outputs → `.delete()` the input and output vectors. In the per-frame loop this happens
every frame so the WASM heap does not grow on long tracks. `essentia.shutdown()`/`delete()`
run at the end. (The worker is created per file and terminated on completion, so essentia
init happens once per analysis — a few hundred ms, covered by the progress overlay.)

## Behavior details

- **Same output, same downstream.** `AnalyzedTrack` shape is unchanged; provider, waveform,
  and visuals are untouched. The waveform's per-band normalization still runs.
- **Fallback.** WASM load/init failure or any thrown error → pure `analyzeTrack`. The user
  still gets working analysis (just our older tempo/beat quality).
- **Progress.** essentia path emits progress (decode handled upstream; `analyzing` ramps
  across RhythmExtractor + the per-frame loop) so the existing overlay behaves the same.
- **frameRate parity.** Bands/onset/loudness are framed at hop 512 so `frameRate` matches the
  pure path and the provider/waveform need no changes.
- **Downbeats.** Inferred by our 4/4 `findDownbeats` on essentia's beat grid.

## Error handling / edge cases

- **WASM unavailable / init throws** → fallback to pure DSP (caught in the worker).
- **`RhythmExtractor2013` finds no stable tempo** (returns bpm 0 / few beats) → store whatever
  it returns (`tempoBpm` may be 0, beats may be sparse); the provider already degrades (no grid
  → reactive beat from the onset channel) and the waveform uses the fallback window. We do
  **not** auto-switch to the pure fallback on low confidence — essentia's result is kept even
  when uncertain; the pure fallback is reserved for WASM load/throw failures only.
- **Non-44.1k sample rates** — pass the file's `sampleRate` to essentia algorithms; framing
  uses it for `frameRate`.
- **Long tracks** — per-frame `.delete()` prevents WASM heap growth.
- **Vite fails to bundle the WASM** — surfaced by the first spike task before further work.

## Testing

- **`assembleTrack`** (pure unit): synthetic tempo/beats/band arrays → correct smoothed
  channels, downbeats sitting on the beat grid, drops, and anticipation. Covers the essentia
  path's non-WASM logic without loading WASM.
- **`analyzeWithFallback`** (pure unit): a throwing `essentiaFn` routes to `pureFn`; a working
  `essentiaFn` is used as-is.
- **Existing pure-DSP + `analyzeTrack` tests** stay green — they cover the fallback and guard
  the `assembleTrack` refactor.
- **essentia real path** — browser harness: load a real track, read `tempoBpm`/`beats`/
  `confidence`, confirm band balance, and confirm forcing essentia to fail still plays via the
  fallback. (A Node/vitest integration test is optional; WASM there can be flaky, so the
  browser is the source of truth.)
- **Build spike (first task):** add the dep, import essentia in the worker, `npm run build`
  succeeds with the `.wasm` emitted, and a one-off computes a plausible BPM in the browser.

## Out of scope (YAGNI)

- Replacing loudness/presence/energy/drops/anticipation logic (kept ours).
- essentia ML models (musicnn/TF.js), key/danceability, downbeat models.
- Changing `AnalyzedTrack`, the provider, the waveform, or the main visualizer.
- The minor ~35 ms beat-phase offset noted earlier (essentia's beat times should supersede
  the DP grid; revisit only if it persists).
- Switching the live (mic/tab) path to essentia.
