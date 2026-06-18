import { BAND_EDGES, OFFLINE } from '../../config';
import type { Stft } from './stft';

export interface FeatureTimeline {
  loudness: Float32Array;
  bass: Float32Array;
  lowMid: Float32Array;
  mid: Float32Array;
  high: Float32Array;
  onset: Float32Array; // 0..1 onset envelope (low-weighted spectral flux, normalized)
}

function binFor(freq: number, sr: number, fft: number): number {
  return Math.round(freq / (sr / fft));
}

/** Map a linear FFT magnitude to a perceptual 0..1 level via dB, mirroring the live path. */
function levelOf(mag: number, minDb: number, maxDb: number): number {
  const db = 20 * Math.log10(mag + 1e-9);
  const v = (db - minDb) / (maxDb - minDb);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function computeFeatureTimeline(stft: Stft, sampleRate: number, fftSize: number): FeatureTimeline {
  const n = stft.frameCount;
  const half = fftSize >> 1;
  const loudness = new Float32Array(n);
  const bass = new Float32Array(n);
  const lowMid = new Float32Array(n);
  const mid = new Float32Array(n);
  const high = new Float32Array(n);
  const onset = new Float32Array(n);
  const rawFlux = new Float32Array(n);

  const bassLo = binFor(20, sampleRate, fftSize);
  const bassHi = binFor(BAND_EDGES.bassMax, sampleRate, fftSize);
  const lmHi = binFor(BAND_EDGES.lowMidMax, sampleRate, fftSize);
  const mdHi = binFor(BAND_EDGES.midMax, sampleRate, fftSize);
  const hiHi = Math.min(half, binFor(BAND_EDGES.highMax, sampleRate, fftSize));
  const onsetHiBin = Math.min(half, binFor(500, sampleRate, fftSize)); // kick/snare body (mirrors ONSET.lowHz)

  const avg = (level: Float32Array, lo: number, hi: number): number => {
    const h = Math.min(level.length, hi);
    if (h <= lo) return 0;
    let s = 0;
    for (let i = lo; i < h; i++) s += level[i];
    return s / (h - lo);
  };

  let prev: Float32Array | null = null;
  for (let f = 0; f < n; f++) {
    const mag = stft.frames[f];
    const level = new Float32Array(mag.length);
    for (let i = 0; i < mag.length; i++) level[i] = levelOf(mag[i], OFFLINE.minDb, OFFLINE.maxDb);

    loudness[f] = stft.rms[f];
    bass[f] = avg(level, bassLo, bassHi);
    lowMid[f] = avg(level, bassHi, lmHi);
    mid[f] = avg(level, lmHi, mdHi);
    high[f] = avg(level, mdHi, hiHi);

    if (prev) {
      let flux = 0, wsum = 0;
      for (let i = 0; i < onsetHiBin; i++) {
        const d = level[i] - prev[i];
        const w = 1 - (i / onsetHiBin) * 0.5; // weight the lowest bins (kick) highest
        if (d > 0) flux += d * w;
        wsum += w;
      }
      rawFlux[f] = wsum > 0 ? flux / wsum : 0;
    }
    prev = level;
  }

  let maxFlux = 1e-9;
  for (let f = 0; f < n; f++) if (rawFlux[f] > maxFlux) maxFlux = rawFlux[f];
  for (let f = 0; f < n; f++) onset[f] = rawFlux[f] / maxFlux;

  return { loudness, bass, lowMid, mid, high, onset };
}
