import { describe, it, expect } from 'vitest';
import { DropDetector } from '../../src/audio/DropDetector';

const FPS = 1 / 0.016;

/** Hold a steady level (bass tracks energy). */
function hold(d: DropDetector, energy: number, seconds: number): void {
  const n = Math.round(seconds * FPS);
  for (let i = 0; i < n; i++) d.update(energy, energy * 0.85, 0.016);
}

/** A build-up: energy/bass ramp up over `seconds`. */
function build(d: DropDetector, from: number, to: number, seconds: number): void {
  const n = Math.round(seconds * FPS);
  for (let i = 0; i < n; i++) {
    const e = from + (to - from) * (i / n);
    d.update(e, e * 0.85, 0.016);
  }
}

/** Run a slam for ~`seconds` and return the peak drop envelope. */
function slamPeak(d: DropDetector, energy: number, seconds: number): number {
  const n = Math.round(seconds * FPS);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, d.update(energy, energy * 0.8, 0.016));
  return peak;
}

describe('DropDetector', () => {
  it('fires when a slam is preceded by a build-up (after warmup)', () => {
    const d = new DropDetector();
    hold(d, 0.3, 11);          // groove past the warmup
    build(d, 0.3, 0.6, 2.5);   // build-up
    expect(slamPeak(d, 0.95, 0.7)).toBeGreaterThan(0.9);
  });

  it('does NOT fire on a sudden slam with NO build-up', () => {
    const d = new DropDetector();
    hold(d, 0.3, 11);          // steady groove, no build
    expect(slamPeak(d, 0.9, 1.0)).toBeLessThan(0.5);
  });

  it('does NOT fire during a song’s opening seconds (warmup), even with a build', () => {
    const d = new DropDetector();
    build(d, 0.2, 0.6, 2.5);   // build, but only ~2.5s into the song
    expect(slamPeak(d, 0.95, 0.7)).toBeLessThan(0.5);
  });

  it('does NOT fire on the intro ramp-up from silence', () => {
    const d = new DropDetector();
    let peak = 0;
    for (let i = 0; i < 180; i++) {
      const e = Math.min(0.9, (i / 180) * 0.9);
      peak = Math.max(peak, d.update(e, e * 0.85, 0.016));
    }
    expect(peak).toBeLessThan(0.5);
  });

  it('does NOT fire on a slow gradual ramp (no distinct slam)', () => {
    const d = new DropDetector();
    hold(d, 0.2, 11);
    let peak = 0;
    for (let i = 0; i < 600; i++) {
      const e = Math.min(0.9, 0.2 + (i / 600) * 0.7);
      peak = Math.max(peak, d.update(e, e * 0.85, 0.016));
    }
    expect(peak).toBeLessThan(0.5);
  });

  it('re-warms after a sustained silence (treats it as a new song)', () => {
    const d = new DropDetector();
    hold(d, 0.4, 11);
    hold(d, 0.0, 2);           // sustained gap -> re-warm
    build(d, 0.4, 0.6, 1);     // new song, still warming
    expect(slamPeak(d, 0.95, 0.7)).toBeLessThan(0.5);
  });

  it('survives a brief pre-drop silence (does not re-warm)', () => {
    const d = new DropDetector();
    hold(d, 0.4, 11);
    build(d, 0.4, 0.6, 2);
    hold(d, 0.0, 0.5);         // brief silence right before the drop (< gapSec)
    expect(slamPeak(d, 0.95, 0.7)).toBeGreaterThan(0.9);
  });

  it('respects the cooldown — only one spike per drop', () => {
    const d = new DropDetector();
    hold(d, 0.3, 11);
    build(d, 0.3, 0.6, 2);
    let spikes = 0;
    let prev = 0;
    for (let i = 0; i < 120; i++) {
      const e = d.update(0.95, 0.8, 0.016);
      if (prev < 0.5 && e > 0.95) spikes++;
      prev = e;
    }
    expect(spikes).toBe(1);
  });
});
