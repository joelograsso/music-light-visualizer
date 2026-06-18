import { DROP } from '../config';

/**
 * Detects musical "drops": a sudden energy jump that is EARNED by a preceding build-up.
 *
 * Three gates must all pass:
 *  - Warmup: not within the first seconds of a song (the slow baseline lags during the
 *    ramp-up from silence and would otherwise look like a drop). A sustained gap re-warms.
 *  - Build-up: a "build charge" accumulates while a bass-weighted intensity signal is
 *    steadily rising (leading its own slow reference) and must be high.
 *  - Slam: the fast energy envelope leaps above the slow one, past a high threshold — and
 *    the drop only fires on the RISING EDGE of that jump, so the build must have charged
 *    BEFORE the slam (not during it).
 *
 * Returns a 0..1 envelope that spikes to 1 on a drop and decays, with a cooldown.
 */
export class DropDetector {
  private fast = 0;
  private slow = 0;
  private cooldown = 0;
  private env = 0;
  private sinceSound = 0;
  private quietFor = 0;
  private buildSignal = 0;
  private prevBuildSignal = 0;
  private buildCharge = 0;

  update(energy: number, bass: number, dt: number): number {
    this.fast += (energy - this.fast) * DROP.fastSmooth;
    this.slow += (energy - this.slow) * DROP.slowSmooth;
    this.cooldown = Math.max(0, this.cooldown - dt);

    // Warmup tracking; a sustained gap resets it (new song re-warms).
    if (energy < DROP.quietReset) {
      this.quietFor += dt;
      if (this.quietFor > DROP.gapSec) this.sinceSound = 0;
    } else {
      this.quietFor = 0;
      this.sinceSound += dt;
    }
    const warmedUp = this.sinceSound > DROP.warmupSec;

    // Build-up: charge only while a bass-weighted intensity signal rises at a moderate,
    // sustained slope (a ramp). A sudden jump rises too fast to count, so it can't fake a
    // build; a brief pre-drop silent cut HOLDS the charge (we only decay during sound).
    const sig = (1 - DROP.bassWeight) * energy + DROP.bassWeight * bass;
    this.buildSignal += (sig - this.buildSignal) * DROP.buildSmooth;
    const slope = (this.buildSignal - this.prevBuildSignal) / dt; // per second
    this.prevBuildSignal = this.buildSignal;
    if (slope > DROP.buildSlopeMin && slope < DROP.buildSlopeMax) {
      this.buildCharge = Math.min(1, this.buildCharge + dt / DROP.buildChargeSec);
    } else if (energy >= DROP.quietReset && slope <= 0) {
      this.buildCharge = Math.max(0, this.buildCharge - dt / DROP.buildDecaySec);
    }

    // Slam: a sudden energy jump past a high threshold.
    const slam = this.fast - this.slow > DROP.riseAbove && this.fast > DROP.highThreshold;

    if (warmedUp && this.cooldown === 0 && slam && this.buildCharge >= DROP.buildRequired) {
      this.env = 1;
      this.cooldown = DROP.cooldownSec;
      this.buildCharge = 0; // consume the build; the next drop needs a fresh one
    }

    this.env = Math.max(0, this.env - dt * DROP.decayPerSec);
    return this.env;
  }
}
