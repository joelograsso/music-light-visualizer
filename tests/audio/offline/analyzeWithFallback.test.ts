import { describe, it, expect } from 'vitest';
import { analyzeWithFallback } from '../../../src/audio/offline/analyzeWithFallback';
import type { AnalyzedTrack } from '../../../src/audio/offline/types';

const fakeTrack = (tag: number): AnalyzedTrack => ({
  duration: 1, sampleRate: 44100, frameRate: 100, tempoBpm: tag,
  loudness: new Float32Array(1), presence: new Float32Array(1),
  bass: new Float32Array(1), lowMid: new Float32Array(1), mid: new Float32Array(1), high: new Float32Array(1),
  onset: new Float32Array(1), anticipation: new Float32Array(1),
  beats: new Float32Array(0), downbeats: new Float32Array(0), drops: [], sections: [],
});

describe('analyzeWithFallback', () => {
  it('uses the essentia result when it succeeds', async () => {
    const t = await analyzeWithFallback(new Float32Array(10), 44100,
      async () => fakeTrack(1), () => fakeTrack(2));
    expect(t.tempoBpm).toBe(1);
  });

  it('falls back to the pure analyzer when essentia throws', async () => {
    const t = await analyzeWithFallback(new Float32Array(10), 44100,
      async () => { throw new Error('wasm boom'); }, () => fakeTrack(2));
    expect(t.tempoBpm).toBe(2);
  });

  it('passes through progress and forwards args', async () => {
    let seen = 0;
    await analyzeWithFallback(new Float32Array(10), 48000,
      async (_c, sr, p) => { p?.(1); expect(sr).toBe(48000); return fakeTrack(sr); },
      () => fakeTrack(0), (pct) => { seen = pct; });
    expect(seen).toBe(1);
  });
});
