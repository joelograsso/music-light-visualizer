import { CORE } from '../config';
import type { FrequencyBands } from '../types';

/**
 * Radius of the central core ring, shared by CoreLayer and BloomLayer so blooms
 * spawn exactly on the ring. Size comes from the slow `energy` envelope (smooth,
 * progressive growth); the smoothed bass band adds a gentle ±breathing on top that
 * scales with energy (so it's still in silence). Deliberately omits the spiky
 * onset `beat` so the circle breathes rather than jitters.
 */
export function coreRadius(energy: number, bands: FrequencyBands, minDim: number): number {
  const base = 2 + energy * minDim * CORE.growthFrac;
  const breathe = 1 + 0.14 * bands.bass * energy; // subtle, smooth, fades out as energy -> 0
  return Math.min(minDim * CORE.maxRadiusFrac, base * breathe);
}
