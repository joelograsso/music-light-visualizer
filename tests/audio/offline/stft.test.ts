import { describe, it, expect } from 'vitest';
import { hannWindow, frameCount, computeStft } from '../../../src/audio/offline/stft';

describe('frameCount', () => {
  it('counts hop frames that fit', () => {
    expect(frameCount(2048 + 512 * 3, 2048, 512)).toBe(4);
    expect(frameCount(4096, 2048, 512)).toBe(5);
  });
  it('is 0 when the signal is shorter than one frame', () => {
    expect(frameCount(1000, 2048, 512)).toBe(0);
  });
});

describe('hannWindow', () => {
  it('is 0 at the edges and peaks near 1 at the center', () => {
    const w = hannWindow(64);
    expect(w[0]).toBeCloseTo(0, 6);
    expect(w[63]).toBeCloseTo(0, 6);
    const max = Math.max(...w);
    expect(max).toBeGreaterThan(0.99);
    expect(max).toBeLessThanOrEqual(1);
  });
});

describe('computeStft', () => {
  it('produces magnitude frames of length fftSize/2 and per-frame RMS', () => {
    const sr = 8000, n = 4096;
    const sig = new Float32Array(n);
    for (let i = 0; i < n; i++) sig[i] = Math.sin((2 * Math.PI * 200 * i) / sr);
    const s = computeStft(sig, 2048, 512);
    expect(s.frameCount).toBe(frameCount(n, 2048, 512));
    expect(s.frames.length).toBe(s.frameCount);
    expect(s.frames[0].length).toBe(1024);
    expect(s.rms[0]).toBeGreaterThan(0.3); // ~0.707 for a full-amplitude sine
  });
});
