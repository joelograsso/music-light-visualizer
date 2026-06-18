import { SEGMENT } from '../../config';
import type { Section, SectionTier } from './types';

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

function tierOf(intensity: number, rising: boolean): SectionTier {
  // A rising arc overrides calm/intense for the lower-energy range: a build-up reads as 'building'.
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
    // span ~ 0 (single section, or all segments equally loud): no relative ranking, treat as full.
    const intensity = span > 1e-6 ? (r.mean - lo) / span : 1;
    return { start: r.start, end: r.end, intensity, tier: tierOf(intensity, r.rising) };
  });
}
