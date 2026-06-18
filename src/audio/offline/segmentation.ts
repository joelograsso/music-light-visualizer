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
