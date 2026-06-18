import { ENERGY, BEAT, DROP } from '../../config';
import type { AudioFeatures } from '../../types';
import type { AnalyzedTrack, Drop } from '../offline/types';
import type { FeatureProvider } from './FeatureProvider';
import { computeMotionSpeed } from '../tempo';

/** Linear interpolation of a channel at fractional frame index f, clamped to the ends. */
function interp(ch: Float32Array, f: number): number {
  if (ch.length === 0) return 0;
  if (f <= 0) return ch[0];
  if (f >= ch.length - 1) return ch[ch.length - 1];
  const i = Math.floor(f);
  return ch[i] + (ch[i + 1] - ch[i]) * (f - i);
}

/** Beat pulse + phase from the known beat grid (phase 0 = on the beat). */
function beatAt(beats: Float32Array, t: number): { beat: number; beatPhase: number } {
  if (beats.length < 2 || t <= beats[0] || t >= beats[beats.length - 1]) {
    return { beat: 0, beatPhase: 0 };
  }
  let lo = 0, hi = beats.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (beats[m] <= t) lo = m; else hi = m;
  }
  const period = beats[hi] - beats[lo];
  const phase = period > 0 ? (t - beats[lo]) / period : 0;
  const beat = phase < BEAT.pulseDecayBeats ? 1 - phase / BEAT.pulseDecayBeats : 0;
  return { beat, beatPhase: phase };
}

/** Drop envelope: each drop spikes to its intensity then decays at DROP.decayPerSec. */
function dropAt(drops: Drop[], t: number): number {
  let v = 0;
  for (const d of drops) {
    if (t >= d.time) {
      const e = d.intensity * Math.max(0, 1 - (t - d.time) * DROP.decayPerSec);
      if (e > v) v = e;
    }
  }
  return v;
}

/**
 * Reads a precomputed AnalyzedTrack by playback position to produce AudioFeatures. Energy
 * is derived from stored loudness × live sensitivity (so the slider works for files);
 * everything else is interpolated from channels or looked up from the event grids.
 */
export class AnalyzedFeatureProvider implements FeatureProvider {
  private gain = ENERGY.defaultSensitivity;

  constructor(private track: AnalyzedTrack, private positionSec: () => number) {}

  setSensitivity(value: number): void {
    this.gain = value;
  }

  sample(): AudioFeatures {
    const dur = this.track.duration;
    const raw = this.positionSec();
    const t = dur > 0 ? ((raw % dur) + dur) % dur : 0;
    const f = t * this.track.frameRate;

    const loudness = interp(this.track.loudness, f);
    const presence = interp(this.track.presence, f);
    const bands = {
      bass: interp(this.track.bass, f),
      lowMid: interp(this.track.lowMid, f),
      mid: interp(this.track.mid, f),
      high: interp(this.track.high, f),
    };
    const anticipation = interp(this.track.anticipation, f);

    const scaled = loudness * this.gain;
    const intensity = Math.pow(Math.min(1, scaled / ENERGY.fullScale), ENERGY.dynamicsGamma);
    const energy = presence * intensity;

    const tempoBpm = this.track.tempoBpm > 0 ? this.track.tempoBpm : null;
    const motionSpeed = computeMotionSpeed(energy, tempoBpm);
    let beat: number;
    let beatPhase: number;
    if (this.track.beats.length > 1) {
      ({ beat, beatPhase } = beatAt(this.track.beats, t));
    } else {
      // No beat grid (silent/short track): fall back to a reactive pulse from the onset envelope.
      beat = interp(this.track.onset, f);
      beatPhase = 0;
    }
    const beatConfidence = this.track.beats.length > 1 ? 1 : 0;
    const drop = dropAt(this.track.drops, t);

    return { loudness, energy, bands, beat, motionSpeed, tempoBpm, presence, drop, beatPhase, beatConfidence, anticipation,
      sectionActive: false, sectionBoundary: 0, sectionIntensity: 1 };
  }
}
