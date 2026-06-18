# essentia.js Audio Analysis (tempo + beats + bands) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use essentia.js (WASM) in the analysis Web Worker for tempo, beats, and frequency bands — producing the same `AnalyzedTrack` — with our pure-DSP `analyzeTrack` as a fallback when the WASM can't load.

**Architecture:** The worker tries `analyzeTrackEssentia` (RhythmExtractor2013 for tempo/beats; per-frame Spectrum→FrequencyBands + RMS for bands/loudness; onset from band flux) and falls back to the pure `analyzeTrack` on any error. Both feed a shared pure `assembleTrack` (smoothing, presence, energy, downbeats, drops, anticipation). The `AnalyzedTrack` shape, provider, waveform, and visuals are unchanged.

**Tech Stack:** TypeScript, Vite, Vitest (jsdom, globals), Web Audio, Web Workers, essentia.js (AGPL-3.0, bundled). Spec: `docs/superpowers/specs/2026-06-18-essentia-audio-analysis-design.md`. Branch: `feature/offline-analysis-stage-a`.

**Conventions:** tests in `tests/` mirroring `src/`, `import { describe, it, expect } from 'vitest'`, deterministic synthetic signals (no `Math.random`). Single file: `npx vitest run <path>`. Full: `npm test`. Typecheck: `npx tsc --noEmit`. Build: `npm run build`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Stay on `feature/offline-analysis-stage-a`. **Never run `git checkout <sha>`/`git reset` — commit only with `git add`/`git commit` on the branch** (a prior subagent orphaned commits via detached HEAD).

---

## File Structure

**New:**
- `src/audio/offline/essentia.ts` — `getEssentia()` lazy WASM init (once per worker).
- `src/audio/offline/assembleTrack.ts` — pure `assembleTrack(raw): AnalyzedTrack` (smoothing/presence/energy/downbeats/drops/anticipation). Shared by both analyzers.
- `src/audio/offline/analyzeWithFallback.ts` — pure `analyzeWithFallback(channel, sr, essentiaFn, pureFn, onProgress?)`.
- `src/audio/offline/essentiaAnalyze.ts` — `analyzeTrackEssentia(...)` WASM analyzer.
- `src/types/essentia.d.ts` — module declaration if essentia.js ships no usable types (decided in Task 1).

**Modified:**
- `src/config.ts` — `ESSENTIA` block.
- `src/audio/offline/analyzeTrack.ts` — refactor to call `assembleTrack`.
- `src/audio/offline/worker.ts` — async; `analyzeWithFallback(essentia, pure)`.
- `package.json` — add `essentia.js`.
- `vite.config.ts` — WASM-in-worker config (per Task 1 spike).

---

## Task 1: Spike — essentia.js builds and runs in the worker

**Goal:** de-risk Vite/WASM and confirm the exact API/scale before building the integration. This task is a spike (no TDD); its deliverables are (a) a committed dependency + Vite config + `essentia.ts` loader that **builds**, and (b) a written **API-confirmation note** the later tasks rely on.

**Files:**
- Modify: `package.json`, `vite.config.ts`
- Create: `src/audio/offline/essentia.ts`, possibly `src/types/essentia.d.ts`
- Create (scratch, committed): `docs/superpowers/notes/essentia-api.md`

- [ ] **Step 1: Install the dependency**

Run: `npm install essentia.js`
Expected: `essentia.js` appears in `package.json` dependencies; `npm install` succeeds.

- [ ] **Step 2: Create the loader `src/audio/offline/essentia.ts`**

```ts
// essentia.js ships ES builds under dist/. The es-wasm export is a ready module object
// (per the docs' worklet example: `new Essentia(EssentiaWASM)`). If the installed build
// instead exposes EssentiaWASM as a promise/factory, switch getEssentia() to await it
// (see docs/superpowers/notes/essentia-api.md, confirmed in this task).
import Essentia from 'essentia.js/dist/essentia.js-core.es.js';
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js';

let instance: Essentia | undefined;

/** Lazily create the single Essentia instance for this worker. */
export function getEssentia(): Essentia {
  if (!instance) instance = new Essentia(EssentiaWASM);
  return instance;
}
```

