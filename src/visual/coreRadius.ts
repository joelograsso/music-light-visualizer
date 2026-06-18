import { CORE } from '../config';
import type { FrequencyBands } from '../types';

/**
 * Radius of the central core ring, shared by CoreLayer and BloomLayer so blooms
 * spawn exactly on the ring. The radius interpolates from a baseline (minRadiusFrac)
 * up to full (maxRadiusFrac) by `energy`, then is scaled by `presence`. So while a
 * song plays (presence ~1) the ring never shrinks below the baseline even in quiet
 * passages; it closes to a point only in real silence (presence -> 0) at the start
 * and end of a song. The smoothed bass adds a gentle, smooth breathing on top.
 */
export function coreRadius(energy: number, presence: number, bands: FrequencyBands, minDim: number): number {
  const frac = CORE.minRadiusFrac + energy * (CORE.maxRadiusFrac - CORE.minRadiusFrac);
  const base = presence * minDim * frac;
  const breathe = 1 + 0.12 * bands.bass * energy; // subtle, smooth, fades out as energy -> 0
  return Math.min(minDim * CORE.maxRadiusFrac, base * breathe);
}
