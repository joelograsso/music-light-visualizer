import { describe, it, expect } from 'vitest';
import { AnalyzedFeatureProvider } from '../../../src/audio/providers/AnalyzedFeatureProvider';
import type { AnalyzedTrack } from '../../../src/audio/offline/types';

function track(over: Partial<AnalyzedTrack> = {}): AnalyzedTrack {
  const z = (vals: number[]) => Float32Array.from(vals);
  return {
    duration: 2, sampleRate: 44100, frameRate: 1, tempoBpm: 120,
    loudness: z([0, 1, 0]), presence: z([1, 1, 1]),
    bass: z([0, 1, 0]), lowMid: z([0, 0, 0]), mid: z([0, 0, 0]), high: z([0, 0, 0]),
    onset: z([0, 0, 0]), anticipation: z([0, 0.5, 1]),
    beats: z([0, 0.5, 1, 1.5]), downbeats: z([0]), drops: [],
    ...over,
  };
}

describe('AnalyzedFeatureProvider', () => {
  it('linearly interpolates channels between frames', () => {
    let t = 0.5; // frameRate 1 -> frame 0.5, halfway between loudness[0]=0 and [1]=1
    const p = new AnalyzedFeatureProvider(track(), () => t);
    expect(p.sample().loudness).toBeCloseTo(0.5, 5);
    expect(p.sample().anticipation).toBeCloseTo(0.25, 5);
  });

  it('reports beat phase ~0.5 midway between beats', () => {
    let t = 0.25; // between beats 0 and 0.5
    const p = new AnalyzedFeatureProvider(track(), () => t);
    expect(p.sample().beatPhase).toBeCloseTo(0.5, 2);
  });

  it('fires and decays a drop after its time', () => {
    const t0 = track({ drops: [{ time: 1, intensity: 1, buildStart: 0 }] });
    let t = 0.5;
    const p = new AnalyzedFeatureProvider(t0, () => t);
    expect(p.sample().drop).toBe(0);     // before the drop
    t = 1.0; expect(p.sample().drop).toBeGreaterThan(0.9); // at the drop
    t = 1.0 + 5; expect(p.sample().drop).toBe(0);          // long after -> decayed
  });

  it('applies sensitivity to energy (loudness below full scale gives headroom)', () => {
    // loudness 0.05 is well under ENERGY.fullScale (0.3), so raising the gain raises energy
    const lowLoud = track({ loudness: Float32Array.from([0, 0.05, 0]) });
    let t = 1;
    const p = new AnalyzedFeatureProvider(lowLoud, () => t);
    const lo = p.sample().energy;
    p.setSensitivity(2.5);
    const hi = p.sample().energy;
    expect(hi).toBeGreaterThan(lo);
    expect(lo).toBeGreaterThan(0);
  });

  it('wraps the playback position for looping', () => {
    let t = 2.5; // duration 2 -> wraps to 0.5
    const p = new AnalyzedFeatureProvider(track(), () => t);
    expect(p.sample().loudness).toBeCloseTo(0.5, 5);
  });

  it('falls back to a reactive beat from the onset channel when there is no beat grid', () => {
    const noGrid = track({ beats: Float32Array.from([]), onset: Float32Array.from([0, 1, 0]) });
    let t = 1; // frameRate 1 -> frame 1 -> onset[1] = 1
    const p = new AnalyzedFeatureProvider(noGrid, () => t);
    const f = p.sample();
    expect(f.beat).toBeCloseTo(1, 5);
    expect(f.beatConfidence).toBe(0);
  });
});
