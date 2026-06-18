function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Global motion multiplier from smoothed energy plus a gentle tempo nudge. */
export function computeMotionSpeed(energy: number, tempoBpm: number | null): number {
  const base = 0.35 + energy * 0.95;
  const tempoFactor = tempoBpm ? clamp(tempoBpm / 120, 0.7, 1.4) : 1;
  return clamp(base * tempoFactor, 0.3, 1.8);
}
