import { BEAT } from '../config';

/**
 * Phase-locked beat tracker (PLL). A phase accumulator advances at the detected tempo;
 * incoming onsets nudge the phase so predicted beats line up with the music. Exposes a
 * continuous beat phase (0 = on the beat), a beat pulse that peaks on each predicted
 * beat, and a confidence. This lets visuals fire ON the beat grid predictively rather
 * than reacting after each onset.
 */
export class BeatTracker {
  private phase = 0; // 0..1 within the current beat
  private pulse = 0; // decaying envelope, 1 at the beat
  private confidence = 0;
  /** True only on the frame a predicted beat occurs. */
  beatNow = false;

  /**
   * @param beatPeriod   seconds per beat (60/bpm); 0 if tempo unknown
   * @param onset        a beat onset was detected this frame
   * @param strength     onset strength 0..1
   * @param tempoConfidence 0..1 from the tempo estimator
   */
  update(dt: number, beatPeriod: number, onset: boolean, strength: number, tempoConfidence: number): void {
    this.confidence += (tempoConfidence - this.confidence) * BEAT.confidenceSmooth;
    this.beatNow = false;

    if (beatPeriod <= 0) {
      this.pulse = Math.max(0, this.pulse - dt * 4);
      return;
    }

    this.phase += dt / beatPeriod;
    if (this.phase >= 1) {
      this.phase -= 1;
      this.beatNow = true;
      this.pulse = 1;
    }

    // PLL: pull the phase toward this onset so the beat grid aligns to the music.
    if (onset && strength > BEAT.onsetMinStrength) {
      const e = this.phase <= 0.5 ? this.phase : this.phase - 1; // signed distance to nearest beat
      this.phase -= e * BEAT.pllGain * strength;
      if (this.phase < 0) this.phase += 1;
      else if (this.phase >= 1) this.phase -= 1;
    }

    this.pulse = Math.max(0, this.pulse - dt / (beatPeriod * BEAT.pulseDecayBeats));
  }

  get beatPhase(): number { return this.phase; }
  get beatPulse(): number { return this.pulse; }
  get beatConfidence(): number { return this.confidence; }
}
