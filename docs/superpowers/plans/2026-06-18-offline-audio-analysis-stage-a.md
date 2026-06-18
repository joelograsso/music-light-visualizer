# Offline Audio Analysis — Stage A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For local audio files only, analyze the whole decoded track offline (in a Web Worker) before playback and drive the visuals from a precomputed timeline — exact + anticipatory timing and lag-free smoothness — while live capture (mic/tab) keeps the current real-time path unchanged.

**Architecture:** A `FeatureProvider` seam splits `AudioEngine.sample()` into a `LiveFeatureProvider` (current analyser path, extracted verbatim) and a new `AnalyzedFeatureProvider` (timeline lookup). `AnalyzedFileSource` decodes the file, runs `analyzeTrack()` in a worker (STFT → global tempo → DP beat grid → downbeats → look-ahead drops + anticipation, all zero-phase smoothed) into an `AnalyzedTrack`, plays it through an `AudioBufferSourceNode`, and exposes the analyzed provider. If decode/analysis fails it degrades to the real-time path.

**Tech Stack:** TypeScript, Vite, Vitest (jsdom, globals), Canvas 2D, Web Audio API, Web Workers. No new runtime dependencies. Spec: `docs/superpowers/specs/2026-06-18-offline-audio-analysis-stage-a-design.md`.

**Conventions (verified in repo):**
- Tests live in `tests/` mirroring `src/`, e.g. `src/audio/offline/fft.ts` → `tests/audio/offline/fft.test.ts`.
- Vitest globals are on (`describe/it/expect` need no import, but existing tests import them — match that).
- Use deterministic synthetic signals (an LCG, never `Math.random`) — see `tests/audio/TempoEstimator.test.ts`.
- Run a single test file: `npx vitest run tests/path/to/file.test.ts`.
- Full suite: `npm test`. Typecheck: `npx tsc --noEmit`. Build: `npm run build`.
- Commit trailer: every commit ends with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Branch: work happens on `feature/offline-analysis-stage-a` (already created; the spec is committed there).

---

## File Structure

**New — offline engine (`src/audio/offline/`):**
- `types.ts` — `AnalyzedTrack`, `Drop` interfaces.
- `smooth.ts` — `smoothZeroPhase()` (forward+backward EMA = zero-phase).
- `fft.ts` — `fftInPlace()`, `magnitudeSpectrum()` (radix-2 Cooley–Tukey).
- `stft.ts` — `hannWindow()`, `frameCount()`, `computeStft()`.
- `featureTimeline.ts` — `computeFeatureTimeline()` (loudness/bands/onset per frame).
- `tempoGlobal.ts` — `globalTempo()` (autocorrelation over the whole onset envelope).
- `beatGrid.ts` — `trackBeats()` (Ellis DP beat tracking).
- `downbeats.ts` — `findDownbeats()` (4/4 bar-phase inference).
- `drops.ts` — `findDrops()` (look-ahead drops + anticipation channel).
- `mixToMono.ts` — `mixToMono()` (channel mixdown, pure + testable).
- `analyzeTrack.ts` — `analyzeTrack()` (orchestrator, emits progress).
- `worker.ts` — thin Web Worker entry calling `analyzeTrack`.

**New — providers (`src/audio/providers/`):**
- `FeatureProvider.ts` — interface.
- `LiveFeatureProvider.ts` — current analyser path, extracted from `AudioEngine`.
- `AnalyzedFeatureProvider.ts` — timeline → `AudioFeatures`.

**New — source + UI:**
- `src/audio/sources/AnalyzedFileSource.ts` — decode + worker + `AudioBufferSourceNode` + `createProvider`, with real-time fallback.
- `src/ui/AnalysisOverlay.ts` — progress overlay (decoding → analyzing % → ready).

**Modified:**
- `src/types.ts` — `AudioFeatures` gains `anticipation: number`.
- `src/config.ts` — append the `OFFLINE` constants block.
- `src/audio/FeatureExtractor.ts` — add `anticipation: 0` to the returned object.
- `src/audio/AudioEngine.ts` — hold a `FeatureProvider`; delegate; build live or analyzed provider; `SILENT` gains `anticipation: 0`.
- `src/audio/sources/AudioSource.ts` — add optional `createProvider?(ctx)`.
- `src/audio/InputManager.ts` — file source → `AnalyzedFileSource`; thread progress.
- `src/visual/Renderer.ts` — anticipation build-up glow.
- `src/main.ts` — create `AnalysisOverlay`; pass progress to `InputManager`.
- `src/ui/hud.css` — overlay styling.

---

## Task 1: Config constants + `AnalyzedTrack` types

**Files:**
- Modify: `src/config.ts` (append after the `SPOTIFY` block, end of file)
- Create: `src/audio/offline/types.ts`

- [ ] **Step 1: Append the `OFFLINE` config block**

Add to the end of `src/config.ts`:

```ts
/**
 * Stage A — offline whole-track analysis (local files only). The file is decoded and
 * analyzed in a Web Worker before playback; visuals then read a precomputed timeline by
 * playback position. See docs/superpowers/specs/2026-06-18-offline-audio-analysis-stage-a-design.md
 */
export const OFFLINE = {
  hop: 512,            // STFT hop in samples (fftSize = FFT_SIZE = 2048) -> ~86 fps @ 44.1k
  minDb: -80,          // magnitude->level mapping floor (linear, /N-normalized FFT magnitude)
  maxDb: -20,          // ...and ceiling; each bin maps (db - minDb)/(maxDb - minDb), clamped 0..1
  smoothAlpha: 0.2,    // per-pass EMA factor for zero-phase smoothing (applied forward + backward)
  presenceFloor: 0.01, // raw loudness above this counts as "a song is playing"
  beatTightness: 100,  // DP beat tracker: penalty weight on deviating from the tempo period
  drops: {
    slamSec: 0.12,            // window over which a sudden energy jump (the slam) is measured
    slamJump: 0.18,           // energy must jump >= this across slamSec to be a slam
    buildLookbackSec: 1.3,    // the build is measured over this window before the slam
    buildRise: 0.12,          // bass-weighted build signal must rise >= this over the lookback
    snapMaxSec: 0.25,         // snap a drop to a downbeat only if one is within this
    anticipationLeadSec: 1.8, // glow ramps up over this long before each drop
  },
};
```

- [ ] **Step 2: Create `src/audio/offline/types.ts`**

```ts
/** A detected drop and the build that precedes it (times in seconds). */
export interface Drop {
  time: number;        // when the slam lands (downbeat-snapped)
  intensity: number;   // 0..1 peak strength
  buildStart: number;  // anticipation ramps from here up to `time`
}

/**
 * The precomputed result of analyzing one audio file. Continuous channels share a length
 * (`frameCount`) and are sampled at `frameRate` fps; event arrays hold times in seconds.
 */
export interface AnalyzedTrack {
  duration: number;          // seconds
  sampleRate: number;
  frameRate: number;         // continuous-channel frames per second (sampleRate / hop)
  tempoBpm: number;          // 0 if undetermined
  // continuous channels, length = frameCount
  loudness: Float32Array;    // absolute RMS, zero-phase smoothed
  presence: Float32Array;    // 0..1 "song playing" gate, zero-phase smoothed
  bass: Float32Array;
  lowMid: Float32Array;
  mid: Float32Array;
  high: Float32Array;
  onset: Float32Array;       // 0..1 onset envelope (raw, for reference/fallback)
  anticipation: Float32Array;// 0..1 build-up ramp into each drop
  // events
  beats: Float32Array;       // beat times (s)
  downbeats: Float32Array;   // downbeat times (s)
  drops: Drop[];
}
```

- [ ] **Step 3: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/config.ts src/audio/offline/types.ts
git commit -m "feat(offline): Stage A config constants and AnalyzedTrack types" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Add `anticipation` to `AudioFeatures`

**Files:**
- Modify: `src/types.ts:8-19`
- Modify: `src/audio/AudioEngine.ts:6-10` (the `SILENT` literal)
- Modify: `src/audio/FeatureExtractor.ts:140-144` (the returned object)

- [ ] **Step 1: Add the field to the interface**

In `src/types.ts`, add `anticipation` as the last field of `AudioFeatures` (after `beatConfidence`):

```ts
  beatConfidence: number;  // 0..1 how locked-in the beat tracker is
  anticipation: number;    // 0..1 build-up glow before a known drop (analyzed files only; 0 live)
}
```

- [ ] **Step 2: Update `SILENT` in `AudioEngine.ts`**

Change the `SILENT` literal so its last line reads:

```ts
  beatPhase: 0, beatConfidence: 0, anticipation: 0,
```

- [ ] **Step 3: Update the `FeatureExtractor.process()` return**

In `src/audio/FeatureExtractor.ts`, change the returned object's last line:

```ts
      beatPhase, beatConfidence, anticipation: 0,
```

- [ ] **Step 4: Verify the full suite + typecheck still pass**

Run: `npm test`
Expected: all existing tests PASS (the two UI test helpers cast with `as AudioFeatures`, so they are unaffected).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/audio/AudioEngine.ts src/audio/FeatureExtractor.ts
git commit -m "feat(types): add anticipation field to AudioFeatures (0 on the live path)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `smooth.ts` — zero-phase smoothing