If `tsc` complains there are no types for these import paths, create `src/types/essentia.d.ts`:

```ts
declare module 'essentia.js/dist/essentia.js-core.es.js' {
  export default class Essentia {
    constructor(wasm: unknown);
    version: string;
    algorithmNames: string;
    arrayToVector(arr: Float32Array): unknown;
    vectorToArray(vec: unknown): Float32Array;
    FrameGenerator(arr: Float32Array, frameSize: number, hopSize: number): { size(): number; get(i: number): unknown; delete(): void };
    Windowing(frame: unknown, ...args: unknown[]): { frame: unknown };
    Spectrum(frame: unknown, ...args: unknown[]): { spectrum: unknown };
    FrequencyBands(spectrum: unknown, frequencyBands?: unknown, sampleRate?: number): { bands: unknown };
    RMS(frame: unknown): { rms: number };
    RhythmExtractor2013(signal: unknown, maxTempo?: number, method?: string, minTempo?: number): { bpm: number; ticks: unknown; confidence: number; estimates: unknown; bpmIntervals: unknown };
    shutdown(): void;
    delete(): void;
  }
}
declare module 'essentia.js/dist/essentia-wasm.es.js' {
  export const EssentiaWASM: unknown;
}
```

- [ ] **Step 3: Make a temporary worker import to prove Vite bundles the WASM**

Temporarily add to the top of `src/audio/offline/worker.ts`:
```ts
import { getEssentia } from './essentia';
// TEMP spike: prove essentia loads + bundles in the worker
try { console.log('essentia version', getEssentia().version); } catch (e) { console.error('essentia load failed', e); }
```

Run: `npm run build`
Expected: build succeeds and a `.wasm` asset is emitted under `dist/assets/`. If it fails, add Vite config in `vite.config.ts` until it builds — typically:
```ts
export default defineConfig({
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  optimizeDeps: { exclude: ['essentia.js'] },
  worker: { format: 'es' },
});
```
(Keep the existing `server` block. Record the exact config that worked in the note.)

- [ ] **Step 4: Confirm the API + band scale in a real browser**

Run `npm run dev`. Open `http://127.0.0.1:5173`, load a real audio file, and in the console confirm:
- `getEssentia().version` prints (WASM loaded in the worker).
- `RhythmExtractor2013(arrayToVector(channelData))` returns an object with numeric `.bpm`, a `.ticks` vector (use `vectorToArray`), and `.confidence`. Note the **exact field names**.
- A single `FrameGenerator → Windowing → Spectrum → FrequencyBands(spectrum, arrayToVector([20, 150, 500, 2000, 8000]), sampleRate)` call returns `.bands`; log a few band-energy values to learn their **numeric scale** (energies are NOT 0..1) — record a sensible dB range to map them to 0..1 in Task 6.

(Use a temporary `console.log` hook in the worker or a throwaway page snippet; remove before committing.)

- [ ] **Step 5: Write the confirmation note**

Create `docs/superpowers/notes/essentia-api.md` recording: the working import paths, whether `getEssentia` is sync or must `await`, `RhythmExtractor2013` exact return fields, `FrequencyBands` parameter form + observed band-energy scale and the chosen dB→0..1 mapping range, and the exact Vite config used. Later tasks follow this note where it differs from the documented assumptions here.

- [ ] **Step 6: Remove the temporary spike code**

Remove the TEMP import/console.log from `worker.ts` (the real wiring comes in Task 7). Leave `essentia.ts`, the dep, the Vite config, and the note.

- [ ] **Step 7: Verify + commit**

Run: `npx tsc --noEmit` (clean), `npm test` (all still pass), `npm run build` (succeeds).
```bash
git add package.json package-lock.json vite.config.ts src/audio/offline/essentia.ts src/types/essentia.d.ts docs/superpowers/notes/essentia-api.md
git commit -m "feat(essentia): add essentia.js dep, worker WASM loader, and Vite bundling (spike-confirmed)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**If the spike reveals the API/types differ materially from the assumptions in later tasks, report it (DONE_WITH_CONCERNS) with the corrected facts so the later task code is adjusted.**

---

## Task 2: `ESSENTIA` config block

**Files:** Modify `src/config.ts` (append at end)

- [ ] **Step 1: Append the block**

```ts
/**
 * essentia.js analysis tuning. `rhythmMethod` is RhythmExtractor2013's method
 * ('multifeature' = most accurate, offline). Band energies from FrequencyBands are mapped
 * to 0..1 via a dB window (range confirmed in the spike note) so AnalyzedTrack bands stay
 * consistent with the pure path.
 */
