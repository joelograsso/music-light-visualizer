import { BAND_EDGES, SMOOTHING, ENERGY } from '../config';
import type { FrequencyBands, AudioFeatures } from '../types';
import { computeMotionSpeed, estimateTempo } from './tempo';
import { DropDetector } from './DropDetector';

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
  private presence = 0;             // 0..1 envelope: is sound present / how warmed-up are we
  private bands: FrequencyBands = { bass: 0, lowMid: 0, mid: 0, high: 0 }; // smoothed for visuals
  /** Loudness gain (sensitivity). Set from the UI to calibrate to the audio level. */
  gain = ENERGY.defaultSensitivity;
  private fluxMean = 0;     // running mean of spectral flux
  private fluxVar = 1e-6;   // running variance
  private onsetTimes: number[] = [];
  private clock = 0;
  private dropDetector = new DropDetector();

  constructor(private sampleRate: number, private fftSize: number) {}

  /**
   * @param data frequency-domain magnitudes (for bands + onset detection)
   * @param rms  time-domain RMS amplitude 0..1 — a TRUE absolute loudness measure.
   *   (Frequency-byte data is auto-scaled to a dB window and registers faint sound as
   *   loud, so loudness must come from the waveform amplitude instead.)
   */
  process(data: Uint8Array, rms: number, dt: number): AudioFeatures {
    this.clock += dt;
    // Smooth the visualized bands so spike/breathing amplitudes ease instead of
    // snapping frame-to-frame on noisy input.
    const raw = computeBands(data, this.sampleRate, this.fftSize);
    this.bands.bass += (raw.bass - this.bands.bass) * ENERGY.bandSmooth;
    this.bands.lowMid += (raw.lowMid - this.bands.lowMid) * ENERGY.bandSmooth;
    this.bands.mid += (raw.mid - this.bands.mid) * ENERGY.bandSmooth;
    this.bands.high += (raw.high - this.bands.high) * ENERGY.bandSmooth;
    const bands: FrequencyBands = { ...this.bands };

    // Loudness = smoothed waveform RMS (genuine amplitude; silence -> ~0).
    this.loudness += (rms - this.loudness) * SMOOTHING.loudness;

    // ABSOLUTE intensity: how loud the music actually is, on a fixed scale (calibrated
    // by `gain`). A steady moderate beat sits low; only genuinely loud sections approach
    // the top. The gamma keeps moderate input mild so there's headroom to build into.
    const scaled = this.loudness * this.gain;
    const intensity = Math.pow(Math.min(1, scaled / ENERGY.fullScale), ENERGY.dynamicsGamma);

    // Presence envelope: gentle intro ramp + silence gate (blank canvas when quiet).
    const present = scaled > ENERGY.silenceThreshold ? 1 : 0;
    const rate = present ? ENERGY.presenceRise : ENERGY.presenceFall;
    this.presence += (present - this.presence) * rate;

    // Energy follows absolute intensity (gated by presence), smoothed so it eases.
    const target = this.presence * intensity;
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
    const drop = this.dropDetector.update(this.energy, dt);

    return {
      loudness: this.loudness, energy: this.energy, bands, beat,
      motionSpeed, tempoBpm, presence: this.presence, drop,
    };
  }
}

