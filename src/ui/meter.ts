import type { AudioFeatures } from '../types';

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Five reactive meter bar heights (0..1), low → high frequency, derived from the
 * frequency bands and gated by overall energy so the meter sinks in quiet passages
 * (the dB-scaled bands can read high even when the music is faint). Deterministic.
 */
export function meterLevels(f: AudioFeatures): number[] {
  const { bass, lowMid, mid, high } = f.bands;
  const raw = [bass, (bass + lowMid) / 2, lowMid, mid, high];
  const gain = 0.25 + 0.75 * clamp01(f.energy);
  return raw.map((v) => clamp01(v) * gain);
}