**Files:**
- Create: `src/audio/offline/smooth.ts`
- Test: `tests/audio/offline/smooth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { smoothZeroPhase } from '../../../src/audio/offline/smooth';

describe('smoothZeroPhase', () => {
  it('leaves a constant signal unchanged', () => {
    const out = smoothZeroPhase(Float32Array.from([0.5, 0.5, 0.5, 0.5, 0.5]), 0.3);
    for (const v of out) expect(v).toBeCloseTo(0.5, 5);
  });

  it('is zero-phase: a symmetric input gives a symmetric output (no lag)', () => {
    const out = smoothZeroPhase(Float32Array.from([0, 0, 0, 1, 0, 0, 0]), 0.3);
    expect(out[2]).toBeCloseTo(out[4], 6);
    expect(out[1]).toBeCloseTo(out[5], 6);
    expect(out[0]).toBeCloseTo(out[6], 6);
    // peak stays at the center, not shifted
    expect(out[3]).toBeGreaterThan(out[2]);
  });

  it('reduces variance of a noisy signal', () => {
    const n = 200;
    const noisy = new Float32Array(n);
    let s = 1; // LCG, deterministic
    for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) % 2147483648; noisy[i] = (s / 2147483648); }
    const out = smoothZeroPhase(noisy, 0.2);
    const varOf = (a: Float32Array) => {
      let m = 0; for (const v of a) m += v; m /= a.length;
      let v = 0; for (const x of a) v += (x - m) * (x - m); return v / a.length;
    };
    expect(varOf(out)).toBeLessThan(varOf(noisy));
  });

  it('returns an empty array for empty input', () => {
    expect(smoothZeroPhase(new Float32Array(0), 0.3).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/audio/offline/smooth.test.ts`
Expected: FAIL ("Failed to resolve import" / `smoothZeroPhase` not defined).

- [ ] **Step 3: Implement**

```ts
/**
 * Zero-phase smoothing: a one-pole EMA applied forward then backward. Running the same
 * filter both directions cancels the phase lag, so the result is smooth WITHOUT shifting
 * features in time (the same trick as SciPy's filtfilt). `alpha` is the per-pass factor.
 */
export function smoothZeroPhase(x: Float32Array, alpha: number): Float32Array {
  const n = x.length;
  const out = new Float32Array(n);
  if (n === 0) return out;
  let acc = x[0];
  out[0] = acc;
  for (let i = 1; i < n; i++) { acc += (x[i] - acc) * alpha; out[i] = acc; }
  acc = out[n - 1];
  for (let i = n - 2; i >= 0; i--) { acc += (out[i] - acc) * alpha; out[i] = acc; }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio/offline/smooth.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/offline/smooth.ts tests/audio/offline/smooth.test.ts
git commit -m "feat(offline): zero-phase (forward+backward) smoothing" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `fft.ts` — radix-2 FFT + magnitude spectrum

**Files:**
- Create: `src/audio/offline/fft.ts`
- Test: `tests/audio/offline/fft.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { magnitudeSpectrum } from '../../../src/audio/offline/fft';

