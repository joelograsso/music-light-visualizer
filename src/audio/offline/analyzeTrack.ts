import { FFT_SIZE, OFFLINE } from '../../config';
import { computeStft } from './stft';
import { computeFeatureTimeline } from './featureTimeline';
import { globalTempo } from './tempoGlobal';
import { trackBeats } from './beatGrid';
import { assembleTrack } from './assembleTrack';
import { beatSyncFeatures } from './segmentation';
import type { AnalyzedTrack } from './types';

/**
 * Pure-DSP offline analysis (the fallback when essentia.js is unavailable). Computes the
 * STFT feature timeline, tempo (autocorrelation), and beat grid (DP), then hands the raw
 * channels + beats to the shared assembleTrack.
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
  onProgress?.(0.65);

  const tempoBpm = globalTempo(tl.onset, frameRate);
  const beats = trackBeats(tl.onset, frameRate, tempoBpm);
  onProgress?.(0.85);

  // Bands are a coarser timbre proxy than the essentia path's MFCCs, but enough for boundary novelty.
  const bandsByFrame: number[][] = [];
  for (let f = 0; f < tl.loudness.length; f++) bandsByFrame.push([tl.bass[f], tl.lowMid[f], tl.mid[f], tl.high[f]]);
  const beatFeatures = beatSyncFeatures(bandsByFrame, frameRate, beats);

  const track = assembleTrack({
    duration: channel.length / sampleRate,
    sampleRate,
    frameRate,
    tempoBpm,
    loudness: tl.loudness,
    bass: tl.bass,
    lowMid: tl.lowMid,
    mid: tl.mid,
    high: tl.high,
    onset: tl.onset,
    beats,
    beatFeatures,
  });
  onProgress?.(1);
  return track;
}
