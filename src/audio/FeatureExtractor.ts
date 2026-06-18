import { BAND_EDGES, SMOOTHING, ENERGY, TEMPO } from '../config';
import type { FrequencyBands, AudioFeatures } from '../types';
import { computeMotionSpeed } from './tempo';
import { DropDetector } from './DropDetector';
import { OnsetDetector } from './OnsetDetector';
import { OnsetEnvelope } from './OnsetEnvelope';
import { estimateTempo } from './TempoEstimator';
import { BeatTracker } from './BeatTracker';

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
  private loudness = 0;
  private energy = 0;
  private presence = 0;
  private bands: FrequencyBands = { bass: 0, lowMid: 0, mid: 0, high: 0 };
  /** Loudness gain (sensitivity). Set from the UI to calibrate to the audio level. */
  gain = ENERGY.defaultSensitivity;
  private bpm = 0;
  private beatEnv = 0;
  private onset: OnsetDetector;
  private onsetEnv = new OnsetEnvelope(TEMPO.rateHz, TEMPO.seconds);
  private beatTracker = new BeatTracker();
  private dropDetector = new DropDetector();

  constructor(private sampleRate: number, private fftSize: number) {
    this.onset = new OnsetDetector(sampleRate, fftSize);
  }

  /**
   * @param data frequency-domain magnitudes (bands + onset detection)
   * @param rms  time-domain RMS amplitude 0..1 (absolute loudness)
   */
  process(data: Uint8Array, rms: number, dt: number): AudioFeatures {
    // Smoothed visualized bands (so spike/breathing amplitudes ease, not snap).
    const raw = computeBands(data, this.sampleRate, this.fftSize);
    this.bands.bass += (raw.bass - this.bands.bass) * ENERGY.bandSmooth;
    this.bands.lowMid += (raw.lowMid - this.bands.lowMid) * ENERGY.bandSmooth;
    this.bands.mid += (raw.mid - this.bands.mid) * ENERGY.bandSmooth;
    this.bands.high += (raw.high - this.bands.high) * ENERGY.bandSmooth;
    const bands: FrequencyBands = { ...this.bands };

    // Loudness = smoothed waveform RMS (true absolute amplitude).
    this.loudness += (rms - this.loudness) * SMOOTHING.loudness;

    // Absolute intensity (sensitivity-scaled, gamma-shaped).
    const scaled = this.loudness * this.gain;
    const intensity = Math.pow(Math.min(1, scaled / ENERGY.fullScale), ENERGY.dynamicsGamma);

    // Presence: gentle intro ramp + silence gate (blank canvas when quiet).
    const present = scaled > ENERGY.silenceThreshold ? 1 : 0;
    const pRate = present ? ENERGY.presenceRise : ENERGY.presenceFall;
    this.presence += (present - this.presence) * pRate;

    // Energy: attack/release envelope — prompt on swells, smooth on the decay.
    const target = this.presence * intensity;
    const eRate = target > this.energy ? ENERGY.energyAttack : ENERGY.energyRelease;
    this.energy += (target - this.energy) * eRate;

    // Clean kick-focused onset detection; feed the fixed-rate envelope for tempo.
    const onsetRes = this.onset.process(data, dt);
    this.onsetEnv.push(onsetRes.odf, dt);

    // Reactive onset envelope: jump on a detected onset, decay quickly.
    if (onsetRes.onset) this.beatEnv = Math.max(this.beatEnv, Math.max(0.7, onsetRes.strength));
    this.beatEnv = Math.max(0, this.beatEnv - dt * 4.5);

    // Tempo via autocorrelation of the onset envelope (stable), smoothed.
    const tempo = estimateTempo(this.onsetEnv.values, TEMPO.rateHz, TEMPO.minBpm, TEMPO.maxBpm);
    let tempoConf = 0;
    if (tempo) {
      this.bpm = this.bpm > 0 ? this.bpm + (tempo.bpm - this.bpm) * TEMPO.smooth : tempo.bpm;
      tempoConf = tempo.confidence;
    }
    const tempoBpm = this.bpm > 0 ? this.bpm : null;

    // Phase-locked beat tracker -> a predicted, on-grid beat pulse.
    const beatPeriod = this.bpm > 0 ? 60 / this.bpm : 0;
    this.beatTracker.update(dt, beatPeriod, onsetRes.onset, onsetRes.strength, tempoConf);
    const beatPhase = this.beatTracker.beatPhase;
    const beatConfidence = this.beatTracker.beatConfidence;

    // Blend: when the beat is confident, drive `beat` from the PREDICTED on-grid pulse;
    // when it's not, fall back to the reactive onset envelope. So beat-driven effects
    // snap to the grid when there's a clear beat and stay reactive otherwise.
    const beat = this.beatEnv * (1 - beatConfidence) + this.beatTracker.beatPulse * beatConfidence;

    const motionSpeed = computeMotionSpeed(this.energy, tempoBpm);
    const drop = this.dropDetector.update(this.energy, dt);

    return {
      loudness: this.loudness, energy: this.energy, bands, beat,
      motionSpeed, tempoBpm, presence: this.presence, drop,
      beatPhase, beatConfidence,
    };
  }
}
