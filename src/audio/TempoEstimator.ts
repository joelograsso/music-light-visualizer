/** Unnormalized autocorrelation of `x` at the given lag (mean of x[i]*x[i-lag]). */
export function autocorrelate(x: number[], lag: number): number {
  const n = x.length;
  if (lag >= n) return 0;
  let s = 0;
  for (let i = lag; i < n; i++) s += x[i] * x[i - lag];
  return s / (n - lag);
}

export interface TempoResult {
  bpm: number;
  confidence: number; // 0..1, how much the best lag stands out from the average
}

/**
 * Estimate tempo by autocorrelating a fixed-rate onset envelope and finding the lag
 * (within the musical BPM range) of strongest periodicity. Far more stable than
 * median inter-onset intervals. Returns null until there's enough history.
 */
export function estimateTempo(env: number[], rateHz: number, minBpm = 70, maxBpm = 180): TempoResult | null {
  const n = env.length;
  if (n < rateHz * 2) return null; // need >= 2s of history

  const minLag = Math.max(1, Math.floor((60 / maxBpm) * rateHz));
  const maxLag = Math.min(n - 1, Math.ceil((60 / minBpm) * rateHz));
  if (maxLag <= minLag) return null;

  let bestLag = -1;
  let bestVal = -Infinity;
  let sum = 0;
  let count = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const v = autocorrelate(env, lag);
    sum += v;
    count++;
    if (v > bestVal) {
      bestVal = v;
      bestLag = lag;
    }
  }
  if (bestLag < 0) return null;

  const mean = sum / count;
  const confidence = mean > 1e-12 ? Math.max(0, Math.min(1, (bestVal - mean) / mean)) : 0;
  const bpm = 60 / (bestLag / rateHz);
  return { bpm, confidence };
}
