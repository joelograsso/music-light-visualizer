# Structural Segmentation (Stage B) — Design

**Date:** 2026-06-18
**Status:** Approved (design); ready for implementation planning
**Branch:** `feature/structural-segmentation` (off `main`)

## Goal

For local audio files, detect the song's **structural boundaries** (where its character
changes) and tag each segment with an **intensity tier**, then use that to drive the visuals
on real musical boundaries: the scene/palette changes at section starts (instead of on drops
+ a timer), and a slow section-intensity envelope biases overall effect strength. Live
capture (mic/tab) is unchanged.

This is **Stage B**, building on the shipped offline analysis (Stage A + essentia.js). It is
the most ambitious / least reliable piece, so it degrades gracefully.

## Background — current state

Offline analysis runs in a Web Worker: essentia.js (`analyzeTrackEssentia`, with a pure-DSP
fallback) produces an `AnalyzedTrack` via the shared pure `assembleTrack`. `AnalyzedTrack`
holds per-frame channels (`loudness, presence, bass, lowMid, mid, high, onset, anticipation`)
and events (`beats, downbeats, drops`, `tempoBpm`). Playback runs through a `Transport`;
`AnalyzedFeatureProvider` reads the timeline by position into per-frame `AudioFeatures`.

Scenes: `SceneController.update(dt, drop)` advances the scene (palette hue + kaleidoscope
symmetry) on a drop edge (≥`SCENE_SWITCH.minSeconds` apart) or every `SCENE_SWITCH.maxSeconds`.
`Palette` eases the hue; `Renderer` reads `scenes.segments` for the kaleidoscope.

essentia.js is available in the worker (its per-frame loop already computes MelBands + RMS),
so MFCC is cheap to add there.

## Architecture & data flow

### Detection (offline, beat-synchronous self-similarity → novelty)

1. **Beat-synchronous features.** In the essentia per-frame loop, also compute **MFCC** per
   frame (timbre — the standard structure feature). Aggregate frames into one mean MFCC
   vector **per beat** using essentia's beat grid. (Pure-DSP fallback: use per-beat mean band
   vectors `[bass, lowMid, mid, high]` instead, or pass none → no sections.)
2. **Self-similarity matrix (SSM).** Cosine similarity between every pair of per-beat feature
   vectors → an N×N matrix (N = beat count, typically a few hundred).
3. **Novelty curve.** Slide a Gaussian-tapered checkerboard kernel down the SSM diagonal →
   a per-beat novelty value; peaks mark texture changes.
4. **Boundaries.** Adaptive peak-picking (a threshold relative to the local mean + a minimum
   section length of `SEGMENT.minSectionBars` bars) → boundary beat indices → boundary times.
   Segments span consecutive boundaries (plus track start and end).
5. **Intensity tier.** Each segment's mean **loudness** (the stored absolute-RMS channel),
   normalized across the track (relative, so every song uses the full range), gives
   `intensity` (0..1) and a `tier` (`calm` < `building` < `intense` < `peak`). A segment whose
   loudness rises clearly across its span is tagged `building` regardless of mean.

The detector is **feature-agnostic and pure**:

```ts
detectSections(beatFeatures: number[][], beats: Float32Array, loudness: Float32Array, frameRate: number): Section[]
```

so it is unit-testable on synthetic feature matrices, and works for either MFCC (essentia) or
band vectors (pure fallback). With no/empty `beatFeatures` it returns `[]`.

### Data

```ts
type SectionTier = 'calm' | 'building' | 'intense' | 'peak';
interface Section { start: number; end: number; intensity: number; tier: SectionTier; }
```

`AnalyzedTrack` gains one field: `sections: Section[]`. Nothing else in its shape changes.

`assembleTrack` accepts an optional `beatFeatures?: number[][]` and computes
`sections = beatFeatures ? detectSections(beatFeatures, beats, loudness, frameRate) : []`
(using the already-computed `loudness` for tiers). Both analyzers feed it: `essentiaAnalyze`
passes per-beat MFCC; the pure path passes per-beat bands (or omits → `[]`).

### Per-frame features (provider → visuals)

`AudioFeatures` gains three fields:
- `sectionActive: boolean` — true when the track has sections.
- `sectionBoundary: number` — a pulse (1 on the frame the playhead crosses a boundary, decays).
- `sectionIntensity: number` — current section intensity (0..1); **defaults to 1 (neutral)**
  on the live path and when there are no sections.

`AnalyzedFeatureProvider` computes these from `track.sections` + playback position.
`SILENT` (AudioEngine) and the live `FeatureExtractor` set
`sectionActive=false, sectionBoundary=0, sectionIntensity=1` (backward-compatible).

### Visual integration

- **Scene changes on boundaries.** `SceneController.update(dt, features)` — when
  `features.sectionActive`, advance the scene/palette on each `sectionBoundary` pulse (with
  the existing `minSeconds` guard) plus the `maxSeconds` fallback for long sections; **drops
  no longer rotate the scene** (drops still drive the explosion). When `!sectionActive`
  (live/fallback), keep today's drop+timer logic unchanged.
