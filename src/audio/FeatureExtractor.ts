import { BAND_EDGES, SMOOTHING, ENERGY } from '../config';
import type { FrequencyBands, AudioFeatures } from '../types';
import { computeMotionSpeed, estimateTempo } from './tempo';

export function binForFreq(freq: number, sampleRate: number, fftSize: number): number {
  const binWidth = sampleRate / fftSize;
  return Math.round(freq / binWidth);
}

/** Average normalized (0..1) magnitude across [loHz, hiHz). */
function bandAvg(data: Uint8Array, loHz: number, hiHz: number, sr: number, fft: number): number {
  const lo = binForFreq(loHz, sr, fft);
  const hi = Math.min(data.length, binForFreq(hiHz, sr, fft));
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
  private peak = ENERGY.peakFloor;  // adaptive loudness peak (auto-gain reference)
  private presence = 0;             // 0..1 envelope: is sound present / how warmed-up are we
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

    // Slow auto-gain reference: rises gradually toward sustained loudness and decays
    // even more slowly, floored. Because it moves slowly, a single transient (a key
    // tap) can't set the gain, and quiet-but-sustained music still lifts the reference.
    const targetPeak = Math.max(this.loudness, ENERGY.peakFloor);
    const peakRate = targetPeak > this.peak ? ENERGY.peakRise : ENERGY.peakFall;
    this.peak += (targetPeak - this.peak) * peakRate;
    const dynamics = Math.min(1, this.loudness / this.peak); // 0..1 relative loudness

    // Presence envelope: needs SUSTAINED sound to ramp (sparse noise stays low) and
    // only recedes toward 0 during genuine silence. This is the progressive build.
    const present = this.loudness > ENERGY.silenceThreshold ? 1 : 0;
    const rate = present ? ENERGY.presenceRise : ENERGY.presenceFall;
    this.presence += (present - this.presence) * rate;

    // Energy target = presence-scaled baseline floor plus normalized dynamics on top.
    // Tracked SLOWLY so the staged energy builds progressively and rejects momentary
    // spikes — the visible core size and layer gates change smoothly, not jitterily.
    const target = this.presence * (ENERGY.baseline + (1 - ENERGY.baseline) * dynamics);
    this.energy += (target - this.energy) * ENERGY.energySmooth;

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

