import { describe, it, expect } from 'vitest';
import { trackBeats } from '../../../src/audio/offline/beatGrid';

function pulses(frameRate: number, seconds: number, bpm: number, drop?: number): Float32Array {
  const n = Math.round(frameRate * seconds);
  const period = Math.round((60 / bpm) * frameRate);
  const env = new Float32Array(n);
  let b = 0;
  for (let i = 0; i < n; i += period, b++) if (b !== drop) env[i] = 1;
  return env;
}

const nearestGap = (beats: Float32Array, t: number) => {
  let g = Infinity;
  for (const b of beats) g = Math.min(g, Math.abs(b - t));
  return g;
};

describe('trackBeats', () => {
  it('places beats on a clean pulse train at the right spacing', () => {
    const frameRate = 100, bpm = 120; // period = 50 frames = 0.5s
    const beats = trackBeats(pulses(frameRate, 8, bpm), frameRate, bpm);
    expect(beats.length).toBeGreaterThanOrEqual(14);
    expect(beats.length).toBeLessThanOrEqual(17);
    for (const t of beats) expect(nearestGap(Float32Array.from([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5]), t)).toBeLessThan(0.06);
  });

  it('still places a beat across a missing onset (the DP win)', () => {
    const frameRate = 100, bpm = 120;
    const beats = trackBeats(pulses(frameRate, 8, bpm, 8), frameRate, bpm); // delete the 8th pulse (t=4.0s)
    expect(nearestGap(beats, 4.0)).toBeLessThan(0.06);
  });

  it('returns empty for an empty signal or unknown tempo', () => {
    expect(trackBeats(new Float32Array(0), 100, 120).length).toBe(0);
    expect(trackBeats(new Float32Array(100), 100, 0).length).toBe(0);
  });
});
