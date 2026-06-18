/**
 * Resamples a per-frame onset-strength signal (sampled at the variable animation
 * frame rate) into a fixed-rate envelope, so tempo/beat analysis is independent of
 * frame rate. Each fixed-rate bin keeps the PEAK value seen within it, so sharp
 * onsets survive instead of being averaged away. Backed by a capped ring of samples.
 */
export class OnsetEnvelope {
  readonly rateHz: number;
  private size: number;
  private samples: number[] = [];
  private timeAcc = 0;
  private binPeak = 0;

  constructor(rateHz = 100, seconds = 6) {
    this.rateHz = rateHz;
    this.size = Math.round(rateHz * seconds);
  }

  push(odf: number, dt: number): void {
    this.binPeak = Math.max(this.binPeak, odf);
    this.timeAcc += dt;
    const binDur = 1 / this.rateHz;
    while (this.timeAcc >= binDur) {
      this.timeAcc -= binDur;
      this.samples.push(this.binPeak);
      if (this.samples.length > this.size) this.samples.shift();
      this.binPeak = 0;
    }
  }

  get values(): number[] {
    return this.samples;
  }

  get length(): number {
    return this.samples.length;
  }
}
