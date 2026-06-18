function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Global motion multiplier from smoothed energy plus a gentle tempo nudge. */
export function computeMotionSpeed(energy: number, tempoBpm: number | null): number {
  const base = 0.35 + energy * 0.95;
  const tempoFactor = tempoBpm ? clamp(tempoBpm / 120, 0.7, 1.4) : 1;
  return clamp(base * tempoFactor, 0.3, 1.8);
}

/** Median inter-onset interval -> BPM, or null if too few onsets. */
export function estimateTempo(onsetTimes: number[]): number | null {
  if (onsetTimes.length < 4) return null;
  const intervals: number[] = [];
  for (let i = 1; i < onsetTimes.length; i++) intervals.push(onsetTimes[i] - onsetTimes[i - 1]);
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  if (median <= 0) return null;
  let bpm = 60 / median;
  while (bpm < 70) bpm *= 2;   // fold into a musical range
  while (bpm > 180) bpm /= 2;
  return bpm;
}