export const ESSENTIA = {
  rhythmMethod: 'multifeature',
  bandMinDb: -60,   // FrequencyBands energy (dB) mapped to 0 (tune per docs/superpowers/notes/essentia-api.md)
  bandMaxDb: 0,     // ...and to 1
};
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit` (clean).
```bash
git add src/config.ts
git commit -m "feat(essentia): ESSENTIA config block" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `assembleTrack` — shared pure assembly (TDD)

**Files:** Create `src/audio/offline/assembleTrack.ts`; Test `tests/audio/offline/assembleTrack.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { assembleTrack } from '../../../src/audio/offline/assembleTrack';

function ramp(n: number, fn: (i: number) => number): Float32Array {
  const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = fn(i); return a;
}

describe('assembleTrack', () => {
  it('assembles a full AnalyzedTrack from raw channels + beats', () => {
    const frameRate = 100, n = 400;
    const t = assembleTrack({
      duration: 4, sampleRate: 44100, frameRate, tempoBpm: 120,
      loudness: ramp(n, () => 0.5),
      bass: ramp(n, (i) => (i % 50 === 0 ? 1 : 0)),
      lowMid: ramp(n, () => 0.1), mid: ramp(n, () => 0.1), high: ramp(n, () => 0.1),
      onset: ramp(n, (i) => (i % 50 === 0 ? 1 : 0)),
      beats: Float32Array.from([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]),
    });
    expect(t.tempoBpm).toBe(120);
    expect(t.duration).toBe(4);
    expect(t.beats.length).toBe(8);
    // all continuous channels share the frame count
    for (const ch of [t.loudness, t.presence, t.bass, t.lowMid, t.mid, t.high, t.onset, t.anticipation]) {
      expect(ch.length).toBe(n);
    }
    // downbeats are a subset of the beat grid
    expect(t.downbeats.length).toBeGreaterThan(0);
    for (const d of t.downbeats) expect(Array.from(t.beats)).toContain(d);
    // energy is derived (present + loud -> > 0)
    expect(t.energy[200]).toBeGreaterThan(0);
  });

  it('produces zero-phase-smoothed channels (no NaN, within 0..max)', () => {
    const n = 100;
    const t = assembleTrack({
      duration: 1, sampleRate: 44100, frameRate: 100, tempoBpm: 0,
      loudness: ramp(n, () => 0.3), bass: ramp(n, () => 0.2),
      lowMid: ramp(n, () => 0), mid: ramp(n, () => 0), high: ramp(n, () => 0),
      onset: ramp(n, () => 0), beats: Float32Array.from([]),
    });
    for (const v of t.bass) { expect(Number.isFinite(v)).toBe(true); }
    expect(t.downbeats.length).toBe(0); // no beats -> no downbeats
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/audio/offline/assembleTrack.test.ts`
Expected: FAIL (import unresolved).

- [ ] **Step 3: Implement `src/audio/offline/assembleTrack.ts`**

