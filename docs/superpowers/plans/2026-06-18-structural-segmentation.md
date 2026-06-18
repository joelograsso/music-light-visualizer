# Structural Segmentation (Stage B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect a song's structural boundaries + per-section intensity tiers offline (beat-synchronous MFCC self-similarity → novelty), store them on `AnalyzedTrack`, and drive scene changes on real boundaries plus a gentle section-intensity effect multiplier — file-only, live unchanged.

**Architecture:** A pure `detectSections(beatFeatures, beats, loudness, frameRate)` (self-similarity matrix → checkerboard novelty → peak-picked boundaries → relative loudness tiers) runs inside the shared `assembleTrack`. `essentiaAnalyze` feeds per-beat MFCC; the pure-DSP path feeds per-beat bands. `AnalyzedFeatureProvider` exposes per-frame `sectionActive`/`sectionBoundary`/`sectionIntensity`; `SceneController` advances on boundaries (drop+timer fallback when inactive) and `Renderer` applies the intensity multiplier.

**Tech Stack:** TypeScript, Vite, Vitest (jsdom, globals), essentia.js (MFCC), Canvas 2D. Spec: `docs/superpowers/specs/2026-06-18-structural-segmentation-design.md`. Branch: `feature/structural-segmentation` (off main).

**Conventions:** tests in `tests/` mirroring `src/`; `import { describe, it, expect } from 'vitest'`; deterministic synthetic data (no `Math.random`). Single file: `npx vitest run <path>`. Full: `npm test`. Typecheck: `npx tsc --noEmit`. Build: `npm run build`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Stay on `feature/structural-segmentation`; NEVER `git checkout <sha>`/`git reset` (only `git add`/`git commit`).

**essentia MFCC (confirmed in Node):** `essentia.MFCC(spectrum)` returns `{ bands, mfcc }`; `mfcc` has 13 coefficients. Skip coefficient 0 (energy) → use coeffs 1..12 for timbral similarity. Free both `mfcc` and `bands` vectors each frame.

---

## File Structure

**New:** `src/audio/offline/segmentation.ts` — pure: `beatSyncFeatures`, `cosineSimilarity`, `noveltyCurve`, `pickPeaks`, `detectSections`.

**Modified:**
- `src/config.ts` — `SEGMENT` block.
- `src/audio/offline/types.ts` — `Section`, `SectionTier`, `AnalyzedTrack.sections`.
- `src/types.ts` — `AudioFeatures` gains `sectionActive`/`sectionBoundary`/`sectionIntensity`.
- `src/audio/AudioEngine.ts` (`SILENT`), `src/audio/FeatureExtractor.ts` (live defaults).
- `src/audio/offline/assembleTrack.ts` — optional `beatFeatures` → `detectSections`.
- `src/audio/offline/essentiaAnalyze.ts` — per-beat MFCC.
- `src/audio/offline/analyzeTrack.ts` — per-beat bands.
- `src/audio/providers/AnalyzedFeatureProvider.ts` — compute section fields.
- `src/visual/SceneController.ts` — boundary-driven advance + live fallback.
- `src/visual/Renderer.ts` — pass features to SceneController + intensity multiplier.

---

## Task 1: Types, config, and neutral `AudioFeatures` defaults

**Files:** Modify `src/config.ts`, `src/audio/offline/types.ts`, `src/types.ts`, `src/audio/AudioEngine.ts`, `src/audio/FeatureExtractor.ts`, `src/audio/providers/AnalyzedFeatureProvider.ts`

Adds the new fields everywhere with neutral defaults so the suite + tsc stay green; real values come in later tasks.

- [ ] **Step 1: Append `SEGMENT` to `src/config.ts`**

```ts
/**
 * Structural segmentation (Stage B, local files only). Beat-synchronous MFCC self-similarity
 * → checkerboard novelty → boundary peaks; per-section intensity tier from relative loudness.
 * See docs/superpowers/specs/2026-06-18-structural-segmentation-design.md
 */
export const SEGMENT = {
  kernelBeats: 16,       // checkerboard novelty kernel half-size is kernelBeats/2 (beats)
  minSectionBars: 4,     // minimum section length (bars) when picking boundary peaks
  peakThreshold: 1.5,    // a novelty peak must exceed the mean novelty * this
  intensityFloor: 0.6,   // section-intensity effect multiplier floor (1 = no effect)
};
```