describe('magnitudeSpectrum', () => {
  it('peaks at the bin of a pure cosine', () => {
    const n = 64, k = 8;
    const sig = new Float32Array(n);
    for (let i = 0; i < n; i++) sig[i] = Math.cos((2 * Math.PI * k * i) / n);
    const mag = magnitudeSpectrum(sig);
    expect(mag.length).toBe(n / 2);
    let arg = 0;
    for (let i = 1; i < mag.length; i++) if (mag[i] > mag[arg]) arg = i;
    expect(arg).toBe(k);
    expect(mag[k]).toBeGreaterThan(0.4); // full-amplitude cosine -> ~0.5 with 1/N scaling
  });

  it('a different frequency peaks at a different bin', () => {
    const n = 128, k = 20;
    const sig = new Float32Array(n);
    for (let i = 0; i < n; i++) sig[i] = Math.cos((2 * Math.PI * k * i) / n);
    const mag = magnitudeSpectrum(sig);
    let arg = 0;
    for (let i = 1; i < mag.length; i++) if (mag[i] > mag[arg]) arg = i;
    expect(arg).toBe(k);
  });

  it('a zero signal has zero magnitude', () => {
    const mag = magnitudeSpectrum(new Float32Array(32));
    for (const v of mag) expect(v).toBeCloseTo(0, 6);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/audio/offline/fft.test.ts`
Expected: FAIL (import unresolved).

- [ ] **Step 3: Implement**

```ts
/**
 * In-place iterative radix-2 Cooley–Tukey FFT. `re`/`im` must be the same length and a
 * power of two. After the call they hold the complex spectrum.
 */
export function fftInPlace(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = i + k + half;
        const bRe = re[b] * curRe - im[b] * curIm;
        const bIm = re[b] * curIm + im[b] * curRe;
        re[b] = re[a] - bRe; im[b] = im[a] - bIm;
        re[a] = re[a] + bRe; im[a] = im[a] + bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/**
 * Magnitude spectrum (length n/2) of a real signal of length n (a power of two), with
 * 1/N normalization so a full-amplitude sinusoid reads ~0.5 at its bin.
 */
export function magnitudeSpectrum(signal: Float32Array): Float32Array {
  const n = signal.length;
  const re = new Float32Array(n);
  re.set(signal);
  const im = new Float32Array(n);
  fftInPlace(re, im);
  const half = n >> 1;
  const mag = new Float32Array(half);
  for (let i = 0; i < half; i++) mag[i] = Math.hypot(re[i], im[i]) / n;
  return mag;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio/offline/fft.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/offline/fft.ts tests/audio/offline/fft.test.ts
git commit -m "feat(offline): radix-2 FFT and magnitude spectrum" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `stft.ts` — windowed framing

**Files:**
- Create: `src/audio/offline/stft.ts`
- Test: `tests/audio/offline/stft.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { hannWindow, frameCount, computeStft } from '../../../src/audio/offline/stft';

describe('frameCount', () => {
  it('counts hop frames that fit', () => {
    expect(frameCount(2048 + 512 * 3, 2048, 512)).toBe(4);
    expect(frameCount(4096, 2048, 512)).toBe(5);
  });
  it('is 0 when the signal is shorter than one frame', () => {
    expect(frameCount(1000, 2048, 512)).toBe(0);
  });
});

describe('hannWindow', () => {
  it('is 0 at the edges and 1 in the middle', () => {
    const w = hannWindow(8);
    expect(w[0]).toBeCloseTo(0, 6);
    expect(w[7]).toBeCloseTo(0, 6);
    expect(Math.max(...w)).toBeCloseTo(1, 2);
  });
});

describe('computeStft', () => {
  it('produces magnitude frames of length fftSize/2 and per-frame RMS', () => {
    const sr = 8000, n = 4096;
    const sig = new Float32Array(n);
    for (let i = 0; i < n; i++) sig[i] = Math.sin((2 * Math.PI * 200 * i) / sr);
    const s = computeStft(sig, 2048, 512);
    expect(s.frameCount).toBe(frameCount(n, 2048, 512));
    expect(s.frames.length).toBe(s.frameCount);
    expect(s.frames[0].length).toBe(1024);
    expect(s.rms[0]).toBeGreaterThan(0.3); // ~0.707 for a full-amplitude sine
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/audio/offline/stft.test.ts`
Expected: FAIL (import unresolved).

- [ ] **Step 3: Implement**

```ts
import { magnitudeSpectrum } from './fft';

export interface Stft {
  frames: Float32Array[];  // magnitude spectra, each length fftSize/2
  rms: Float32Array;       // per-frame time-domain RMS (absolute loudness)
  frameCount: number;
  hop: number;
}

/** A periodic Hann window of length n. */
export function hannWindow(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

/** How many hop-spaced frames of size fftSize fit in a signal of `length`. */
export function frameCount(length: number, fftSize: number, hop: number): number {
  if (length < fftSize) return 0;
  return 1 + Math.floor((length - fftSize) / hop);
}

/** Hann-windowed STFT: per-frame magnitude spectra plus per-frame (unwindowed) RMS. */
export function computeStft(signal: Float32Array, fftSize: number, hop: number): Stft {
  const win = hannWindow(fftSize);
  const count = frameCount(signal.length, fftSize, hop);
  const frames: Float32Array[] = [];
  const rms = new Float32Array(count);
  const buf = new Float32Array(fftSize);
  for (let f = 0; f < count; f++) {
    const start = f * hop;
    let sumSq = 0;
    for (let i = 0; i < fftSize; i++) {
      const s = signal[start + i];
      sumSq += s * s;
      buf[i] = s * win[i];
    }
    rms[f] = Math.sqrt(sumSq / fftSize);
    frames.push(magnitudeSpectrum(buf));
  }
  return { frames, rms, frameCount: count, hop };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio/offline/stft.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/offline/stft.ts tests/audio/offline/stft.test.ts
git commit -m "feat(offline): Hann-windowed STFT" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `featureTimeline.ts` — per-frame loudness/bands/onset

**Files:**
- Create: `src/audio/offline/featureTimeline.ts`
- Test: `tests/audio/offline/featureTimeline.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { computeStft } from '../../../src/audio/offline/stft';
import { computeFeatureTimeline } from '../../../src/audio/offline/featureTimeline';

function sine(freq: number, sr: number, n: number): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * freq * i) / sr);
  return x;
}

describe('computeFeatureTimeline', () => {
  it('puts a low tone in the bass band, not the high band', () => {
    const sr = 8000, n = 8192;
    const tl = computeFeatureTimeline(computeStft(sine(80, sr, n), 2048, 512), sr, 2048);
    const mid = tl.bass.length >> 1;
    expect(tl.bass[mid]).toBeGreaterThan(tl.high[mid]);
    expect(tl.loudness[mid]).toBeGreaterThan(0.3);
  });

  it('puts a high tone in the high band, not the bass band', () => {
    const sr = 16000, n = 8192;
    const tl = computeFeatureTimeline(computeStft(sine(5000, sr, n), 2048, 512), sr, 2048);
    const mid = tl.high.length >> 1;
    expect(tl.high[mid]).toBeGreaterThan(tl.bass[mid]);
  });

  it('reports ~0 loudness and bands for silence', () => {
    const sr = 8000, n = 8192;
    const tl = computeFeatureTimeline(computeStft(new Float32Array(n), 2048, 512), sr, 2048);
    const mid = tl.loudness.length >> 1;
    expect(tl.loudness[mid]).toBeCloseTo(0, 5);
    expect(tl.bass[mid]).toBeCloseTo(0, 5);
  });

  it('onset is normalized to 0..1', () => {
    const sr = 8000, n = 8192;
    const tl = computeFeatureTimeline(computeStft(sine(80, sr, n), 2048, 512), sr, 2048);
    for (const v of tl.onset) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/audio/offline/featureTimeline.test.ts`
Expected: FAIL (import unresolved).

- [ ] **Step 3: Implement**

```ts
import { BAND_EDGES, OFFLINE } from '../../config';
import type { Stft } from './stft';

export interface FeatureTimeline {
  loudness: Float32Array;
  bass: Float32Array;
  lowMid: Float32Array;
  mid: Float32Array;
  high: Float32Array;
  onset: Float32Array; // 0..1 onset envelope (low-weighted spectral flux, normalized)
}

function binFor(freq: number, sr: number, fft: number): number {
  return Math.round(freq / (sr / fft));
}

/** Map a linear FFT magnitude to a perceptual 0..1 level via dB, mirroring the live path. */
function levelOf(mag: number, minDb: number, maxDb: number): number {
  const db = 20 * Math.log10(mag + 1e-9);
  const v = (db - minDb) / (maxDb - minDb);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function computeFeatureTimeline(stft: Stft, sampleRate: number, fftSize: number): FeatureTimeline {
  const n = stft.frameCount;
  const half = fftSize >> 1;
  const loudness = new Float32Array(n);
  const bass = new Float32Array(n);
  const lowMid = new Float32Array(n);
  const mid = new Float32Array(n);
  const high = new Float32Array(n);
  const onset = new Float32Array(n);
  const rawFlux = new Float32Array(n);

  const bassLo = binFor(20, sampleRate, fftSize);
  const bassHi = binFor(BAND_EDGES.bassMax, sampleRate, fftSize);
  const lmHi = binFor(BAND_EDGES.lowMidMax, sampleRate, fftSize);
  const mdHi = binFor(BAND_EDGES.midMax, sampleRate, fftSize);
  const hiHi = Math.min(half, binFor(BAND_EDGES.highMax, sampleRate, fftSize));
  const onsetHiBin = Math.min(half, binFor(500, sampleRate, fftSize)); // kick/snare body (mirrors ONSET.lowHz)

  const avg = (level: Float32Array, lo: number, hi: number): number => {
    const h = Math.min(level.length, hi);
    if (h <= lo) return 0;
    let s = 0;
    for (let i = lo; i < h; i++) s += level[i];
    return s / (h - lo);
  };

  let prev: Float32Array | null = null;
  for (let f = 0; f < n; f++) {
    const mag = stft.frames[f];
    const level = new Float32Array(mag.length);
    for (let i = 0; i < mag.length; i++) level[i] = levelOf(mag[i], OFFLINE.minDb, OFFLINE.maxDb);

    loudness[f] = stft.rms[f];
    bass[f] = avg(level, bassLo, bassHi);
    lowMid[f] = avg(level, bassHi, lmHi);
    mid[f] = avg(level, lmHi, mdHi);
    high[f] = avg(level, mdHi, hiHi);

    if (prev) {
      let flux = 0, wsum = 0;
      for (let i = 0; i < onsetHiBin; i++) {
        const d = level[i] - prev[i];
        const w = 1 - (i / onsetHiBin) * 0.5; // weight the lowest bins (kick) highest
        if (d > 0) flux += d * w;
        wsum += w;
      }
      rawFlux[f] = wsum > 0 ? flux / wsum : 0;
    }
    prev = level;
  }

  let maxFlux = 1e-9;
  for (let f = 0; f < n; f++) if (rawFlux[f] > maxFlux) maxFlux = rawFlux[f];
  for (let f = 0; f < n; f++) onset[f] = rawFlux[f] / maxFlux;

  return { loudness, bass, lowMid, mid, high, onset };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio/offline/featureTimeline.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/offline/featureTimeline.ts tests/audio/offline/featureTimeline.test.ts
git commit -m "feat(offline): per-frame loudness, bands, and onset envelope" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `tempoGlobal.ts` — whole-track tempo

**Files:**
- Create: `src/audio/offline/tempoGlobal.ts`
- Test: `tests/audio/offline/tempoGlobal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { globalTempo } from '../../../src/audio/offline/tempoGlobal';

function pulseTrain(frameRate: number, seconds: number, bpm: number): Float32Array {
  const n = Math.round(frameRate * seconds);
  const period = Math.round((60 / bpm) * frameRate);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i += period) env[i] = 1;
  return env;
}

describe('globalTempo', () => {
  it('recovers 120 BPM', () => {
    const bpm = globalTempo(pulseTrain(100, 8, 120), 100);
    expect(bpm).toBeGreaterThan(116);
    expect(bpm).toBeLessThan(124);
  });

  it('recovers 90 BPM', () => {
    const bpm = globalTempo(pulseTrain(100, 8, 90), 100);
    expect(bpm).toBeGreaterThan(86);
    expect(bpm).toBeLessThan(94);
  });

  it('returns 0 without enough history', () => {
    expect(globalTempo(new Float32Array(20), 100)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/audio/offline/tempoGlobal.test.ts`
Expected: FAIL (import unresolved).

- [ ] **Step 3: Implement**

```ts
import { TEMPO } from '../../config';
import { estimateTempo } from '../TempoEstimator';

/**
 * Global tempo: autocorrelate the WHOLE onset envelope (reusing the validated
 * `estimateTempo`). Far more stable than the running real-time estimate, which has to
 * warm up. Returns 0 when no stable period is found.
 */
export function globalTempo(onset: Float32Array, frameRate: number): number {
  const r = estimateTempo(Array.from(onset), frameRate, TEMPO.minBpm, TEMPO.maxBpm);
  return r ? r.bpm : 0;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio/offline/tempoGlobal.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/offline/tempoGlobal.ts tests/audio/offline/tempoGlobal.test.ts
git commit -m "feat(offline): global tempo via whole-track autocorrelation" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: `beatGrid.ts` — dynamic-programming beat tracking

**Files:**
- Create: `src/audio/offline/beatGrid.ts`
- Test: `tests/audio/offline/beatGrid.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { trackBeats } from '../../../src/audio/offline/beatGrid';

function pulses(frameRate: number, seconds: number, bpm: number, drop?: number): Float32Array {
  const n = Math.round(frameRate * seconds);
  const period = Math.round((60 / bpm) * frameRate);
  const env = new Float32Array(n);
  let b = 0;
  for (let i = 0; i < n; i += period, b++) if (b !== drop) env[i] = 1;
  return env;
}

const nearestGap = (beats: Float32Array, t: number) => {
  let g = Infinity;
  for (const b of beats) g = Math.min(g, Math.abs(b - t));
  return g;
};

describe('trackBeats', () => {
  it('places beats on a clean pulse train at the right spacing', () => {
    const frameRate = 100, bpm = 120; // period = 50 frames = 0.5s
    const beats = trackBeats(pulses(frameRate, 8, bpm), frameRate, bpm);
    expect(beats.length).toBeGreaterThanOrEqual(14);
    expect(beats.length).toBeLessThanOrEqual(17);
    for (const t of beats) expect(nearestGap(Float32Array.from([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5]), t)).toBeLessThan(0.06);
  });

  it('still places a beat across a missing onset (the DP win)', () => {
    const frameRate = 100, bpm = 120;
    const beats = trackBeats(pulses(frameRate, 8, bpm, 8), frameRate, bpm); // delete the 8th pulse (t=4.0s)
    expect(nearestGap(beats, 4.0)).toBeLessThan(0.06);
  });

  it('returns empty for an empty signal or unknown tempo', () => {
    expect(trackBeats(new Float32Array(0), 100, 120).length).toBe(0);
    expect(trackBeats(new Float32Array(100), 100, 0).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/audio/offline/beatGrid.test.ts`
Expected: FAIL (import unresolved).

- [ ] **Step 3: Implement**

```ts
import { OFFLINE } from '../../config';

/**
 * Ellis-style dynamic-programming beat tracking. Given an onset envelope and a target
 * tempo, find the globally optimal beat sequence — the one maximizing onset alignment
 * while keeping inter-beat spacing close to the tempo period. Because it optimizes over
 * the whole track (non-causal), it places clean, regular beats and bridges missing
 * onsets, instead of a PLL chasing each onset. Returns beat times in seconds.
 */
export function trackBeats(onset: Float32Array, frameRate: number, bpm: number): Float32Array {
  const n = onset.length;
  if (n === 0 || bpm <= 0) return new Float32Array(0);
  const period = (frameRate * 60) / bpm; // frames per beat
  if (period < 1 || period >= n) return new Float32Array(0);

  const tightness = OFFLINE.beatTightness;
  const C = new Float32Array(n);   // best cumulative score ending with a beat at i
  const back = new Int32Array(n);  // predecessor beat index (-1 = chain start)
  back.fill(-1);
  const lo = Math.max(1, Math.round(0.5 * period));
  const hi = Math.round(2 * period);

  for (let i = 0; i < n; i++) {
    let best = 0;       // 0 = start a fresh chain (no predecessor)
    let bestJ = -1;
    for (let d = lo; d <= hi; d++) {
      const j = i - d;
      if (j < 0) break;
      const penalty = tightness * Math.pow(Math.log(d / period), 2);
      const score = C[j] - penalty;
      if (score > best) { best = score; bestJ = j; }
    }
    C[i] = onset[i] + best;
    back[i] = bestJ;
  }

  // Backtrace from the best score within the final beat period.
  let endIdx = n - 1, endBest = -Infinity;
  for (let i = Math.max(0, n - Math.round(period)); i < n; i++) {
    if (C[i] > endBest) { endBest = C[i]; endIdx = i; }
  }
  const rev: number[] = [];
  for (let i = endIdx; i >= 0; ) {
    rev.push(i);
    const p = back[i];
    if (p < 0) break;
    i = p;
  }
  rev.reverse();

  const beats = new Float32Array(rev.length);
  for (let k = 0; k < rev.length; k++) beats[k] = rev[k] / frameRate;
  return beats;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio/offline/beatGrid.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/offline/beatGrid.ts tests/audio/offline/beatGrid.test.ts
git commit -m "feat(offline): dynamic-programming beat grid" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: `downbeats.ts` — 4/4 bar-phase inference

**Files:**
- Create: `src/audio/offline/downbeats.ts`
- Test: `tests/audio/offline/downbeats.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { findDownbeats } from '../../../src/audio/offline/downbeats';

describe('findDownbeats', () => {
  it('picks the bar phase whose beats carry the most onset energy', () => {
    const frameRate = 100;
    // 16 beats every 0.5s; strong onset on beats at phase 1 (indices 1,5,9,13)
    const beats = new Float32Array(16);
    for (let i = 0; i < 16; i++) beats[i] = i * 0.5;
    const onset = new Float32Array(Math.round(16 * 0.5 * frameRate) + frameRate);
    for (let i = 1; i < 16; i += 4) onset[Math.round(beats[i] * frameRate)] = 1;
    const down = findDownbeats(beats, onset, frameRate);
    expect(down.length).toBe(4);
    expect(down[0]).toBeCloseTo(0.5, 6);  // phase 1 -> first downbeat is beats[1]
    expect(down[1]).toBeCloseTo(2.5, 6);
  });

  it('returns empty when there are no beats', () => {
    expect(findDownbeats(new Float32Array(0), new Float32Array(10), 100).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/audio/offline/downbeats.test.ts`
Expected: FAIL (import unresolved).

- [ ] **Step 3: Implement**

```ts
/**
 * Infer downbeats assuming 4/4: for each candidate bar phase (0..3), sum the onset
 * energy on the beats it would mark as downbeats, and pick the phase with the most.
 * Returns the downbeat times (every `beatsPerBar`-th beat from the winning phase).
 */
export function findDownbeats(
  beats: Float32Array,
  onset: Float32Array,
  frameRate: number,
  beatsPerBar = 4,
): Float32Array {
  if (beats.length === 0) return new Float32Array(0);
  const strengthAt = (t: number): number => {
    const f = Math.round(t * frameRate);
    return f >= 0 && f < onset.length ? onset[f] : 0;
  };
  let bestPhase = 0, bestSum = -Infinity;
  for (let p = 0; p < beatsPerBar; p++) {
    let sum = 0;
    for (let b = p; b < beats.length; b += beatsPerBar) sum += strengthAt(beats[b]);
    if (sum > bestSum) { bestSum = sum; bestPhase = p; }
  }
  const down: number[] = [];
  for (let b = bestPhase; b < beats.length; b += beatsPerBar) down.push(beats[b]);
  return Float32Array.from(down);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio/offline/downbeats.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/offline/downbeats.ts tests/audio/offline/downbeats.test.ts
git commit -m "feat(offline): 4/4 downbeat (bar-phase) inference" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: `drops.ts` — look-ahead drops + anticipation

**Files:**
- Create: `src/audio/offline/drops.ts`
- Test: `tests/audio/offline/drops.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { findDrops } from '../../../src/audio/offline/drops';

describe('findDrops', () => {
  it('detects a build+slam, snaps it to a downbeat, and ramps anticipation before it', () => {
    const frameRate = 100, n = 600; // 6s
    const energy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (i < 200) energy[i] = 0.1;
      else if (i < 350) energy[i] = 0.2 + (0.5 - 0.2) * ((i - 200) / 150); // build 0.2 -> 0.5
      else energy[i] = 0.9; // slam, sustained
    }
    const bass = energy; // same shape for the test
    const downbeats = Float32Array.from([3.5]);
    const { drops, anticipation } = findDrops(energy, bass, downbeats, frameRate);
    expect(drops.length).toBe(1);
    expect(drops[0].time).toBeCloseTo(3.5, 1);
    expect(drops[0].intensity).toBeGreaterThan(0.8);
    // anticipation rises into the drop and is higher just before it than well before it
    const justBefore = anticipation[Math.round(3.4 * frameRate)];
    const wellBefore = anticipation[Math.round(2.2 * frameRate)];
    expect(justBefore).toBeGreaterThan(wellBefore);
    expect(justBefore).toBeGreaterThan(0.5);
  });

  it('does not fire on a gradual swell with no slam', () => {
    const frameRate = 100, n = 600;
    const energy = new Float32Array(n);
    for (let i = 0; i < n; i++) energy[i] = (i / n) * 0.9; // slow ramp, tiny per-window jump
    const { drops } = findDrops(energy, energy, new Float32Array(0), frameRate);
    expect(drops.length).toBe(0);
  });

  it('returns empty structures for an empty signal', () => {
    const { drops, anticipation } = findDrops(new Float32Array(0), new Float32Array(0), new Float32Array(0), 100);
    expect(drops.length).toBe(0);
    expect(anticipation.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/audio/offline/drops.test.ts`
Expected: FAIL (import unresolved).

- [ ] **Step 3: Implement**

```ts
import { DROP, OFFLINE } from '../../config';
import type { Drop } from './types';

function snapToDownbeat(downbeats: Float32Array, t: number, maxSec: number): number {
  let best = t, bestDist = maxSec;
  for (let i = 0; i < downbeats.length; i++) {
    const dist = Math.abs(downbeats[i] - t);
    if (dist < bestDist) { bestDist = dist; best = downbeats[i]; }
  }
  return best;
}

/**
 * Non-causal drop detection: scan an internal energy curve (unit sensitivity) plus the
 * bass channel for a sustained build followed by a sudden slam, snap each slam to the
 * nearest downbeat, and precompute an anticipation ramp rising into each drop.
 */
export function findDrops(
  energy: Float32Array,
  bass: Float32Array,
  downbeats: Float32Array,
  frameRate: number,
): { drops: Drop[]; anticipation: Float32Array } {
  const n = energy.length;
  const anticipation = new Float32Array(n);
  const drops: Drop[] = [];
  if (n === 0) return { drops, anticipation };

  const build = new Float32Array(n);
  for (let i = 0; i < n; i++) build[i] = (1 - DROP.bassWeight) * energy[i] + DROP.bassWeight * bass[i];

  const slamWin = Math.max(1, Math.round(OFFLINE.drops.slamSec * frameRate));
  const buildWin = Math.max(1, Math.round(OFFLINE.drops.buildLookbackSec * frameRate));
  const cooldownFrames = Math.round(DROP.cooldownSec * frameRate);
  let lastFrame = -Infinity;

  for (let i = slamWin; i < n; i++) {
    if (i - lastFrame < cooldownFrames) continue;
    if (energy[i] < DROP.highThreshold) continue;                 // must end up loud
    if (energy[i] - energy[i - slamWin] < OFFLINE.drops.slamJump) continue; // sudden jump
    const preEnd = i - slamWin;
    const preStart = Math.max(0, preEnd - buildWin);
    if (build[preEnd] - build[preStart] < OFFLINE.drops.buildRise) continue; // earned by a build

    let time = i / frameRate;
    time = snapToDownbeat(downbeats, time, OFFLINE.drops.snapMaxSec);
    const buildStart = Math.max(0, time - OFFLINE.drops.anticipationLeadSec);
    drops.push({ time, intensity: Math.min(1, energy[i]), buildStart });
    lastFrame = Math.round(time * frameRate);
  }

  for (const d of drops) {
    const s = Math.max(0, Math.round(d.buildStart * frameRate));
    const e = Math.min(n - 1, Math.round(d.time * frameRate));
    const span = Math.max(1, e - s);
    for (let f = s; f <= e; f++) {
      const r = (f - s) / span;
      if (r > anticipation[f]) anticipation[f] = r;
    }
  }

  return { drops, anticipation };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio/offline/drops.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/offline/drops.ts tests/audio/offline/drops.test.ts
git commit -m "feat(offline): look-ahead drop detection + anticipation channel" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: `analyzeTrack.ts` — pipeline orchestrator

**Files:**
- Create: `src/audio/offline/analyzeTrack.ts`
- Test: `tests/audio/offline/analyzeTrack.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { analyzeTrack } from '../../../src/audio/offline/analyzeTrack';

/** A synthetic 120 BPM kick track: a short decaying low-sine burst on each beat. */
function kickTrack(sr: number, seconds: number, bpm: number): Float32Array {
  const n = sr * seconds;
  const x = new Float32Array(n);
  const period = (sr * 60) / bpm;
  const burst = Math.round(sr * 0.05);
  for (let b = 0; b * period < n; b++) {
    const start = Math.round(b * period);
    for (let i = 0; i < burst && start + i < n; i++) {
      const env = Math.exp(-i / (sr * 0.012));
      x[start + i] += Math.sin((2 * Math.PI * 80 * i) / sr) * env;
    }
  }
  return x;
}

describe('analyzeTrack', () => {
  it('recovers tempo, beats, and a consistent timeline', () => {
    const sr = 22050;
    const track = analyzeTrack(kickTrack(sr, 6, 120), sr);
    expect(track.tempoBpm).toBeGreaterThan(108);
    expect(track.tempoBpm).toBeLessThan(132);
    expect(track.beats.length).toBeGreaterThan(8);
    expect(track.duration).toBeCloseTo(6, 1);
    expect(track.frameRate).toBeCloseTo(sr / 512, 3);
    // channels share a length
    const len = track.loudness.length;
    for (const ch of [track.presence, track.bass, track.lowMid, track.mid, track.high, track.onset, track.anticipation]) {
      expect(ch.length).toBe(len);
    }
  });

  it('drives the progress callback to completion', () => {
    const sr = 22050;
    let last = 0;
    analyzeTrack(kickTrack(sr, 4, 120), sr, (p) => { last = p; });
    expect(last).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/audio/offline/analyzeTrack.test.ts`
Expected: FAIL (import unresolved).

- [ ] **Step 3: Implement**

```ts
import { FFT_SIZE, ENERGY, OFFLINE } from '../../config';
import { computeStft } from './stft';
import { computeFeatureTimeline } from './featureTimeline';
import { smoothZeroPhase } from './smooth';
import { globalTempo } from './tempoGlobal';
import { trackBeats } from './beatGrid';
import { findDownbeats } from './downbeats';
import { findDrops } from './drops';
import type { AnalyzedTrack } from './types';

/**
 * Analyze a whole mono track offline into an AnalyzedTrack. Pure and synchronous so it
 * can run in a worker OR be unit-tested directly. `onProgress` receives 0..1.
 */
export function analyzeTrack(
  channel: Float32Array,
  sampleRate: number,
  onProgress?: (pct: number) => void,
): AnalyzedTrack {
  const hop = OFFLINE.hop;
  const stft = computeStft(channel, FFT_SIZE, hop);
  onProgress?.(0.45);

  const frameRate = sampleRate / hop;
  const tl = computeFeatureTimeline(stft, sampleRate, FFT_SIZE);
  onProgress?.(0.6);

  const a = OFFLINE.smoothAlpha;
  const loudness = smoothZeroPhase(tl.loudness, a);
  const bass = smoothZeroPhase(tl.bass, a);
  const lowMid = smoothZeroPhase(tl.lowMid, a);
  const mid = smoothZeroPhase(tl.mid, a);
  const high = smoothZeroPhase(tl.high, a);
  const onset = tl.onset; // raw envelope drives tempo + beat grid

  const n = loudness.length;
  const presenceRaw = new Float32Array(n);
  for (let i = 0; i < n; i++) presenceRaw[i] = loudness[i] > OFFLINE.presenceFloor ? 1 : 0;
  const presence = smoothZeroPhase(presenceRaw, a);

  // Internal energy (unit sensitivity) for drop detection; the provider re-derives the
  // final, sensitivity-scaled energy at sample time.
  const energy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const intensity = Math.pow(Math.min(1, loudness[i] / ENERGY.fullScale), ENERGY.dynamicsGamma);
    energy[i] = presence[i] * intensity;
  }
  onProgress?.(0.75);

  const tempoBpm = globalTempo(onset, frameRate);
  const beats = trackBeats(onset, frameRate, tempoBpm);
  const downbeats = findDownbeats(beats, onset, frameRate);
  onProgress?.(0.9);

  const { drops, anticipation } = findDrops(energy, bass, downbeats, frameRate);
  onProgress?.(1);

  return {
    duration: channel.length / sampleRate,
    sampleRate,
    frameRate,
    tempoBpm,
    loudness,
    presence,
    bass,
    lowMid,
    mid,
    high,
    onset,
    anticipation,
    beats,
    downbeats,
    drops,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio/offline/analyzeTrack.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/offline/analyzeTrack.ts tests/audio/offline/analyzeTrack.test.ts
git commit -m "feat(offline): analyzeTrack pipeline orchestrator" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: `FeatureProvider` interface + `AudioSource.createProvider?`

**Files:**
- Create: `src/audio/providers/FeatureProvider.ts`
- Modify: `src/audio/sources/AudioSource.ts`

- [ ] **Step 1: Create the interface**

`src/audio/providers/FeatureProvider.ts`:

```ts
import type { AudioFeatures } from '../../types';

/**
 * Produces the per-frame AudioFeatures the renderer consumes. Two implementations exist:
 * a live one reading an analyser (mic/tab) and an analyzed one reading a precomputed
 * timeline (local files).
 */
export interface FeatureProvider {
  sample(): AudioFeatures;
  /** Live providers honor the sensitivity slider; analyzed ones apply it to stored loudness. */
  setSensitivity?(value: number): void;
}
```

- [ ] **Step 2: Extend `AudioSource`**

Replace the contents of `src/audio/sources/AudioSource.ts` with:

```ts
import type { FeatureProvider } from '../providers/FeatureProvider';

export interface AudioSource {
  readonly label: string;
  /** Create and return the source node connected to the given context. */
  connect(ctx: AudioContext): Promise<AudioNode>;
  stop(): void;
  /**
   * Optional: sources that precompute their own features (analyzed files) supply a
   * provider here. Sources without it get a live analyser-based provider from the engine.
   */
  createProvider?(ctx: AudioContext): FeatureProvider | Promise<FeatureProvider>;
}
```

- [ ] **Step 3: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors (existing sources don't implement the optional method — fine).

- [ ] **Step 4: Commit**

```bash
git add src/audio/providers/FeatureProvider.ts src/audio/sources/AudioSource.ts
git commit -m "feat(audio): FeatureProvider interface and optional AudioSource.createProvider" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: `LiveFeatureProvider` + refactor `AudioEngine` to delegate

**Files:**
- Create: `src/audio/providers/LiveFeatureProvider.ts`
- Test: `tests/audio/providers/LiveFeatureProvider.test.ts`
- Modify: `src/audio/AudioEngine.ts` (full rewrite of the class body)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { LiveFeatureProvider } from '../../../src/audio/providers/LiveFeatureProvider';

function fakeAnalyser(fill: number, time: number): AnalyserNode {
  return {
    frequencyBinCount: 1024,
    fftSize: 2048,
    getByteFrequencyData: (a: Uint8Array) => a.fill(fill),
    getByteTimeDomainData: (a: Uint8Array) => a.fill(time),
  } as unknown as AnalyserNode;
}

describe('LiveFeatureProvider', () => {
  it('reads silence as ~0 loudness and includes anticipation: 0', () => {
    const p = new LiveFeatureProvider(fakeAnalyser(0, 128), 44100, 2048, 1);
    const f = p.sample();
    expect(f.loudness).toBeCloseTo(0, 2);
    expect(f.anticipation).toBe(0);
    expect(f.drop).toBe(0);
  });

  it('setSensitivity does not throw and sampling stays well-formed', () => {
    const p = new LiveFeatureProvider(fakeAnalyser(200, 200), 44100, 2048, 1);
    p.setSensitivity(2);
    const f = p.sample();
    expect(Number.isFinite(f.energy)).toBe(true);
    expect(f.bands.bass).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/audio/providers/LiveFeatureProvider.test.ts`
Expected: FAIL (import unresolved).

- [ ] **Step 3: Implement `LiveFeatureProvider`**

`src/audio/providers/LiveFeatureProvider.ts`:

```ts
import { FeatureExtractor } from '../FeatureExtractor';
import type { AudioFeatures } from '../../types';
import type { FeatureProvider } from './FeatureProvider';

/**
 * The real-time path, extracted verbatim from the old AudioEngine: read the analyser's
 * frequency + time data each frame, compute waveform RMS (absolute loudness), and run the
 * causal FeatureExtractor. Used for mic/tab and any source that doesn't analyze itself.
 */
export class LiveFeatureProvider implements FeatureProvider {
  private data: Uint8Array<ArrayBuffer>;
  private timeData: Uint8Array<ArrayBuffer>;
  private extractor: FeatureExtractor;
  private last = performance.now();

  constructor(private analyser: AnalyserNode, sampleRate: number, fftSize: number, sensitivity: number) {
    this.data = new Uint8Array(analyser.frequencyBinCount);
    this.timeData = new Uint8Array(analyser.fftSize);
    this.extractor = new FeatureExtractor(sampleRate, fftSize);
    this.extractor.gain = sensitivity;
  }

  setSensitivity(value: number): void {
    this.extractor.gain = value;
  }

  sample(): AudioFeatures {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.analyser.getByteFrequencyData(this.data);
    this.analyser.getByteTimeDomainData(this.timeData);
    let sumSq = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const v = (this.timeData[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / this.timeData.length);
    return this.extractor.process(this.data, rms, dt);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio/providers/LiveFeatureProvider.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Rewrite `AudioEngine` to delegate**

Replace the entire contents of `src/audio/AudioEngine.ts` with:

```ts
import { FFT_SIZE, ENERGY } from '../config';
import type { AudioFeatures } from '../types';
import type { AudioSource } from './sources/AudioSource';
import type { FeatureProvider } from './providers/FeatureProvider';
import { LiveFeatureProvider } from './providers/LiveFeatureProvider';

const SILENT: AudioFeatures = {
  loudness: 0, energy: 0, bands: { bass: 0, lowMid: 0, mid: 0, high: 0 },
  beat: 0, motionSpeed: 0.35, tempoBpm: null, presence: 0, drop: 0,
  beatPhase: 0, beatConfidence: 0, anticipation: 0,
};

export class AudioEngine {
  private ctx?: AudioContext;
  private source?: AudioSource;
  private provider?: FeatureProvider;
  private sensitivity = ENERGY.defaultSensitivity;

  /** Set the loudness sensitivity (gain). Persists across source switches. */
  setSensitivity(value: number): void {
    this.sensitivity = value;
    this.provider?.setSensitivity?.(value);
  }

  async use(source: AudioSource): Promise<void> {
    await this.teardown();
    const ctx = new AudioContext();
    let node: AudioNode;
    try {
      node = await source.connect(ctx);
    } catch (err) {
      source.stop();
      await ctx.close();
      throw err;
    }
    this.ctx = ctx;
    this.source = source;

    if (source.createProvider) {
      this.provider = await source.createProvider(ctx);
    } else {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.6;
      node.connect(analyser);
      this.provider = new LiveFeatureProvider(analyser, ctx.sampleRate, FFT_SIZE, this.sensitivity);
    }
    this.provider.setSensitivity?.(this.sensitivity);
  }

  /** Pull the latest features; call once per render frame. */
  sample(): AudioFeatures {
    return this.provider ? this.provider.sample() : SILENT;
  }

  async teardown(): Promise<void> {
    this.source?.stop();
    await this.ctx?.close();
    this.ctx = undefined;
    this.source = undefined;
    this.provider = undefined;
  }
}
```

- [ ] **Step 6: Verify the whole suite + typecheck**

Run: `npm test`
Expected: all tests PASS (mic/tab path is behavior-preserved).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/audio/providers/LiveFeatureProvider.ts tests/audio/providers/LiveFeatureProvider.test.ts src/audio/AudioEngine.ts
git commit -m "refactor(audio): split AudioEngine behind a FeatureProvider (live path extracted)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 14: `AnalyzedFeatureProvider` — timeline → AudioFeatures

**Files:**
- Create: `src/audio/providers/AnalyzedFeatureProvider.ts`
- Test: `tests/audio/providers/AnalyzedFeatureProvider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { AnalyzedFeatureProvider } from '../../../src/audio/providers/AnalyzedFeatureProvider';
import type { AnalyzedTrack } from '../../../src/audio/offline/types';

function track(over: Partial<AnalyzedTrack> = {}): AnalyzedTrack {
  const z = (vals: number[]) => Float32Array.from(vals);
  return {
    duration: 2, sampleRate: 44100, frameRate: 1, tempoBpm: 120,
    loudness: z([0, 1, 0]), presence: z([1, 1, 1]),
    bass: z([0, 1, 0]), lowMid: z([0, 0, 0]), mid: z([0, 0, 0]), high: z([0, 0, 0]),
    onset: z([0, 0, 0]), anticipation: z([0, 0.5, 1]),
    beats: z([0, 0.5, 1, 1.5]), downbeats: z([0]), drops: [],
    ...over,
  };
}

describe('AnalyzedFeatureProvider', () => {
  it('linearly interpolates channels between frames', () => {
    let t = 0.5; // frameRate 1 -> frame 0.5, halfway between loudness[0]=0 and [1]=1
    const p = new AnalyzedFeatureProvider(track(), () => t);
    expect(p.sample().loudness).toBeCloseTo(0.5, 5);
    expect(p.sample().anticipation).toBeCloseTo(0.25, 5);
  });

  it('reports beat phase ~0.5 midway between beats', () => {
    let t = 0.25; // between beats 0 and 0.5
    const p = new AnalyzedFeatureProvider(track(), () => t);
    expect(p.sample().beatPhase).toBeCloseTo(0.5, 2);
  });

  it('fires and decays a drop after its time', () => {
    const t0 = track({ drops: [{ time: 1, intensity: 1, buildStart: 0 }] });
    let t = 0.5;
    const p = new AnalyzedFeatureProvider(t0, () => t);
    expect(p.sample().drop).toBe(0);     // before the drop
    t = 1.0; expect(p.sample().drop).toBeGreaterThan(0.9); // at the drop
    t = 1.0 + 5; expect(p.sample().drop).toBe(0);          // long after -> decayed
  });

  it('applies sensitivity to energy', () => {
    let t = 1; // loudness peak = 1
    const p = new AnalyzedFeatureProvider(track(), () => t);
    const lo = p.sample().energy;
    p.setSensitivity(2.5);
    const hi = p.sample().energy;
    expect(hi).toBeGreaterThan(lo);
  });

  it('wraps the playback position for looping', () => {
    let t = 2.5; // duration 2 -> wraps to 0.5
    const p = new AnalyzedFeatureProvider(track(), () => t);
    expect(p.sample().loudness).toBeCloseTo(0.5, 5);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/audio/providers/AnalyzedFeatureProvider.test.ts`
Expected: FAIL (import unresolved).

- [ ] **Step 3: Implement**

`src/audio/providers/AnalyzedFeatureProvider.ts`:

```ts
import { ENERGY, BEAT, DROP } from '../../config';
import type { AudioFeatures } from '../../types';
import type { AnalyzedTrack, Drop } from '../offline/types';
import type { FeatureProvider } from './FeatureProvider';
import { computeMotionSpeed } from '../tempo';

/** Linear interpolation of a channel at fractional frame index f, clamped to the ends. */
function interp(ch: Float32Array, f: number): number {
  if (ch.length === 0) return 0;
  if (f <= 0) return ch[0];
  if (f >= ch.length - 1) return ch[ch.length - 1];
  const i = Math.floor(f);
  return ch[i] + (ch[i + 1] - ch[i]) * (f - i);
}

/** Beat pulse + phase from the known beat grid (phase 0 = on the beat). */
function beatAt(beats: Float32Array, t: number): { beat: number; beatPhase: number } {
  if (beats.length < 2 || t <= beats[0] || t >= beats[beats.length - 1]) {
    return { beat: 0, beatPhase: 0 };
  }
  let lo = 0, hi = beats.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (beats[m] <= t) lo = m; else hi = m;
  }
  const period = beats[hi] - beats[lo];
  const phase = period > 0 ? (t - beats[lo]) / period : 0;
  const beat = phase < BEAT.pulseDecayBeats ? 1 - phase / BEAT.pulseDecayBeats : 0;
  return { beat, beatPhase: phase };
}

/** Drop envelope: each drop spikes to its intensity then decays at DROP.decayPerSec. */
function dropAt(drops: Drop[], t: number): number {
  let v = 0;
  for (const d of drops) {
    if (t >= d.time) {
      const e = d.intensity * Math.max(0, 1 - (t - d.time) * DROP.decayPerSec);
      if (e > v) v = e;
    }
  }
  return v;
}

/**
 * Reads a precomputed AnalyzedTrack by playback position to produce AudioFeatures. Energy
 * is derived from stored loudness × live sensitivity (so the slider works for files);
 * everything else is interpolated from channels or looked up from the event grids.
 */
export class AnalyzedFeatureProvider implements FeatureProvider {
  private gain = ENERGY.defaultSensitivity;

  constructor(private track: AnalyzedTrack, private positionSec: () => number) {}

  setSensitivity(value: number): void {
    this.gain = value;
  }

  sample(): AudioFeatures {
    const dur = this.track.duration;
    const raw = this.positionSec();
    const t = dur > 0 ? ((raw % dur) + dur) % dur : 0;
    const f = t * this.track.frameRate;

    const loudness = interp(this.track.loudness, f);
    const presence = interp(this.track.presence, f);
    const bands = {
      bass: interp(this.track.bass, f),
      lowMid: interp(this.track.lowMid, f),
      mid: interp(this.track.mid, f),
      high: interp(this.track.high, f),
    };
    const anticipation = interp(this.track.anticipation, f);

    const scaled = loudness * this.gain;
    const intensity = Math.pow(Math.min(1, scaled / ENERGY.fullScale), ENERGY.dynamicsGamma);
    const energy = presence * intensity;

    const tempoBpm = this.track.tempoBpm > 0 ? this.track.tempoBpm : null;
    const motionSpeed = computeMotionSpeed(energy, tempoBpm);
    const { beat, beatPhase } = beatAt(this.track.beats, t);
    const beatConfidence = this.track.beats.length > 1 ? 1 : 0;
    const drop = dropAt(this.track.drops, t);

    return { loudness, energy, bands, beat, motionSpeed, tempoBpm, presence, drop, beatPhase, beatConfidence, anticipation };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio/providers/AnalyzedFeatureProvider.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/providers/AnalyzedFeatureProvider.ts tests/audio/providers/AnalyzedFeatureProvider.test.ts
git commit -m "feat(audio): AnalyzedFeatureProvider (timeline lookup -> AudioFeatures)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 15: `mixToMono` + worker entry

**Files:**
- Create: `src/audio/offline/mixToMono.ts`
- Test: `tests/audio/offline/mixToMono.test.ts`
- Create: `src/audio/offline/worker.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mixToMono } from '../../../src/audio/offline/mixToMono';

describe('mixToMono', () => {
  it('averages stereo channels', () => {
    const out = mixToMono([Float32Array.from([1, 0]), Float32Array.from([0, 1])], 2);
    expect(Array.from(out)).toEqual([0.5, 0.5]);
  });
  it('cancels opposite channels', () => {
    const out = mixToMono([Float32Array.from([1, 1]), Float32Array.from([-1, -1])], 2);
    expect(Array.from(out)).toEqual([0, 0]);
  });
  it('passes a single channel through', () => {
    const out = mixToMono([Float32Array.from([0.2, 0.4, 0.6])], 3);
    expect(Array.from(out)).toEqual([0.2, 0.4, 0.6]);
  });
  it('returns zeros for no channels', () => {
    expect(Array.from(mixToMono([], 2))).toEqual([0, 0]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/audio/offline/mixToMono.test.ts`
Expected: FAIL (import unresolved).

- [ ] **Step 3: Implement `mixToMono`**

`src/audio/offline/mixToMono.ts`:

```ts
/** Average N channels into a single mono buffer of `length` samples. */
export function mixToMono(channels: Float32Array[], length: number): Float32Array {
  const out = new Float32Array(length);
  if (channels.length === 0) return out;
  for (const ch of channels) {
    const m = Math.min(length, ch.length);
    for (let i = 0; i < m; i++) out[i] += ch[i];
  }
  const inv = 1 / channels.length;
  for (let i = 0; i < length; i++) out[i] *= inv;
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio/offline/mixToMono.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement the worker (no unit test — verified by build + manual)**

`src/audio/offline/worker.ts`:

```ts
import { analyzeTrack } from './analyzeTrack';

/**
 * Thin Web Worker entry. Receives a mono channel + sampleRate, runs analyzeTrack, and
 * posts progress then the finished AnalyzedTrack (or an error). All real logic lives in
 * analyzeTrack so it stays unit-testable on the main thread.
 */
self.onmessage = (e: MessageEvent) => {
  const { channel, sampleRate } = e.data as { channel: Float32Array; sampleRate: number };
  try {
    const track = analyzeTrack(channel, sampleRate, (pct) =>
      (self as unknown as Worker).postMessage({ type: 'progress', pct }),
    );
    (self as unknown as Worker).postMessage({ type: 'done', track });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
```

- [ ] **Step 6: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/audio/offline/mixToMono.ts tests/audio/offline/mixToMono.test.ts src/audio/offline/worker.ts
git commit -m "feat(offline): mono mixdown util and analysis worker entry" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 16: `AnalyzedFileSource` + wire it into `InputManager`

**Files:**
- Create: `src/audio/sources/AnalyzedFileSource.ts`
- Modify: `src/audio/InputManager.ts`

- [ ] **Step 1: Implement `AnalyzedFileSource`**

`src/audio/sources/AnalyzedFileSource.ts`:

```ts
import { FFT_SIZE, ENERGY } from '../../config';
import type { AudioSource } from './AudioSource';
import type { FeatureProvider } from '../providers/FeatureProvider';
import { AnalyzedFeatureProvider } from '../providers/AnalyzedFeatureProvider';
import { LiveFeatureProvider } from '../providers/LiveFeatureProvider';
import { FileSource } from './FileSource';
import { mixToMono } from '../offline/mixToMono';
import type { AnalyzedTrack } from '../offline/types';

export type ProgressStage = 'decoding' | 'analyzing' | 'ready';
export type ProgressFn = (stage: ProgressStage, pct: number) => void;

/**
 * The "analyzed track" mode for local files: decode the whole file, analyze it in a Web
 * Worker, then play it back via an AudioBufferSourceNode while exposing an
 * AnalyzedFeatureProvider that reads the precomputed timeline by playback position. If
 * decode or analysis fails, it falls back to the real-time FileSource path.
 */
export class AnalyzedFileSource implements AudioSource {
  readonly label = 'Audio file';
  private track?: AnalyzedTrack;
  private node?: AudioBufferSourceNode;
  private startTime = 0;
  private fallback?: FileSource;
  private fallbackNode?: AudioNode;

  constructor(private file: File, private onProgress?: ProgressFn) {}

  async connect(ctx: AudioContext): Promise<AudioNode> {
    try {
      const arr = await this.file.arrayBuffer();
      this.onProgress?.('decoding', 0);
      const buffer = await ctx.decodeAudioData(arr);
      const channels: Float32Array[] = [];
      for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
      const mono = mixToMono(channels, buffer.length);
      this.track = await this.analyze(mono, buffer.sampleRate);

      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.loop = true;
      node.connect(ctx.destination);
      node.start();
      this.startTime = ctx.currentTime;
      this.node = node;
      this.onProgress?.('ready', 1);
      return node;
    } catch {
      // Unsupported codec or analysis failure -> degrade to the real-time path.
      this.fallback = new FileSource(this.file);
      this.fallbackNode = await this.fallback.connect(ctx);
      this.onProgress?.('ready', 1);
      return this.fallbackNode;
    }
  }

  createProvider(ctx: AudioContext): FeatureProvider {
    if (this.track && this.node) {
      return new AnalyzedFeatureProvider(
        this.track,
        () => ctx.currentTime - this.startTime - (ctx.outputLatency || 0),
      );
    }
    // Fallback: a live analyser tapping the real-time node.
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.6;
    this.fallbackNode!.connect(analyser);
    return new LiveFeatureProvider(analyser, ctx.sampleRate, FFT_SIZE, ENERGY.defaultSensitivity);
  }

  private analyze(mono: Float32Array, sampleRate: number): Promise<AnalyzedTrack> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../offline/worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent) => {
        const m = e.data;
        if (m.type === 'progress') this.onProgress?.('analyzing', m.pct);
        else if (m.type === 'done') { worker.terminate(); resolve(m.track as AnalyzedTrack); }
        else if (m.type === 'error') { worker.terminate(); reject(new Error(m.message)); }
      };
      worker.onerror = () => { worker.terminate(); reject(new Error('analysis worker failed')); };
      const copy = mono.slice(); // give the worker its own transferable buffer
      worker.postMessage({ channel: copy, sampleRate }, [copy.buffer]);
    });
  }

  stop(): void {
    if (this.node) {
      try { this.node.stop(); } catch { /* already stopped */ }
    }
    this.fallback?.stop();
  }
}
```

- [ ] **Step 2: Wire it into `InputManager`**

Replace the contents of `src/audio/InputManager.ts` with:

```ts
import { AudioEngine } from './AudioEngine';
import { MicSource } from './sources/MicSource';
import { DisplaySource } from './sources/DisplaySource';
import { AnalyzedFileSource } from './sources/AnalyzedFileSource';
import type { ProgressFn } from './sources/AnalyzedFileSource';

export type SourceKind = 'mic' | 'display' | 'file';

export class InputManager {
  constructor(private engine: AudioEngine, private onProgress?: ProgressFn) {}

  async select(kind: SourceKind, file?: File): Promise<void> {
    switch (kind) {
      case 'mic': return this.engine.use(new MicSource());
      case 'display': return this.engine.use(new DisplaySource());
      case 'file':
        if (!file) throw new Error('No file provided');
        return this.engine.use(new AnalyzedFileSource(file, this.onProgress));
    }
  }
}
```

- [ ] **Step 3: Verify the full suite + typecheck + build**

Run: `npm test`
Expected: all tests PASS (no test imports `AnalyzedFileSource` directly; existing tests unaffected).

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds (this confirms Vite resolves the `new Worker(new URL(...))` import).

- [ ] **Step 4: Commit**

```bash
git add src/audio/sources/AnalyzedFileSource.ts src/audio/InputManager.ts
git commit -m "feat(audio): AnalyzedFileSource (decode + worker + buffer playback) with real-time fallback" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 17: Renderer anticipation build-up glow

**Files:**
- Modify: `src/visual/Renderer.ts` (inside `frame()`, after the scene is composited to the visible canvas — current lines 81-86)

- [ ] **Step 1: Add the build-up glow**

In `src/visual/Renderer.ts`, inside `frame(dt)`, immediately AFTER the kaleidoscope composite block (the `if (k > 0.01) { ... }` block ending at line 86) and BEFORE the `this.onFrame?.(...)` call, insert:

```ts
    // Pre-drop build-up: a swelling radial glow during the bars before a known drop
    // (analyzed files only; `anticipation` is 0 on the live path).
    const a = features.anticipation;
    if (a > 0.01) {
      const cx = this.w / 2, cy = this.h / 2;
      const r = Math.hypot(this.w, this.h) * (0.3 + 0.7 * a);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const hue = this.palette.baseHue;
      grad.addColorStop(0, `hsla(${hue}, 95%, 65%, ${0.22 * a})`);
      grad.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalCompositeOperation = 'source-over';
    }
```

- [ ] **Step 2: Verify typecheck + full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all tests PASS (Renderer has no unit test; behavior verified in-browser in Task 19).

- [ ] **Step 3: Commit**

```bash
git add src/visual/Renderer.ts
git commit -m "feat(visual): pre-drop build-up glow driven by anticipation" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 18: Analysis progress overlay + wiring

**Files:**
- Create: `src/ui/AnalysisOverlay.ts`
- Test: `tests/ui/AnalysisOverlay.test.ts`
- Modify: `src/main.ts` (lines 19-20 area and the `InputManager` construction)
- Modify: `src/ui/hud.css` (append overlay styles)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { AnalysisOverlay } from '../../src/ui/AnalysisOverlay';

describe('AnalysisOverlay', () => {
  let root: HTMLElement;
  beforeEach(() => { root = document.createElement('div'); document.body.appendChild(root); });

  it('shows analyzing progress as a percentage and bar width', () => {
    const o = new AnalysisOverlay(root);
    o.update('analyzing', 0.5);
    const el = root.querySelector('.analysis-overlay') as HTMLElement;
    expect(el.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.analysis-label')!.textContent).toContain('50');
    expect((root.querySelector('.analysis-bar') as HTMLElement).style.width).toBe('50%');
  });

  it('shows a decoding label', () => {
    const o = new AnalysisOverlay(root);
    o.update('decoding', 0);
    expect(root.querySelector('.analysis-label')!.textContent!.toLowerCase()).toContain('decod');
  });

  it('hides on ready', () => {
    const o = new AnalysisOverlay(root);
    o.update('analyzing', 0.4);
    o.update('ready', 1);
    expect((root.querySelector('.analysis-overlay') as HTMLElement).classList.contains('hidden')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ui/AnalysisOverlay.test.ts`
Expected: FAIL (import unresolved).

- [ ] **Step 3: Implement `AnalysisOverlay`**

`src/ui/AnalysisOverlay.ts`:

```ts
import type { ProgressStage } from '../audio/sources/AnalyzedFileSource';

/** A small centered overlay shown while a file is decoded and analyzed before playback. */
export class AnalysisOverlay {
  private el: HTMLDivElement;
  private label: HTMLDivElement;
  private bar: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'analysis-overlay hidden';
    this.label = document.createElement('div');
    this.label.className = 'analysis-label';
    const track = document.createElement('div');
    track.className = 'analysis-track';
    this.bar = document.createElement('div');
    this.bar.className = 'analysis-bar';
    track.appendChild(this.bar);
    this.el.appendChild(this.label);
    this.el.appendChild(track);
    parent.appendChild(this.el);
  }

  update(stage: ProgressStage, pct: number): void {
    if (stage === 'ready') {
      this.el.classList.add('hidden');
      return;
    }
    this.el.classList.remove('hidden');
    const p = Math.round(pct * 100);
    this.label.textContent = stage === 'decoding' ? 'Decoding…' : `Analyzing… ${p}%`;
    this.bar.style.width = `${p}%`;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/ui/AnalysisOverlay.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Append overlay styles to `src/ui/hud.css`**

Add at the end of `src/ui/hud.css`:

```css
/* Analysis progress overlay (offline file analysis, Stage A) */
.analysis-overlay {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  padding: 18px 22px;
  border-radius: 12px;
  background: rgba(10, 14, 30, 0.72);
  border: 0.5px solid var(--accent, #4aa3ff);
  box-shadow: 0 0 24px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  font-family: ui-monospace, monospace;
  color: #e6f0ff;
  pointer-events: none;
  z-index: 50;
  transition: opacity 0.25s ease;
}
.analysis-overlay.hidden {
  opacity: 0;
  visibility: hidden;
}
.analysis-label {
  font-size: 13px;
  letter-spacing: 0.04em;
}
.analysis-track {
  width: 220px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}
.analysis-bar {
  height: 100%;
  width: 0%;
  background: var(--accent, #4aa3ff);
  box-shadow: 0 0 10px var(--accent, #4aa3ff);
  transition: width 0.15s linear;
}
```

- [ ] **Step 6: Wire it into `main.ts`**

In `src/main.ts`, change the engine/input construction (currently lines 19-20):

```ts
const engine = new AudioEngine();
```

to add the overlay and pass progress into `InputManager`. Replace line 19-20:

```ts
const engine = new AudioEngine();
const ui = document.getElementById('ui')!;
const analysisOverlay = new AnalysisOverlay(ui);
const input = new InputManager(engine, (stage, pct) => analysisOverlay.update(stage, pct));
```

Then REMOVE the now-duplicate `const ui = document.getElementById('ui')!;` line that currently sits at line 33 (it's created above now). Add the import near the other UI imports:

```ts
import { AnalysisOverlay } from './ui/AnalysisOverlay';
```

(Confirm `InputManager` is still imported — it is, on line 4. The original `const input = new InputManager(engine);` on line 20 is replaced by the version above.)

- [ ] **Step 7: Verify the full suite + typecheck + build**

Run: `npm test`
Expected: all tests PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/ui/AnalysisOverlay.ts tests/ui/AnalysisOverlay.test.ts src/ui/hud.css src/main.ts
git commit -m "feat(ui): analysis progress overlay wired to file analysis" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 19: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests PASS — the prior 67 plus the new offline/provider/UI tests.

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed with no errors.

- [ ] **Step 3: Manual browser verification**

The dev server runs at `http://127.0.0.1:5173` (NOT `localhost`). Start it if needed: `npm run dev`.

Verify:
- Pick a local audio file (mp3/wav/m4a). The **progress overlay** appears (Decoding… → Analyzing… %) and playback starts only when it reaches ready.
- Drops land exactly on the music's slams; a **build-up glow swells in the seconds before each drop**.
- Motion is smooth — no stop-and-start jitter.
- The sensitivity slider still changes intensity for the file.
- Switch to **mic** or **tab/system audio**: behaves exactly as before (no overlay, real-time).
- (If available) try a FLAC the browser can't decode → it should fall back to real-time playback rather than dead-ending.

- [ ] **Step 4: Confirmation**

Confirm with the user that the analyzed-file behavior looks right before finishing the branch (`superpowers:finishing-a-development-branch`).

---

## Self-Review

**Spec coverage:**
- FeatureProvider seam → Tasks 12-14. LiveFeatureProvider extraction → Task 13. AnalyzedFeatureProvider → Task 14.
- STFT/FFT → Tasks 4-5. Per-frame loudness/bands/onset → Task 6. Global tempo → Task 7. DP beat grid → Task 8. Downbeats → Task 9. Look-ahead drops + anticipation → Task 10. Zero-phase smoothing → Task 3, applied in Task 11.
- AnalyzedTrack type → Task 1; orchestration → Task 11; worker → Task 15.
- AudioBufferSourceNode clock + decode + fallback → Task 16. Mono mixdown → Task 15.
- `anticipation` field → Task 2; Renderer build-up effect → Task 17.
- Web Worker + progress overlay → Tasks 15, 16, 18. Config constants → Task 1.
- Real-time fallback on decode/analysis failure → Task 16 (and its provider branch).
- All spec testing bullets map to the per-task tests; manual browser checks → Task 19.

**Placeholder scan:** none — every code/test step has complete content.

**Type consistency:** `AnalyzedTrack` (Task 1) stores `presence` (not `energy`); the provider (Task 14) derives `energy` and consumes `loudness/presence/bands/anticipation/beats/drops/tempoBpm` exactly as Task 11 produces them. `FeatureProvider` (Task 12) `sample()`/`setSensitivity?` matches both providers (Tasks 13-14) and `AudioEngine` (Task 13). `ProgressStage`/`ProgressFn` defined in Task 16 are imported by Tasks 18. `Stft`/`FeatureTimeline` shapes flow Tasks 5→6→11. `Drop` shape consistent Tasks 1, 10, 14.

**Out of scope (per spec):** Stage B segmentation, new downbeat-driven effects (downbeats stored only), scrubbing/seek, analysis caching, per-section tempo.
