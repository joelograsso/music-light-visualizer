import { describe, it, expect } from 'vitest';
import { computeMotionSpeed, estimateTempo } from '../../src/audio/tempo';

describe('computeMotionSpeed', () => {
  it('increases with energy', () => {
    expect(computeMotionSpeed(0.1, null)).toBeLessThan(computeMotionSpeed(0.9, null));
  });
  it('stays within sane bounds', () => {
    const s = computeMotionSpeed(1, 200);
    expect(s).toBeGreaterThan(0.3);
    expect(s).toBeLessThanOrEqual(1.8);
  });
  it('faster tempo nudges speed up', () => {
    expect(computeMotionSpeed(0.5, 80)).toBeLessThan(computeMotionSpeed(0.5, 160));
  });
});

describe('estimateTempo', () => {
  it('returns null with fewer than 4 onsets', () => {
    expect(estimateTempo([0, 0.5, 1.0])).toBeNull();
  });
  it('computes BPM from a steady 0.5s inter-onset interval', () => {
    // 0.5s between beats -> 120 BPM
    expect(estimateTempo([0, 0.5, 1.0, 1.5, 2.0])).toBeCloseTo(120, 0);
  });
  it('folds a slow tempo up into the 70..180 range', () => {
    // 1.5s interval -> 40 BPM -> folded *2 to 80 BPM
    const bpm = estimateTempo([0, 1.5, 3.0, 4.5, 6.0])!;
    expect(bpm).toBeGreaterThanOrEqual(70);
    expect(bpm).toBeLessThanOrEqual(180);
    expect(bpm).toBeCloseTo(80, 0);
  });
});
