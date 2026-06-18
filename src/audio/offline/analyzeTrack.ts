import { FFT_SIZE, ENERGY, OFFLINE } from '../../config';
import { computeStft } from './stft';
import { computeFeatureTimeline } from './featureTimeline';
import { smoothZeroPhase } from './smooth';
import { globalTempo } from './tempoGlobal';
import { trackBeats } from './beatGrid';
import { findDownbeats } from './downbeats';
import { findDrops } from './drops';
import type { AnalyzedTrack } from './types';

/**
 * Analyze a whole mono track offline into an AnalyzedTrack. Pure and synchronous so it
 * can run in a worker OR be unit-tested directly. `onProgress` receives 0..1.
 */
export function analyzeTrack(
  channel: Float32Array,
  sampleRate: number,
  onProgress?: (pct: number) => void,
): AnalyzedTrack {
  const hop = OFFLINE.hop;
  const stft = computeStft(channel, FFT_SIZE, hop);
  onProgress?.(0.45);

  const frameRate = sampleRate / hop;
  const tl = computeFeatureTimeline(stft, sampleRate, FFT_SIZE);
  onProgress?.(0.6);

  const a = OFFLINE.smoothAlpha;
  const loudness = smoothZeroPhase(tl.loudness, a);
  const bass = smoothZeroPhase(tl.bass, a);
  const lowMid = smoothZeroPhase(tl.lowMid, a);
  const mid = smoothZeroPhase(tl.mid, a);
  const high = smoothZeroPhase(tl.high, a);
  const onset = tl.onset; // raw envelope drives tempo + beat grid

  const n = loudness.length;
  const presenceRaw = new Float32Array(n);
  for (let i = 0; i < n; i++) presenceRaw[i] = loudness[i] > OFFLINE.presenceFloor ? 1 : 0;
  const presence = smoothZeroPhase(presenceRaw, a);

  // Internal energy (unit sensitivity) for drop detection; the provider re-derives the
  // final, sensitivity-scaled energy at sample time.
  const energy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const intensity = Math.pow(Math.min(1, loudness[i] / ENERGY.fullScale), ENERGY.dynamicsGamma);
    energy[i] = presence[i] * intensity;
  }
  onProgress?.(0.75);

  const tempoBpm = globalTempo(onset, frameRate);
  const beats = trackBeats(onset, frameRate, tempoBpm);
  const downbeats = findDownbeats(beats, onset, frameRate);
  onProgress?.(0.9);

  const { drops, anticipation } = findDrops(energy, bass, downbeats, frameRate);
  onProgress?.(1);

  return {
    duration: channel.length / sampleRate,
    sampleRate,
    frameRate,
    tempoBpm,
    loudness,
    presence,
    bass,
    lowMid,
    mid,
    high,
    onset,
    anticipation,
    beats,
    downbeats,
    drops,
  };
}