```ts
import { ENERGY, OFFLINE } from '../../config';
import { smoothZeroPhase } from './smooth';
import { findDownbeats } from './downbeats';
import { findDrops } from './drops';
import type { AnalyzedTrack } from './types';

/** Raw per-frame channels + beat grid produced by an analyzer (essentia or pure DSP). */
export interface RawTrack {
  duration: number;
  sampleRate: number;
  frameRate: number;
  tempoBpm: number;
  loudness: Float32Array;
  bass: Float32Array;
  lowMid: Float32Array;
  mid: Float32Array;
  high: Float32Array;
  onset: Float32Array;     // 0..1
  beats: Float32Array;     // seconds
}

/**
 * Shared, pure assembly: smooth the channels (zero-phase), derive presence + internal
 * energy, infer 4/4 downbeats on the beat grid, detect drops + the anticipation ramp, and
 * package the AnalyzedTrack. Used by both the essentia and pure-DSP analyzers.
 */
export function assembleTrack(raw: RawTrack): AnalyzedTrack {
  const a = OFFLINE.smoothAlpha;
  const loudness = smoothZeroPhase(raw.loudness, a);
  const bass = smoothZeroPhase(raw.bass, a);
  const lowMid = smoothZeroPhase(raw.lowMid, a);
  const mid = smoothZeroPhase(raw.mid, a);
  const high = smoothZeroPhase(raw.high, a);
  const onset = raw.onset;

  const n = loudness.length;
  const presenceRaw = new Float32Array(n);
  for (let i = 0; i < n; i++) presenceRaw[i] = loudness[i] > OFFLINE.presenceFloor ? 1 : 0;
  const presence = smoothZeroPhase(presenceRaw, a);

  const energy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const intensity = Math.pow(Math.min(1, loudness[i] / ENERGY.fullScale), ENERGY.dynamicsGamma);
    energy[i] = presence[i] * intensity;
  }

  const downbeats = findDownbeats(raw.beats, onset, raw.frameRate);
  const { drops, anticipation } = findDrops(energy, bass, downbeats, raw.frameRate);

  return {
    duration: raw.duration,
    sampleRate: raw.sampleRate,
    frameRate: raw.frameRate,
    tempoBpm: raw.tempoBpm,
    loudness, presence, bass, lowMid, mid, high, onset, anticipation,
    beats: raw.beats, downbeats, drops,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio/offline/assembleTrack.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/offline/assembleTrack.ts tests/audio/offline/assembleTrack.test.ts
git commit -m "feat(offline): shared pure assembleTrack (smoothing/presence/energy/downbeats/drops)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Refactor `analyzeTrack` to use `assembleTrack`

**Files:** Modify `src/audio/offline/analyzeTrack.ts` (full replace)

No new test — the existing `tests/audio/offline/analyzeTrack.test.ts` guards this behavior-preserving refactor.

- [ ] **Step 1: Replace `src/audio/offline/analyzeTrack.ts`**

```ts
import { FFT_SIZE, OFFLINE } from '../../config';
import { computeStft } from './stft';
import { computeFeatureTimeline } from './featureTimeline';
import { globalTempo } from './tempoGlobal';
import { trackBeats } from './beatGrid';
import { assembleTrack } from './assembleTrack';
import type { AnalyzedTrack } from './types';

