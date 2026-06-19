import { describe, it, expect } from 'vitest';
import { cosineSimilarity, beatSyncFeatures, noveltyCurve, pickPeaks } from '../../../src/audio/offline/segmentation';

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors and ~0 for orthogonal', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
  it('is 0 when either vector is all zeros', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('beatSyncFeatures', () => {
  it('averages per-frame vectors within each beat interval', () => {
    // frameRate 1; frames: [1],[1],[2],[2],[9]; beats at 0,2,4
    const byFrame = [[1], [1], [2], [2], [9]];
    const beats = Float32Array.from([0, 2, 4]);
    const out = beatSyncFeatures(byFrame, 1, beats);
    expect(out.length).toBe(2);          // one vector per beat interval
    expect(out[0][0]).toBeCloseTo(1, 6); // frames 0..1
    expect(out[1][0]).toBeCloseTo(2, 6); // frames 2..3
  });
});

describe('noveltyCurve + pickPeaks', () => {
  it('peaks at a block change and pickPeaks finds it', () => {
    // 40 beats: first 20 = vector A, next 20 = vector B (orthogonal)
    const feats: number[][] = [];
    for (let i = 0; i < 40; i++) feats.push(i < 20 ? [1, 0] : [0, 1]);
    const nov = noveltyCurve(feats, 16);
    expect(nov.length).toBe(40);
    // the strongest novelty is near the block boundary (beat 20)
    let arg = 0; for (let i = 1; i < nov.length; i++) if (nov[i] > nov[arg]) arg = i;
    expect(Math.abs(arg - 20)).toBeLessThanOrEqual(2);
    const peaks = pickPeaks(nov, 4, 1.5);
    expect(peaks.some((p) => Math.abs(p - 20) <= 2)).toBe(true);
  });

  it('finds no interior peaks in a uniform sequence', () => {
    const feats: number[][] = [];
    for (let i = 0; i < 40; i++) feats.push([1, 1]);
    const peaks = pickPeaks(noveltyCurve(feats, 16), 4, 1.5);
    expect(peaks.length).toBe(0);
  });
});
