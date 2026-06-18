import { describe, it, expect } from 'vitest';
import { mixToMono } from '../../../src/audio/offline/mixToMono';

describe('mixToMono', () => {
  it('averages stereo channels', () => {
    const out = mixToMono([Float32Array.from([1, 0]), Float32Array.from([0, 1])], 2);
    expect(out[0]).toBeCloseTo(0.5);
    expect(out[1]).toBeCloseTo(0.5);
  });
  it('cancels opposite channels', () => {
    const out = mixToMono([Float32Array.from([1, 1]), Float32Array.from([-1, -1])], 2);
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(0);
  });
  it('passes a single channel through', () => {
    const out = mixToMono([Float32Array.from([0.2, 0.4, 0.6])], 3);
    expect(out[0]).toBeCloseTo(0.2);
    expect(out[1]).toBeCloseTo(0.4);
    expect(out[2]).toBeCloseTo(0.6);
  });
  it('returns zeros for no channels', () => {
    const out = mixToMono([], 2);
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(0);
  });
});