- [ ] **Step 2: Add section types to `src/audio/offline/types.ts`**

Add (before `AnalyzedTrack`):

```ts
export type SectionTier = 'calm' | 'building' | 'intense' | 'peak';
/** A detected structural segment (times in seconds). */
export interface Section {
  start: number;
  end: number;
  intensity: number;   // 0..1, relative loudness across the track
  tier: SectionTier;
}
```

And add to the `AnalyzedTrack` interface (after `drops`):

```ts
  sections: Section[];
```

- [ ] **Step 3: Add fields to `AudioFeatures` in `src/types.ts`**

Add after `anticipation`:

```ts
  sectionActive: boolean;  // true when an analyzed track exposes sections (file only)
  sectionBoundary: number; // 1 on the frame the playhead crosses into a new section, else 0
  sectionIntensity: number;// 0..1 current section intensity; 1 (neutral) when no sections
```

- [ ] **Step 4: Neutral defaults in the live/silent producers**

`src/audio/AudioEngine.ts` — `SILENT` last line becomes:
```ts
  beatPhase: 0, beatConfidence: 0, anticipation: 0,
  sectionActive: false, sectionBoundary: 0, sectionIntensity: 1,
```

`src/audio/FeatureExtractor.ts` — the `process()` return's last line becomes:
```ts
      beatPhase, beatConfidence, anticipation: 0,
      sectionActive: false, sectionBoundary: 0, sectionIntensity: 1,
```

`src/audio/providers/AnalyzedFeatureProvider.ts` — in the returned object of `sample()`, add (neutral for now; Task 7 computes real values):
```ts
      sectionActive: false, sectionBoundary: 0, sectionIntensity: 1,
```
(Add these to the existing `return { ... }` object alongside `anticipation`.)

- [ ] **Step 5: Verify + commit**

