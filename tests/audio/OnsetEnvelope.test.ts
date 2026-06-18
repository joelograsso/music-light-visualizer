import { describe, it, expect } from 'vitest';
import { OnsetEnvelope } from '../../src/audio/OnsetEnvelope';

describe('OnsetEnvelope', () => {
  it('resamples per-frame values into fixed-rate bins', () => {
    const env = new OnsetEnvelope(100, 6); // 100 Hz, 6s
    // feed 1 second of frames at 60fps
    for (let i = 0; i < 60; i++) env.push(0.5, 1 / 60);
    // ~100 bins should exist after 1s
    expect(env.length).toBeGreaterThanOrEqual(95);
    expect(env.length).toBeLessThanOrEqual(105);
  });

  it('caps history at the configured length', () => {
    const env = new OnsetEnvelope(100, 2); // 200 bins max
    for (let i = 0; i < 60 * 5; i++) env.push(0.3, 1 / 60); // 5 seconds
    expect(env.length).toBeLessThanOrEqual(200);
  });

  it('keeps the peak ODF within each bin (onsets are not averaged away)', () => {
    const env = new OnsetEnvelope(100, 6);
    // within one 10ms bin at 1000fps, a single spike should survive
    for (let i = 0; i < 10; i++) env.push(i === 5 ? 1 : 0, 1 / 1000);
    expect(Math.max(...env.values)).toBeGreaterThan(0.9);
  });
});
