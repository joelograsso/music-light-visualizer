import { describe, it, expect } from 'vitest';
import { meterLevels } from '../../src/ui/meter';
import type { AudioFeatures } from '../../src/types';

function features(p: Partial<AudioFeatures> & { bands?: Partial<AudioFeatures['bands']> } = {}): AudioFeatures {
  return {
    loudness: 0, energy: 0,
    bands: { bass: 0, lowMid: 0, mid: 0, high: 0, ...(p.bands ?? {}) },
    beat: 0, motionSpeed: 1, tempoBpm: null, presence: 0, drop: 0,
    beatPhase: 0, beatConfidence: 0,
    ...p,
  } as AudioFeatures;
}

describe('meterLevels', () => {
  it('returns 5 bars, all within 0..1', () => {
    const out = meterLevels(features({ energy: 1, bands: { bass: 1, lowMid: 1, mid: 1, high: 1 } }));
    expect(out).toHaveLength(5);
    for (const v of out) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });

  it('is ~flat-zero in silence', () => {
    const out = meterLevels(features());
    for (const v of out) expect(v).toBeLessThan(0.01);
  });

  it('rises with a full-spectrum loud signal', () => {
    const quiet = meterLevels(features({ energy: 0.1, bands: { bass: 0.2, lowMid: 0.2, mid: 0.2, high: 0.2 } }));
    const loud = meterLevels(features({ energy: 1, bands: { bass: 1, lowMid: 1, mid: 1, high: 1 } }));
    expect(loud.reduce((a, b) => a + b, 0)).toBeGreaterThan(quiet.reduce((a, b) => a + b, 0));
  });

  it('maps bass to the low bars and high to the top bar', () => {
    const out = meterLevels(features({ energy: 1, bands: { bass: 1, lowMid: 0, mid: 0, high: 0 } }));
    expect(out[0]).toBeGreaterThan(out[4]); // bass bar taller than treble bar
  });

  it('clamps defensively against out-of-range input', () => {
    const out = meterLevels(features({ energy: 1, bands: { bass: -1, lowMid: 5, mid: 0, high: 0 } }));
    for (const v of out) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
});
