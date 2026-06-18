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
