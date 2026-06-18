import { TEMPO } from '../../config';
import { estimateTempo } from '../TempoEstimator';

/**
 * Global tempo: autocorrelate the WHOLE onset envelope (reusing the validated
 * `estimateTempo`). Far more stable than the running real-time estimate, which has to
 * warm up. Returns 0 when no stable period is found.
 */
export function globalTempo(onset: Float32Array, frameRate: number): number {
  const r = estimateTempo(Array.from(onset), frameRate, TEMPO.minBpm, TEMPO.maxBpm);
  return r ? r.bpm : 0;
}
