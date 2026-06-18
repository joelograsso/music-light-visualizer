import { describe, it, expect } from 'vitest';
import { LiveFeatureProvider } from '../../../src/audio/providers/LiveFeatureProvider';

function fakeAnalyser(fill: number, time: number): AnalyserNode {
  return {
    frequencyBinCount: 1024,
    fftSize: 2048,
    getByteFrequencyData: (a: Uint8Array) => a.fill(fill),
    getByteTimeDomainData: (a: Uint8Array) => a.fill(time),
  } as unknown as AnalyserNode;
}

describe('LiveFeatureProvider', () => {
  it('reads silence as ~0 loudness and includes anticipation: 0', () => {
    const p = new LiveFeatureProvider(fakeAnalyser(0, 128), 44100, 2048, 1);
    const f = p.sample();
    expect(f.loudness).toBeCloseTo(0, 2);
    expect(f.anticipation).toBe(0);
    expect(f.drop).toBe(0);
  });

  it('setSensitivity does not throw and sampling stays well-formed', () => {
    const p = new LiveFeatureProvider(fakeAnalyser(200, 200), 44100, 2048, 1);
    p.setSensitivity(2);
    const f = p.sample();
    expect(Number.isFinite(f.energy)).toBe(true);
    expect(f.bands.bass).toBeGreaterThanOrEqual(0);
  });
});
