import { describe, it, expect } from 'vitest';
import { computeStft } from '../../../src/audio/offline/stft';
import { computeFeatureTimeline } from '../../../src/audio/offline/featureTimeline';

function sine(freq: number, sr: number, n: number): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * freq * i) / sr);
  return x;
}

describe('computeFeatureTimeline', () => {
  it('puts a low tone in the bass band, not the high band', () => {
    const sr = 8000, n = 8192;
    const tl = computeFeatureTimeline(computeStft(sine(80, sr, n), 2048, 512), sr, 2048);
    const mid = tl.bass.length >> 1;
    expect(tl.bass[mid]).toBeGreaterThan(tl.high[mid]);
    expect(tl.loudness[mid]).toBeGreaterThan(0.3);
  });

  it('puts a high tone in the high band, not the bass band', () => {
    const sr = 16000, n = 8192;
    const tl = computeFeatureTimeline(computeStft(sine(5000, sr, n), 2048, 512), sr, 2048);
    const mid = tl.high.length >> 1;
    expect(tl.high[mid]).toBeGreaterThan(tl.bass[mid]);
  });

  it('reports ~0 loudness and bands for silence', () => {
    const sr = 8000, n = 8192;
    const tl = computeFeatureTimeline(computeStft(new Float32Array(n), 2048, 512), sr, 2048);
    const mid = tl.loudness.length >> 1;
    expect(tl.loudness[mid]).toBeCloseTo(0, 5);
    expect(tl.bass[mid]).toBeCloseTo(0, 5);
  });

  it('onset is normalized to 0..1', () => {
    const sr = 8000, n = 8192;
    const tl = computeFeatureTimeline(computeStft(sine(80, sr, n), 2048, 512), sr, 2048);
    for (const v of tl.onset) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
});
