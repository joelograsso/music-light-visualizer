import { CORE } from '../config';
import type { FrequencyBands } from '../types';

/** Radius of the central core ring, shared by CoreLayer and BloomLayer so blooms spawn exactly on the ring. */
export function coreRadius(energy: number, bands: FrequencyBands, beat: number, minDim: number): number {
  const bass = bands.bass * 0.6 + beat;
  return Math.min(minDim * CORE.maxRadiusFrac, 2 + energy * minDim * CORE.growthFrac + bass * 30 * energy);
}
