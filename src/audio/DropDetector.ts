import { DROP } from '../config';

/**
 * Detects musical "drops" — sudden jumps in energy, as opposed to gradual builds.
 * Compares a fast and a slow energy envelope: when the fast one leaps well above the
 * slow one (the "sudden" test) past a high threshold, it fires. Returns a 0..1
 * envelope that spikes to 1 on a drop and decays, with a cooldown between drops.
 *
 * A warmup gate suppresses drops for the first seconds after a song's sound begins,
 * where the slow envelope's lag during the ramp-up from silence would otherwise look
 * like a drop. A sustained silence (a gap between songs) re-arms the warmup.
 */
export class DropDetector {
  private fast = 0;
  private slow = 0;
  private cooldown = 0;
  private env = 0;
  private sinceSound = 0; // time since this song's sound began
  private quietFor = 0;   // consecutive time below the silence level

  update(energy: number, dt: number): number {
    this.fast += (energy - this.fast) * DROP.fastSmooth;
    this.slow += (energy - this.slow) * DROP.slowSmooth;
    this.cooldown = Math.max(0, this.cooldown - dt);

    // Track time since sound began; a sustained gap resets it (new song re-warms).
    if (energy < DROP.quietReset) {
      this.quietFor += dt;
      if (this.quietFor > DROP.gapSec) this.sinceSound = 0;
    } else {
      this.quietFor = 0;
      this.sinceSound += dt;
    }
    const warmedUp = this.sinceSound > DROP.warmupSec;

    if (
      warmedUp &&
      this.cooldown === 0 &&
      this.fast > DROP.highThreshold &&
      this.fast - this.slow > DROP.riseAbove
    ) {
      this.env = 1;
      this.cooldown = DROP.cooldownSec;
    }

    this.env = Math.max(0, this.env - dt * DROP.decayPerSec);
    return this.env;
  }
}