Run: `npx tsc --noEmit` (clean — the two `tests/ui/*` helpers cast `as AudioFeatures`, so they need no change).
Run: `npm test` (all pass).
```bash
git add src/config.ts src/audio/offline/types.ts src/types.ts src/audio/AudioEngine.ts src/audio/FeatureExtractor.ts src/audio/providers/AnalyzedFeatureProvider.ts
git commit -m "feat(segment): section types, SEGMENT config, neutral AudioFeatures defaults" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `segmentation.ts` — SSM / novelty / peaks / beat-sync (TDD)

**Files:** Create `src/audio/offline/segmentation.ts`; Test `tests/audio/offline/segmentation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { cosineSimilarity, beatSyncFeatures, noveltyCurve, pickPeaks } from '../../../src/audio/offline/segmentation';

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors and ~0 for orthogonal', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
  it('is 0 when either vector is all zeros', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('beatSyncFeatures', () => {
  it('averages per-frame vectors within each beat interval', () => {
    // frameRate 1; frames: [1],[1],[2],[2],[9]; beats at 0,2,4
    const byFrame = [[1], [1], [2], [2], [9]];
    const beats = Float32Array.from([0, 2, 4]);
    const out = beatSyncFeatures(byFrame, 1, beats);
    expect(out.length).toBe(2);          // one vector per beat interval
    expect(out[0][0]).toBeCloseTo(1, 6); // frames 0..1
    expect(out[1][0]).toBeCloseTo(2, 6); // frames 2..3
  });
});

describe('noveltyCurve + pickPeaks', () => {
  it('peaks at a block change and pickPeaks finds it', () => {
    // 40 beats: first 20 = vector A, next 20 = vector B (orthogonal)
    const feats: number[][] = [];
    for (let i = 0; i < 40; i++) feats.push(i < 20 ? [1, 0] : [0, 1]);
    const nov = noveltyCurve(feats, 16);
    expect(nov.length).toBe(40);
    // the strongest novelty is near the block boundary (beat 20)
    let arg = 0; for (let i = 1; i < nov.length; i++) if (nov[i] > nov[arg]) arg = i;
    expect(Math.abs(arg - 20)).toBeLessThanOrEqual(2);
    const peaks = pickPeaks(nov, 4, 1.5);
    expect(peaks.some((p) => Math.abs(p - 20) <= 2)).toBe(true);
  });

  it('finds no interior peaks in a uniform sequence', () => {
    const feats: number[][] = [];
    for (let i = 0; i < 40; i++) feats.push([1, 1]);
    const peaks = pickPeaks(noveltyCurve(feats, 16), 4, 1.5);
    expect(peaks.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/audio/offline/segmentation.test.ts`
Expected: FAIL (import unresolved).

- [ ] **Step 3: Implement (part 1 — helpers) in `src/audio/offline/segmentation.ts`**

```ts
/** Cosine similarity of two equal-length vectors; 0 if either is all-zero. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Average per-frame feature vectors into one vector per beat interval [beats[i], beats[i+1]). */
export function beatSyncFeatures(byFrame: number[][], frameRate: number, beats: Float32Array): number[][] {
  const out: number[][] = [];
  const dim = byFrame.length > 0 ? byFrame[0].length : 0;
  for (let i = 0; i + 1 < beats.length; i++) {
    const f0 = Math.max(0, Math.round(beats[i] * frameRate));
    const f1 = Math.min(byFrame.length, Math.round(beats[i + 1] * frameRate));
    const v = new Array<number>(dim).fill(0);
    let count = 0;
    for (let f = f0; f < f1; f++) { const row = byFrame[f]; for (let k = 0; k < dim; k++) v[k] += row[k]; count++; }
    if (count > 0) for (let k = 0; k < dim; k++) v[k] /= count;
    out.push(v);
  }
  return out;
}

/**
 * Foote novelty over a self-similarity matrix built from beat features. A Gaussian-tapered
 * checkerboard kernel of half-size L (= kernelBeats/2) is correlated along the SSM diagonal;
 * high values mark where the song's texture changes. Returns one value per beat feature.
 */
export function noveltyCurve(beatFeatures: number[][], kernelBeats: number): Float32Array {
  const n = beatFeatures.length;
  const nov = new Float32Array(n);
  if (n === 0) return nov;
  const L = Math.max(1, Math.floor(kernelBeats / 2));
  // precompute kernel weights: sign checkerboard * radial gaussian
  const sigma = L / 2 || 1;
  const sim = (i: number, j: number) => cosineSimilarity(beatFeatures[i], beatFeatures[j]);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let a = -L; a < L; a++) {
      const ia = i + a;
      if (ia < 0 || ia >= n) continue;
      for (let b = -L; b < L; b++) {
        const jb = i + b;
        if (jb < 0 || jb >= n) continue;
        const sign = ((a < 0) === (b < 0)) ? 1 : -1;
        const w = Math.exp(-(a * a + b * b) / (2 * sigma * sigma));
        acc += sign * w * sim(ia, jb);
      }
    }
    nov[i] = acc;
  }
  return nov;
}

/** Pick novelty peaks: local maxima within ±minDistance that exceed mean(novelty) * threshold. */
export function pickPeaks(novelty: Float32Array, minDistance: number, threshold: number): number[] {
  const n = novelty.length;
  if (n === 0) return [];
  let mean = 0; for (let i = 0; i < n; i++) mean += novelty[i]; mean /= n;
  const cut = mean * threshold;
  const peaks: number[] = [];
  let last = -Infinity;
  for (let i = 1; i < n - 1; i++) {
    if (novelty[i] <= cut) continue;
    let isMax = true;
    const lo = Math.max(0, i - minDistance), hi = Math.min(n - 1, i + minDistance);
    for (let j = lo; j <= hi; j++) if (novelty[j] > novelty[i]) { isMax = false; break; }
    if (isMax && i - last >= minDistance) { peaks.push(i); last = i; }
  }
  return peaks;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio/offline/segmentation.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/offline/segmentation.ts tests/audio/offline/segmentation.test.ts
git commit -m "feat(segment): SSM cosine, beat-sync, checkerboard novelty, peak picking" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `detectSections` (TDD)

**Files:** Modify `src/audio/offline/segmentation.ts`; Test `tests/audio/offline/detectSections.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { detectSections } from '../../../src/audio/offline/segmentation';

// 40 beats at 0.5s spacing (120 BPM); first 20 timbre A + quiet, next 20 timbre B + loud.
function setup() {
  const beats = new Float32Array(41);
  for (let i = 0; i < 41; i++) beats[i] = i * 0.5;
  const feats: number[][] = [];
  for (let i = 0; i < 40; i++) feats.push(i < 20 ? [1, 0] : [0, 1]);
  const frameRate = 100;
  const loudness = new Float32Array(Math.round(40 * 0.5 * frameRate) + frameRate);
  for (let f = 0; f < loudness.length; f++) loudness[f] = (f / frameRate) < 10 ? 0.1 : 0.6; // quiet then loud at t=10s (beat 20)
  return { beats, feats, loudness, frameRate };
}

describe('detectSections', () => {
  it('splits a two-block song at the boundary with differing tiers', () => {
    const { beats, feats, loudness, frameRate } = setup();
    const secs = detectSections(feats, beats, loudness, frameRate);
    expect(secs.length).toBe(2);
    expect(secs[0].start).toBeCloseTo(0, 3);
    expect(Math.abs(secs[0].end - 10)).toBeLessThanOrEqual(1.5); // boundary near t=10s
    expect(secs[1].intensity).toBeGreaterThan(secs[0].intensity); // 2nd block louder
  });

  it('returns one section when the song is uniform', () => {
    const { beats, frameRate } = setup();
    const feats: number[][] = []; for (let i = 0; i < 40; i++) feats.push([1, 1]);
    const loudness = new Float32Array(2200).fill(0.3);
    const secs = detectSections(feats, beats, loudness, frameRate);
    expect(secs.length).toBe(1);
    expect(secs[0].start).toBeCloseTo(0, 3);
  });

  it('returns [] for empty features', () => {
    expect(detectSections([], new Float32Array([0]), new Float32Array(10), 100).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/audio/offline/detectSections.test.ts`
Expected: FAIL (`detectSections` not exported).

- [ ] **Step 3: Append `detectSections` to `src/audio/offline/segmentation.ts`**

```ts
import { SEGMENT } from '../config';
import type { Section, SectionTier } from './types';

function tierOf(intensity: number, rising: boolean): SectionTier {
  if (rising && intensity < 0.66) return 'building';
  if (intensity < 0.33) return 'calm';
  if (intensity < 0.66) return 'intense';
  return 'peak';
}

/** Mean of a channel over [t0, t1) seconds. */
function meanOver(ch: Float32Array, t0: number, t1: number, frameRate: number): number {
  const a = Math.max(0, Math.round(t0 * frameRate));
  const b = Math.min(ch.length, Math.round(t1 * frameRate));
  if (b <= a) return 0;
  let s = 0; for (let i = a; i < b; i++) s += ch[i];
  return s / (b - a);
}

/**
 * Detect structural sections from beat-synchronous features + the loudness channel. Builds
 * the novelty curve, picks boundaries (min length minSectionBars bars), then tags each
 * segment with a relative-loudness intensity (0..1) and tier. Returns [] if there aren't
 * enough beats to be meaningful. `beatsPerBar` defaults to 4.
 */
export function detectSections(
  beatFeatures: number[][],
  beats: Float32Array,
  loudness: Float32Array,
  frameRate: number,
  beatsPerBar = 4,
): Section[] {
  const n = beatFeatures.length;
  const duration = beats.length > 0 ? beats[beats.length - 1] : 0;
  if (n < SEGMENT.kernelBeats || duration <= 0) return [];

  const nov = noveltyCurve(beatFeatures, SEGMENT.kernelBeats);
  const minDist = Math.max(1, SEGMENT.minSectionBars * beatsPerBar);
  const peakBeats = pickPeaks(nov, minDist, SEGMENT.peakThreshold);

  // boundary times (seconds) = start (0) + each peak beat's time + end (track duration)
  const bounds = [0];
  for (const p of peakBeats) if (p < beats.length) bounds.push(beats[p]);
  bounds.push(duration);

  // build segments, compute relative intensity from segment mean loudness
  const raw: { start: number; end: number; mean: number; rising: boolean }[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const start = bounds[i], end = bounds[i + 1];
    const mean = meanOver(loudness, start, end, frameRate);
    const firstHalf = meanOver(loudness, start, (start + end) / 2, frameRate);
    const secondHalf = meanOver(loudness, (start + end) / 2, end, frameRate);
    raw.push({ start, end, mean, rising: secondHalf > firstHalf * 1.2 });
  }
  let lo = Infinity, hi = -Infinity;
  for (const r of raw) { if (r.mean < lo) lo = r.mean; if (r.mean > hi) hi = r.mean; }
  const span = hi - lo;
  return raw.map((r) => {
    const intensity = span > 1e-6 ? (r.mean - lo) / span : 1;
    return { start: r.start, end: r.end, intensity, tier: tierOf(intensity, r.rising) };
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio/offline/detectSections.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/offline/segmentation.ts tests/audio/offline/detectSections.test.ts
git commit -m "feat(segment): detectSections — boundaries + relative-loudness intensity tiers" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `assembleTrack` computes sections from optional beat features

**Files:** Modify `src/audio/offline/assembleTrack.ts`; Modify `tests/audio/offline/assembleTrack.test.ts`

- [ ] **Step 1: Extend the test**

Add to `tests/audio/offline/assembleTrack.test.ts` (inside the existing `describe`):

```ts
  it('produces sections when beatFeatures are supplied, none otherwise', () => {
    const frameRate = 100, n = 2200;
    const ramp = (fn: (i: number) => number) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = fn(i); return a; };
    const beats = new Float32Array(41); for (let i = 0; i < 41; i++) beats[i] = i * 0.5;
    const feats: number[][] = []; for (let i = 0; i < 40; i++) feats.push(i < 20 ? [1, 0] : [0, 1]);
    const base = {
      duration: 20, sampleRate: 44100, frameRate, tempoBpm: 120,
      loudness: ramp((i) => (i / frameRate < 10 ? 0.1 : 0.6)),
      bass: ramp(() => 0.2), lowMid: ramp(() => 0), mid: ramp(() => 0), high: ramp(() => 0),
      onset: ramp(() => 0), beats,
    };
    const withFeats = assembleTrack({ ...base, beatFeatures: feats });
    expect(withFeats.sections.length).toBeGreaterThanOrEqual(2);
    const without = assembleTrack(base);
    expect(without.sections.length).toBe(0);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/audio/offline/assembleTrack.test.ts`
Expected: FAIL (`beatFeatures` not accepted / `sections` undefined).

- [ ] **Step 3: Modify `src/audio/offline/assembleTrack.ts`**

Add `beatFeatures?: number[][]` to `RawTrack`:
```ts
  beats: Float32Array;     // seconds
  beatFeatures?: number[][]; // per-beat feature vectors for segmentation (optional)
```

Add the import at the top:
```ts
import { detectSections } from './segmentation';
```

Compute sections and include them in the return. Before `return {`:
```ts
  const sections = raw.beatFeatures ? detectSections(raw.beatFeatures, raw.beats, loudness, raw.frameRate) : [];
```
and add `sections,` to the returned object.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio/offline/assembleTrack.test.ts` (expect all pass)
Run: `npm test` and `npx tsc --noEmit` (all pass, clean).

- [ ] **Step 5: Commit**

```bash
git add src/audio/offline/assembleTrack.ts tests/audio/offline/assembleTrack.test.ts
git commit -m "feat(segment): assembleTrack derives sections from optional beatFeatures" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `essentiaAnalyze` computes per-beat MFCC features

**Files:** Modify `src/audio/offline/essentiaAnalyze.ts`

No unit test (WASM); verify via `tsc` + `npm run build`.

- [ ] **Step 1: Add MFCC to the frame loop and pass beat features**

In `src/audio/offline/essentiaAnalyze.ts`:

Add the import:
```ts
import { beatSyncFeatures } from './segmentation';
```

Before the frame loop, add an accumulator for per-frame MFCC (coeffs 1..12):
```ts
  const mfccByFrame: number[][] = [];
```

Inside the per-frame loop, after `const melOut = essentia.MelBands(spec.spectrum);` and its use, add:
```ts
    const mfccOut = essentia.MFCC(spec.spectrum);
    const coeffs = essentia.vectorToArray(mfccOut.mfcc) as Float32Array;
    mfccByFrame.push(Array.from(coeffs.slice(1))); // skip coeff 0 (energy); keep timbre
    mfccOut.mfcc.delete(); mfccOut.bands.delete();
```
(Place the two `.delete()` calls alongside the existing per-frame deletes so they run every iteration.)

After the loop and onset normalization, compute beat-synchronous features and pass them to `assembleTrack`:
```ts
  const beatFeatures = beatSyncFeatures(mfccByFrame, frameRate, beats);
```
and add `beatFeatures,` to the `assembleTrack({ ... })` call.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` (clean).
Run: `npm run build` (succeeds; worker chunk still ~2.5 MB).

- [ ] **Step 3: Commit**

```bash
git add src/audio/offline/essentiaAnalyze.ts
git commit -m "feat(segment): essentiaAnalyze computes per-beat MFCC for segmentation" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: pure `analyzeTrack` computes per-beat band features

**Files:** Modify `src/audio/offline/analyzeTrack.ts`

The existing `analyzeTrack.test.ts` guards behavior; this adds beat-band features so the fallback path also produces sections.

- [ ] **Step 1: Build per-beat band features and pass them**

In `src/audio/offline/analyzeTrack.ts`:

Add the import:
```ts
import { beatSyncFeatures } from './segmentation';
```

After `const beats = trackBeats(...)` and before the `assembleTrack({ ... })` call, build per-frame band vectors then beat-sync them:
```ts
  const bandsByFrame: number[][] = [];
  for (let f = 0; f < tl.loudness.length; f++) bandsByFrame.push([tl.bass[f], tl.lowMid[f], tl.mid[f], tl.high[f]]);
  const beatFeatures = beatSyncFeatures(bandsByFrame, frameRate, beats);
```
and add `beatFeatures,` to the `assembleTrack({ ... })` call.

- [ ] **Step 2: Verify**

Run: `npx vitest run tests/audio/offline/analyzeTrack.test.ts` (the existing test still passes; `analyzeTrack` now also yields `sections` — the test doesn't assert on them, so it stays green; the synthetic kick track may produce 0 or more sections, both fine).
Run: `npm test` and `npx tsc --noEmit` (all pass, clean).

- [ ] **Step 3: Commit**

```bash
git add src/audio/offline/analyzeTrack.ts
git commit -m "feat(segment): pure analyzeTrack computes per-beat band features (fallback sections)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `AnalyzedFeatureProvider` computes section fields (TDD)

**Files:** Modify `src/audio/providers/AnalyzedFeatureProvider.ts`; Modify `tests/audio/providers/AnalyzedFeatureProvider.test.ts`

- [ ] **Step 1: Extend the test**

Add to `tests/audio/providers/AnalyzedFeatureProvider.test.ts` (the file's `track()` helper builds an AnalyzedTrack; pass `sections` via the `over` param). Add inside the existing `describe`:

```ts
  it('exposes section fields and pulses sectionBoundary on crossing', () => {
    const t = track({
      duration: 2,
      sections: [
        { start: 0, end: 1, intensity: 0.2, tier: 'calm' },
        { start: 1, end: 2, intensity: 0.9, tier: 'peak' },
      ],
    });
    let now = 0.5;
    const p = new AnalyzedFeatureProvider(t, () => now);
    let f = p.sample();                       // first sample in section 0
    expect(f.sectionActive).toBe(true);
    expect(f.sectionIntensity).toBeCloseTo(0.2, 5);
    expect(f.sectionBoundary).toBe(0);        // no pulse on first read
    now = 1.5; f = p.sample();                // crossed into section 1
    expect(f.sectionBoundary).toBe(1);
    expect(f.sectionIntensity).toBeCloseTo(0.9, 5);
    now = 1.6; f = p.sample();                // same section
    expect(f.sectionBoundary).toBe(0);
  });

  it('reports neutral section fields when there are no sections', () => {
    let now = 0.5;
    const p = new AnalyzedFeatureProvider(track({ sections: [] }), () => now);
    const f = p.sample();
    expect(f.sectionActive).toBe(false);
    expect(f.sectionIntensity).toBe(1);
    expect(f.sectionBoundary).toBe(0);
  });
```

Also ensure the test's `track()` helper includes `sections: []` in its defaults (add `sections: [],` to the returned object if not present).

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/audio/providers/AnalyzedFeatureProvider.test.ts`
Expected: FAIL (provider returns neutral defaults, no pulse logic yet).

- [ ] **Step 3: Implement in `src/audio/providers/AnalyzedFeatureProvider.ts`**

Add a field to the class:
```ts
  private lastSectionIdx = -1;
```

Add a private helper:
```ts
  /** Index of the section containing time t, or -1. */
  private sectionIndexAt(t: number): number {
    const s = this.track.sections;
    for (let i = 0; i < s.length; i++) if (t >= s[i].start && t < s[i].end) return i;
    return s.length > 0 && t >= s[s.length - 1].end ? s.length - 1 : -1;
  }
```

In `sample()`, after `t` is computed, replace the neutral section defaults with:
```ts
    let sectionActive = false, sectionBoundary = 0, sectionIntensity = 1;
    if (this.track.sections.length > 0) {
      sectionActive = true;
      const idx = this.sectionIndexAt(t);
      if (idx >= 0) {
        sectionIntensity = this.track.sections[idx].intensity;
        if (this.lastSectionIdx !== -1 && idx !== this.lastSectionIdx) sectionBoundary = 1;
        this.lastSectionIdx = idx;
      }
    }
```
and return `sectionActive, sectionBoundary, sectionIntensity` in the object (replacing the neutral literals added in Task 1).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio/providers/AnalyzedFeatureProvider.test.ts` (all pass)
Run: `npm test` and `npx tsc --noEmit` (all pass, clean).

- [ ] **Step 5: Commit**

```bash
git add src/audio/providers/AnalyzedFeatureProvider.ts tests/audio/providers/AnalyzedFeatureProvider.test.ts
git commit -m "feat(segment): provider exposes sectionActive/boundary/intensity per frame" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: `SceneController` boundary advance + `Renderer` wiring (TDD)

**Files:** Modify `src/visual/SceneController.ts`; Modify `tests/visual/SceneController.test.ts`; Modify `src/visual/Renderer.ts`

- [ ] **Step 1: Update the SceneController test**

First read `tests/visual/SceneController.test.ts` to see how it calls `update`. Change calls from `update(dt, drop)` to `update(dt, features)` and add a boundary test. Use a features factory:

```ts
const F = (over: Partial<import('../../src/types').AudioFeatures> = {}) =>
  ({ drop: 0, sectionActive: false, sectionBoundary: 0, sectionIntensity: 1, ...over } as import('../../src/types').AudioFeatures);
```

Replace existing `scenes.update(dt, dropValue)` calls with `scenes.update(dt, F({ drop: dropValue }))`, and add:

```ts
it('advances on a section boundary when sections are active', () => {
  const palette = new Palette();
  const sc = new SceneController(palette);
  const start = sc.index;
  sc.update(SCENE_SWITCH.minSeconds + 0.1, F({ sectionActive: true, sectionBoundary: 0 })); // time passes, no boundary
  expect(sc.index).toBe(start);
  sc.update(0.016, F({ sectionActive: true, sectionBoundary: 1 }));                         // boundary -> advance
  expect(sc.index).toBe((start + 1) % /* SCENES.length */ 6);
});

it('ignores drops for rotation when sections are active', () => {
  const palette = new Palette();
  const sc = new SceneController(palette);
  const start = sc.index;
  sc.update(SCENE_SWITCH.minSeconds + 0.1, F({ sectionActive: true, drop: 1 })); // drop, but sectioned
  expect(sc.index).toBe(start);
});
```
(Import `SCENE_SWITCH` and `Palette` as the existing test does; adjust `% 6` to `SCENES.length` if imported.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/visual/SceneController.test.ts`
Expected: FAIL (`update` signature still `(dt, drop)`).

- [ ] **Step 3: Modify `src/visual/SceneController.ts`**

Replace the `update` method and import the type:
```ts
import { SCENES, SCENE_SWITCH } from '../config';
import type { AudioFeatures } from '../types';
import type { Palette } from './Palette';
```
```ts
  update(dt: number, features: AudioFeatures): void {
    this.timeIn += dt;
    const dropEdge = this.prevDrop < 0.5 && features.drop > 0.9;
    this.prevDrop = features.drop;
    // When the track has real sections, advance on section boundaries; otherwise on drops.
    const trigger = features.sectionActive ? features.sectionBoundary > 0.5 : dropEdge;
    if ((trigger && this.timeIn >= SCENE_SWITCH.minSeconds) || this.timeIn >= SCENE_SWITCH.maxSeconds) {
      this.advance();
    }
  }
```

- [ ] **Step 4: Wire the Renderer**

In `src/visual/Renderer.ts`, in `frame(dt)`:

Change the scene-controller call from `this.scenes.update(dt, features.drop);` to:
```ts
    this.scenes.update(dt, features);
```

Apply the section-intensity multiplier when compositing the scene to the visible canvas. Add the import `import { KALEIDO, SEGMENT } from '../config';` (extend the existing config import). Compute the factor near the top of `frame()` after `features`:
```ts
    const sectFactor = SEGMENT.intensityFloor + (1 - SEGMENT.intensityFloor) * features.sectionIntensity;
```
Then where the scene is drawn to the visible canvas (`ctx.globalAlpha = 1; ... ctx.drawImage(this.scene, ...)`), use `sectFactor` as the base alpha:
```ts
    ctx.globalAlpha = sectFactor;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.drawImage(this.scene, 0, 0, this.w, this.h);
```
and for the kaleidoscope crossfade, scale its alpha too: change `ctx.globalAlpha = k;` to `ctx.globalAlpha = k * sectFactor;`. Leave the anticipation-glow block and `onFrame` call unchanged.

- [ ] **Step 5: Verify**

Run: `npx vitest run tests/visual/SceneController.test.ts` (pass)
Run: `npm test` (all pass), `npx tsc --noEmit` (clean), `npm run build` (succeeds).

- [ ] **Step 6: Commit**

```bash
git add src/visual/SceneController.ts tests/visual/SceneController.test.ts src/visual/Renderer.ts
git commit -m "feat(segment): scenes advance on section boundaries; section-intensity effect multiplier" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite + typecheck + build**

Run: `npm test` (all pass — segmentation, detectSections, provider, SceneController, plus the prior suite).
Run: `npx tsc --noEmit && npm run build` (both succeed; worker ~2.5 MB).

- [ ] **Step 2: Browser verification**

Dev server at `http://127.0.0.1:5173` (NOT localhost). Load a real, structured track and confirm:
- Scene/palette changes land on **structural boundaries** (a new section, e.g. verse→chorus or into a drop), not mid-section, and not on every drop.
- **Calm vs peak sections visibly differ** in overall intensity (the breakdown recedes; the peak goes full).
- Drops still fire the explosion (they just no longer rotate the scene).
- Switch to **mic/tab**: scenes still rotate on drops+timer as before (no sections), intensity unaffected.
- (Optional) temporarily log `track.sections` from the worker to sanity-check boundary count/positions on a known song.

- [ ] **Step 3: Confirm with the user** before finishing the branch.

---

## Self-Review

**Spec coverage:**
- Beat-synchronous MFCC → SSM → novelty → boundaries → Tasks 2, 3, 5. Pure-DSP band-feature fallback → Task 6. `detectSections` pure + feature-agnostic → Tasks 2-3. Relative loudness tiers → Task 3. `Section`/`AnalyzedTrack.sections` → Task 1. `assembleTrack` optional `beatFeatures` → Task 4. Per-frame `sectionActive/sectionBoundary/sectionIntensity` + neutral live defaults → Tasks 1, 7. Scene changes on boundaries + drop/timer fallback → Task 8. Section-intensity multiplier → Task 8. `SEGMENT` config → Task 1. Testing + browser → all tasks + Task 9.

**Placeholder scan:** none — every code/test step has complete content.

**Type consistency:** `Section`/`SectionTier` (Task 1) used by `segmentation.ts` (Task 3), `AnalyzedTrack` (Task 1), provider (Task 7). `beatSyncFeatures`/`noveltyCurve`/`pickPeaks`/`cosineSimilarity`/`detectSections` (Tasks 2-3) consumed by `assembleTrack` (Task 4), `essentiaAnalyze` (Task 5), `analyzeTrack` (Task 6). `RawTrack.beatFeatures` (Task 4) supplied by Tasks 5-6. `AudioFeatures` section fields (Task 1) produced by provider (Task 7) + consumed by `SceneController`/`Renderer` (Task 8). `SEGMENT` fields (Task 1) used in Tasks 2-3, 8.

**Out of scope (per spec):** named sections, repetition labeling, per-section effect presets beyond the one multiplier, live/no-feature segmentation beyond band-vector/empty fallback, changes to tempo/beats/drops/transport/waveform.
