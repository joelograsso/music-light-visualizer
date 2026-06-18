import { describe, it, expect } from 'vitest';
import { computeMotionSpeed } from '../../src/audio/tempo';

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
