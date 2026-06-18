import type { AnalyzedTrack } from './types';

export type ProgressCb = (pct: number) => void;
export type EssentiaFn = (channel: Float32Array, sampleRate: number, onProgress?: ProgressCb) => Promise<AnalyzedTrack>;
export type PureFn = (channel: Float32Array, sampleRate: number, onProgress?: ProgressCb) => AnalyzedTrack;

/**
 * Run the essentia analyzer; on ANY error fall back to the pure-DSP analyzer. Keeps file
 * analysis working even if the WASM can't load or throws.
 */
export async function analyzeWithFallback(
  channel: Float32Array,
  sampleRate: number,
  essentiaFn: EssentiaFn,
  pureFn: PureFn,
  onProgress?: ProgressCb,
): Promise<AnalyzedTrack> {
  try {
    return await essentiaFn(channel, sampleRate, onProgress);
  } catch {
    return pureFn(channel, sampleRate, onProgress);
  }
}