- **Section-aware intensity.** `Renderer` applies `sectionIntensity` as a gentle global
  effect-strength multiplier `SEGMENT.intensityFloor + (1 - SEGMENT.intensityFloor) *
  sectionIntensity` (e.g. floor 0.6), so a breakdown recedes and a peak goes full — a slow
  *structural* envelope on top of per-frame energy. Absolute loudness still drives moment-to-
  moment intensity; sections only add the slow bias. Neutral (=1) for live, so no change there.

### Where it lives (files)

**New:** `src/audio/offline/segmentation.ts` (pure `detectSections` + `Section`/`SectionTier`
helpers — or the types live in `offline/types.ts`).

**Modified:**
- `src/audio/offline/types.ts` — `Section`, `SectionTier`, `AnalyzedTrack.sections`.
- `src/audio/offline/assembleTrack.ts` — optional `beatFeatures`, call `detectSections`.
- `src/audio/offline/essentiaAnalyze.ts` — compute per-beat MFCC in the frame loop; pass it.
- `src/audio/offline/analyzeTrack.ts` (pure) — pass per-beat band features (or omit).
- `src/types.ts` — `AudioFeatures` gains `sectionActive`/`sectionBoundary`/`sectionIntensity`.
- `src/audio/AudioEngine.ts` (`SILENT`), `src/audio/FeatureExtractor.ts` (live defaults),
  `src/audio/providers/AnalyzedFeatureProvider.ts` (compute from sections + position).
- `src/visual/SceneController.ts` — boundary-driven advance with live fallback.
- `src/visual/Renderer.ts` — apply the section-intensity multiplier.
- `src/config.ts` — `SEGMENT` block.

### Config (`SEGMENT`)
```ts
export const SEGMENT = {
  mfccCoeffs: 13,        // MFCC coefficients per beat for the SSM
  kernelBeats: 16,       // checkerboard novelty kernel size (beats)
  minSectionBars: 4,     // minimum section length (bars) for peak-picking
  peakThreshold: 1.5,    // novelty peak must exceed local mean * this
  intensityFloor: 0.6,   // section-intensity multiplier floor (1 = no effect)
};
```

## Behavior details

- **File-only.** Sections exist only for analyzed files; live capture is untouched.
- **Graceful degradation.** Too few/many boundaries just means scenes lean on the
  `maxSeconds` fallback; `minSectionBars` + `peakThreshold` are tunable. If detection yields
  no boundaries, the track is one section (no scene-boundary changes; `maxSeconds` still
  evolves the scene).
- **Sync.** `sectionBoundary`/`sectionIntensity` come from the same playback clock as
  everything else, so they stay aligned through seeks/pauses.
- **Tier is relative per track** so quiet songs still get a full `calm…peak` range.

## Error handling / edge cases

- **Pure-DSP fallback path:** aggregates its per-beat band vectors `[bass, lowMid, mid, high]`
  as the SSM features (coarser than MFCC but still yields sections), so segmentation works on
  both analyzers — never empty merely because essentia is absent.
- **Very short tracks / few beats** (N < kernel size): `detectSections` returns `[]` (one
  implicit section); no crash.
- **MFCC unavailable in essentia.js** (confirm in the plan's spike, like MelBands): if
  `MFCC` throws, pass band features instead; sections still computed.
- **Degenerate SSM** (all-similar or all-different): peak-picking with the threshold + min
  length yields few/no boundaries; handled by the fallback.
- **outputLatency / loop wrap:** `sectionBoundary` derived from the wrapped position like
  other events; crossing the loop seam re-enters section 0 (a boundary pulse there is fine).

## Testing

- **`detectSections`** (pure unit): two distinct synthetic feature blocks → exactly one
  interior boundary near the join; uniform features → no interior boundaries; a louder block
  gets a higher tier than a quiet block; N below the kernel size → `[]`.
- **SSM/novelty helpers** (pure): self-similarity of identical vectors = 1; the checkerboard
  novelty peaks at a block change.
- **`AnalyzedFeatureProvider`** (unit): `sectionBoundary` pulses when position crosses a
  section start; `sectionIntensity` matches the current section; `sectionActive` false when
  `sections` is empty; defaults hold at loop wrap.
- **`SceneController`** (unit): advances on a `sectionBoundary` when `sectionActive`; ignores
  drops for rotation when active; the existing drop+timer test (live, `sectionActive=false`)
  stays green.
- **Browser smoke (Playwright):** a real track shows scene/palette changes landing on
  structural boundaries (not mid-section), calm vs peak sections visibly differ, and mic/tab
  behave exactly as before.

## Out of scope (YAGNI)

- Named sections (intro/verse/chorus/drop/breakdown) — boundaries + intensity tiers only.
- Repetition/structure labeling (chorus-detection, A/B/A form).
- Per-section curated effect presets beyond the single intensity multiplier.
- Segmentation for live capture or the no-MFCC pure path beyond the band-vector/empty fallback.
- Changing tempo/beats/drops/anticipation or the transport/waveform.