/**
 * Pure-DSP offline analysis (the fallback when essentia.js is unavailable). Computes the
 * STFT feature timeline, tempo (autocorrelation), and beat grid (DP), then hands the raw
 * channels + beats to the shared assembleTrack.
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
  onProgress?.(0.65);

  const tempoBpm = globalTempo(tl.onset, frameRate);
  const beats = trackBeats(tl.onset, frameRate, tempoBpm);
  onProgress?.(0.85);

  const track = assembleTrack({
    duration: channel.length / sampleRate,
    sampleRate,
    frameRate,
    tempoBpm,
    loudness: tl.loudness,
    bass: tl.bass,
    lowMid: tl.lowMid,
    mid: tl.mid,
    high: tl.high,
    onset: tl.onset,
    beats,
  });
  onProgress?.(1);
  return track;
}
```

- [ ] **Step 2: Verify the existing tests still pass**

Run: `npx vitest run tests/audio/offline/analyzeTrack.test.ts`
Expected: PASS (the tempo-recovery + channel-consistency + progress tests are unchanged).

Run: `npm test` and `npx tsc --noEmit`
Expected: all pass, clean.

- [ ] **Step 3: Commit**

```bash
git add src/audio/offline/analyzeTrack.ts
git commit -m "refactor(offline): analyzeTrack builds raw channels then uses shared assembleTrack" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `analyzeWithFallback` — pure dispatch (TDD)

**Files:** Create `src/audio/offline/analyzeWithFallback.ts`; Test `tests/audio/offline/analyzeWithFallback.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { analyzeWithFallback } from '../../../src/audio/offline/analyzeWithFallback';
import type { AnalyzedTrack } from '../../../src/audio/offline/types';

const fakeTrack = (tag: number): AnalyzedTrack => ({
  duration: 1, sampleRate: 44100, frameRate: 100, tempoBpm: tag,
  loudness: new Float32Array(1), presence: new Float32Array(1),
  bass: new Float32Array(1), lowMid: new Float32Array(1), mid: new Float32Array(1), high: new Float32Array(1),
  onset: new Float32Array(1), anticipation: new Float32Array(1),
  beats: new Float32Array(0), downbeats: new Float32Array(0), drops: [],
});

describe('analyzeWithFallback', () => {
  it('uses the essentia result when it succeeds', async () => {
    const t = await analyzeWithFallback(new Float32Array(10), 44100,
      async () => fakeTrack(1), () => fakeTrack(2));
    expect(t.tempoBpm).toBe(1);
  });

  it('falls back to the pure analyzer when essentia throws', async () => {
    const t = await analyzeWithFallback(new Float32Array(10), 44100,
      async () => { throw new Error('wasm boom'); }, () => fakeTrack(2));
    expect(t.tempoBpm).toBe(2);
  });

  it('passes through progress and forwards args', async () => {
    let seen = 0;
    await analyzeWithFallback(new Float32Array(10), 48000,
      async (_c, sr, p) => { p?.(1); expect(sr).toBe(48000); return fakeTrack(sr); },
      () => fakeTrack(0), (pct) => { seen = pct; });
    expect(seen).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/audio/offline/analyzeWithFallback.test.ts`
Expected: FAIL (import unresolved).

- [ ] **Step 3: Implement `src/audio/offline/analyzeWithFallback.ts`**

```ts
import type { AnalyzedTrack } from './types';

export type ProgressCb = (pct: number) => void;
export type EssentiaFn = (channel: Float32Array, sampleRate: number, onProgress?: ProgressCb) => Promise<AnalyzedTrack>;
export type PureFn = (channel: Float32Array, sampleRate: number, onProgress?: ProgressCb) => AnalyzedTrack;

/**
 * Run the essentia analyzer; on ANY error fall back to the pure-DSP analyzer. Keeps file
 * analysis working even if the WASM can't load or throws.
 */
