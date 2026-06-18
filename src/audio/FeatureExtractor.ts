import { BAND_EDGES, SMOOTHING } from '../config';
import type { FrequencyBands, AudioFeatures } from '../types';
import { computeMotionSpeed } from './tempo';

export function binForFreq(freq: number, sampleRate: number, fftSize: number): number {
  const binWidth = sampleRate / fftSize;
  return Math.round(freq / binWidth);
}

/** Average normalized (0..1) magnitude across [loHz, hiHz). */
function bandAvg(data: Uint8Array, loHz: number, hiHz: number, sr: number, fft: number): number {
  const lo = binForFreq(loHz, sr, fft);
  const hi = Math.min(data.length - 1, binForFreq(hiHz, sr, fft));
  if (hi <= lo) return 0;
  let sum = 0;
  for (let i = lo; i < hi; i++) sum += data[i] / 255;
  return sum / (hi - lo);
}

export function computeBands(data: Uint8Array, sr: number, fft: number): FrequencyBands {
  return {
    bass: bandAvg(data, 20, BAND_EDGES.bassMax, sr, fft),
    lowMid: bandAvg(data, BAND_EDGES.bassMax, BAND_EDGES.lowMidMax, sr, fft),
    mid: bandAvg(data, BAND_EDGES.lowMidMax, BAND_EDGES.midMax, sr, fft),
    high: bandAvg(data, BAND_EDGES.midMax, BAND_EDGES.highMax, sr, fft),
  };
}

export class FeatureExtractor {
  private prev: Float32Array | null = null;
  private loudness = 0;
  private energy = 0;
  private fluxMean = 0;     // running mean of spectral flux
  private fluxVar = 1e-6;   // running variance
  private onsetTimes: number[] = [];
  private clock = 0;

  constructor(private sampleRate: number, private fftSize: number) {}

  process(data: Uint8Array, dt: number): AudioFeatures {
    this.clock += dt;
    const bands = computeBands(data, this.sampleRate, this.fftSize);

    // instantaneous loudness = mean normalized magnitude
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] / 255;
    const inst = sum / data.length;
    this.loudness += (inst - this.loudness) * SMOOTHING.loudness;
    this.energy += (this.loudness - this.energy) * SMOOTHING.energy;

    // spectral flux onset detection
    let flux = 0;
    if (this.prev) {
      for (let i = 0; i < data.length; i++) {
        const d = data[i] / 255 - this.prev[i];
        if (d > 0) flux += d;
      }
      flux /= data.length;
    }
    if (!this.prev) this.prev = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) this.prev[i] = data[i] / 255;

    // adaptive threshold via running mean/std
    const alpha = 0.05;
    const diff = flux - this.fluxMean;
    this.fluxMean += alpha * diff;
    this.fluxVar += alpha * (diff * diff - this.fluxVar);
    const std = Math.sqrt(this.fluxVar) + 1e-6;
    const z = (flux - this.fluxMean) / std;
    let beat = 0;
    if (z > 1.5) {
      beat = Math.min(1, (z - 1.5) / 3);
      const last = this.onsetTimes[this.onsetTimes.length - 1];
      if (last === undefined || this.clock - last > 0.12) {
        this.onsetTimes.push(this.clock);
        if (this.onsetTimes.length > 16) this.onsetTimes.shift();
      }
    }

    const tempoBpm = estimateTempo(this.onsetTimes);
    const motionSpeed = computeMotionSpeed(this.energy, tempoBpm);

    return { loudness: this.loudness, energy: this.energy, bands, beat, motionSpeed, tempoBpm };
  }
}

/** Median inter-onset interval -> BPM, or null if too few onsets. */
export function estimateTempo(onsetTimes: number[]): number | null {
  if (onsetTimes.length < 4) return null;
  const intervals: number[] = [];
  for (let i = 1; i < onsetTimes.length; i++) intervals.push(onsetTimes[i] - onsetTimes[i - 1]);
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  if (median <= 0) return null;
  let bpm = 60 / median;
  while (bpm < 70) bpm *= 2;   // fold into a musical range
  while (bpm > 180) bpm /= 2;
  return bpm;
}
