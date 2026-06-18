import { ENERGY, OFFLINE } from '../../config';
import { smoothZeroPhase } from './smooth';
import { findDownbeats } from './downbeats';
import { findDrops } from './drops';
import { detectSections } from './segmentation';
import type { AnalyzedTrack } from './types';

/** Raw per-frame channels + beat grid produced by an analyzer (essentia or pure DSP). */
export interface RawTrack {
  duration: number;
  sampleRate: number;
  frameRate: number;
  tempoBpm: number;
  loudness: Float32Array;
  bass: Float32Array;
  lowMid: Float32Array;
  mid: Float32Array;
  high: Float32Array;
  onset: Float32Array;     // 0..1
  beats: Float32Array;     // seconds
  beatFeatures?: number[][]; // per-beat feature vectors for segmentation (optional)
}

/**
 * Shared, pure assembly: zero-phase smooth the channels, derive presence + internal energy,
 * infer 4/4 downbeats on the beat grid, detect drops + the anticipation ramp, and package
 * the AnalyzedTrack. Used by both the essentia and pure-DSP analyzers.
 */
export function assembleTrack(raw: RawTrack): AnalyzedTrack {
  const a = OFFLINE.smoothAlpha;
  const loudness = smoothZeroPhase(raw.loudness, a);
  const bass = smoothZeroPhase(raw.bass, a);
  const lowMid = smoothZeroPhase(raw.lowMid, a);
  const mid = smoothZeroPhase(raw.mid, a);
  const high = smoothZeroPhase(raw.high, a);
  const onset = raw.onset;

  const n = loudness.length;
  const presenceRaw = new Float32Array(n);
  for (let i = 0; i < n; i++) presenceRaw[i] = loudness[i] > OFFLINE.presenceFloor ? 1 : 0;
  const presence = smoothZeroPhase(presenceRaw, a);

  const energy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const intensity = Math.pow(Math.min(1, loudness[i] / ENERGY.fullScale), ENERGY.dynamicsGamma);
    energy[i] = presence[i] * intensity;
  }

  const downbeats = findDownbeats(raw.beats, onset, raw.frameRate);
  const { drops, anticipation } = findDrops(energy, bass, downbeats, raw.frameRate);
  // beatFeatures only arrive from the offline analyzers (essentia MFCC / pure-DSP bands); the
  // live/no-feature path passes none, so it gets no sections.
  const sections = raw.beatFeatures ? detectSections(raw.beatFeatures, raw.beats, loudness, raw.frameRate) : [];

  return {
    duration: raw.duration,
    sampleRate: raw.sampleRate,
    frameRate: raw.frameRate,
    tempoBpm: raw.tempoBpm,
    loudness, presence, bass, lowMid, mid, high, onset, anticipation,
    beats: raw.beats, downbeats, drops, sections,
  };
}