export async function analyzeWithFallback(
  channel: Float32Array,
  sampleRate: number,
  essentiaFn: EssentiaFn,
  pureFn: PureFn,
  onProgress?: ProgressCb,
): Promise<AnalyzedTrack> {
  try {
    return await essentiaFn(channel, sampleRate, onProgress);
  } catch {
    return pureFn(channel, sampleRate, onProgress);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio/offline/analyzeWithFallback.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/offline/analyzeWithFallback.ts tests/audio/offline/analyzeWithFallback.test.ts
git commit -m "feat(offline): analyzeWithFallback dispatch (essentia -> pure DSP on error)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `essentiaAnalyze` — the WASM analyzer

**Files:** Create `src/audio/offline/essentiaAnalyze.ts`

No unit test (needs WASM); verified via `tsc` + build + the Task 8 browser check. **Follow `docs/superpowers/notes/essentia-api.md` from Task 1 where exact field names / band scale / sync-vs-async differ from the code below.**

- [ ] **Step 1: Implement `src/audio/offline/essentiaAnalyze.ts`**

```ts
import { FFT_SIZE, OFFLINE, BAND_EDGES, ESSENTIA } from '../../config';
import { getEssentia } from './essentia';
import { assembleTrack } from './assembleTrack';
import type { AnalyzedTrack } from './types';

/** Map a FrequencyBands energy to 0..1 via a dB window (range tuned in the spike note). */
function bandLevel(energy: number): number {
  const db = 10 * Math.log10(energy + 1e-12);
  const v = (db - ESSENTIA.bandMinDb) / (ESSENTIA.bandMaxDb - ESSENTIA.bandMinDb);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * essentia.js offline analyzer: RhythmExtractor2013 for tempo + beats, and a per-frame
 * Spectrum -> FrequencyBands + RMS loop for bands + loudness; onset is derived from band
 * flux. Raw channels + beats go to the shared assembleTrack. All essentia vectors are
 * freed immediately to keep the WASM heap flat on long tracks.
 */
export async function analyzeTrackEssentia(
  channel: Float32Array,
  sampleRate: number,
  onProgress?: (pct: number) => void,
): Promise<AnalyzedTrack> {
  const essentia = getEssentia();
  const hop = OFFLINE.hop;
  const frameRate = sampleRate / hop;

  // --- tempo + beats (whole signal) ---
  const sigVec = essentia.arrayToVector(channel);
  const rhythm = essentia.RhythmExtractor2013(sigVec, 208, ESSENTIA.rhythmMethod, 40);
  const tempoBpm = rhythm.bpm;
  const beats = Float32Array.from(essentia.vectorToArray(rhythm.ticks));
  // free rhythm vector outputs
  (rhythm.ticks as { delete(): void }).delete();
  (rhythm.estimates as { delete(): void }).delete();
  (rhythm.bpmIntervals as { delete(): void }).delete();
  onProgress?.(0.6);

  // --- per-frame bands + loudness + onset ---
  const frames = essentia.FrameGenerator(channel, FFT_SIZE, hop);
  const nFrames = frames.size();
  const loudness = new Float32Array(nFrames);
  const bass = new Float32Array(nFrames);
  const lowMid = new Float32Array(nFrames);
  const mid = new Float32Array(nFrames);
  const high = new Float32Array(nFrames);
  const rawFlux = new Float32Array(nFrames);

  // FrequencyBands edges: [20, bassMax, lowMidMax, midMax, highMax] -> 4 bands
  const edgeVec = essentia.arrayToVector(
    Float32Array.from([20, BAND_EDGES.bassMax, BAND_EDGES.lowMidMax, BAND_EDGES.midMax, BAND_EDGES.highMax]),
  );
  let prev: number[] | null = null;

  for (let i = 0; i < nFrames; i++) {
    const frame = frames.get(i);
    const win = essentia.Windowing(frame);
    const spec = essentia.Spectrum(win.frame);
    const fb = essentia.FrequencyBands(spec.spectrum, edgeVec, sampleRate);
    const bandsArr = essentia.vectorToArray(fb.bands);
    const rms = essentia.RMS(frame);

    loudness[i] = rms.rms;
    const lv = [bandLevel(bandsArr[0]), bandLevel(bandsArr[1]), bandLevel(bandsArr[2]), bandLevel(bandsArr[3])];
    bass[i] = lv[0]; lowMid[i] = lv[1]; mid[i] = lv[2]; high[i] = lv[3];
    if (prev) { let f = 0; for (let k = 0; k < 4; k++) { const d = lv[k] - prev[k]; if (d > 0) f += d; } rawFlux[i] = f; }
    prev = lv;

    // free per-frame vectors
    (win.frame as { delete(): void }).delete();
    (spec.spectrum as { delete(): void }).delete();
    (fb.bands as { delete(): void }).delete();
    (frame as { delete(): void }).delete();

    if ((i & 255) === 0) onProgress?.(0.6 + 0.35 * (i / nFrames));
  }

  // normalize onset 0..1
  let maxFlux = 1e-9; for (let i = 0; i < nFrames; i++) if (rawFlux[i] > maxFlux) maxFlux = rawFlux[i];
  const onset = new Float32Array(nFrames); for (let i = 0; i < nFrames; i++) onset[i] = rawFlux[i] / maxFlux;

  // free remaining vectors
  edgeVec.delete();
  sigVec.delete();
  (frames as { delete(): void }).delete();
  onProgress?.(1);

  return assembleTrack({
    duration: channel.length / sampleRate,
    sampleRate, frameRate, tempoBpm,
    loudness, bass, lowMid, mid, high, onset, beats,
  });
}
```

- [ ] **Step 2: Verify typecheck + build**

Run: `npx tsc --noEmit` (clean — adjust the `essentia.d.ts` declaration if needed for the calls used here).
Run: `npm run build` (succeeds; wasm still emitted).

- [ ] **Step 3: Commit**

```bash
git add src/audio/offline/essentiaAnalyze.ts src/types/essentia.d.ts
git commit -m "feat(essentia): WASM analyzer (RhythmExtractor2013 + FrequencyBands -> AnalyzedTrack)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Wire the worker to use essentia with fallback

**Files:** Modify `src/audio/offline/worker.ts` (full replace)

- [ ] **Step 1: Replace `src/audio/offline/worker.ts`**

```ts
import { analyzeTrack } from './analyzeTrack';
import { analyzeTrackEssentia } from './essentiaAnalyze';
import { analyzeWithFallback } from './analyzeWithFallback';

/**
 * Thin Web Worker entry. Tries the essentia.js analyzer; on any failure (WASM load/throw)
 * falls back to the pure-DSP analyzeTrack. Posts progress then the finished AnalyzedTrack.
 */
self.onmessage = async (e: MessageEvent) => {
  const { channel, sampleRate } = e.data as { channel: Float32Array; sampleRate: number };
  try {
    const track = await analyzeWithFallback(
      channel, sampleRate, analyzeTrackEssentia, analyzeTrack,
      (pct) => (self as unknown as Worker).postMessage({ type: 'progress', pct }),
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

- [ ] **Step 2: Verify typecheck + build + suite**

Run: `npx tsc --noEmit` (clean), `npm test` (all pass), `npm run build` (succeeds, wasm emitted).

- [ ] **Step 3: Commit**

```bash
git add src/audio/offline/worker.ts
git commit -m "feat(essentia): worker uses essentia analyzer with pure-DSP fallback" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite + typecheck + build**

Run: `npm test` (all pass — pure-DSP, assembleTrack, analyzeWithFallback, providers, UI).
Run: `npx tsc --noEmit && npm run build` (both succeed; `.wasm` emitted).

- [ ] **Step 2: Browser verification (essentia path)**

Dev server at `http://127.0.0.1:5173` (NOT localhost). Load a real track and confirm:
- The waveform shows balanced red/green/blue bands (unchanged from the band fix).
- The beat/downbeat grid and drops look in time with the music (essentia tempo).
- Optionally read the worker's result (instrument briefly): `tempoBpm` is plausible for the track and `beats.length` is reasonable; compare against the track's known BPM if you have it.

- [ ] **Step 3: Browser verification (fallback path)**

Temporarily force essentia to fail (e.g., in `essentiaAnalyze` throw at the top, or rename the import) and confirm analysis still completes via the pure DSP (waveform + playback still work). Revert the temporary change afterward.

- [ ] **Step 4: Confirm with the user** before finishing the branch.

---

## Self-Review

**Spec coverage:**
- Worker dispatch + fallback → Tasks 5, 7. essentia tempo/beats (RhythmExtractor2013) + per-frame bands/onset/loudness → Task 6. Reused pure helpers via shared `assembleTrack` → Tasks 3, 4, 6. Same `AnalyzedTrack` → Tasks 3/6 return it; provider/waveform/visuals untouched. npm + Vite-bundled WASM, memory management, `ESSENTIA` config → Tasks 1, 2, 6. Build spike de-risk → Task 1. Testing (assembleTrack, fallback, browser) → Tasks 3, 5, 8.
- Deviation from spec: onset is derived from FrequencyBands flux rather than essentia `OnsetDetection` (which needs the complex spectrum's phase). Simpler, no extra WASM calls, and onset only feeds 4/4 downbeat inference + the provider's no-grid fallback. Noted here intentionally.

**Placeholder scan:** none — every step has complete code/commands. Task 1 is a spike whose specifics (exact field names, band dB range, Vite config) are intentionally confirmed at run time and recorded in the note; later tasks reference it.

**Type consistency:** `RawTrack` (Task 3) is consumed by Task 4 and Task 6 with identical field names. `AnalyzedTrack` shape unchanged. `getEssentia()` (Task 1) used in Task 6. `analyzeWithFallback(channel, sr, essentiaFn, pureFn, onProgress)` (Task 5) matches the worker call (Task 7) with `analyzeTrackEssentia`/`analyzeTrack`. `ESSENTIA` fields (Task 2) used in Task 6.

**Out of scope (per spec):** loudness/presence/energy/drops kept ours; no ML models/key; AnalyzedTrack/provider/waveform/visuals unchanged; no auto-fallback on low confidence (only on WASM failure); live path unchanged.
