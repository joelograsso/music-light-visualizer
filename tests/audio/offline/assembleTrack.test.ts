import { describe, it, expect } from 'vitest';
import { assembleTrack } from '../../../src/audio/offline/assembleTrack';

function ramp(n: number, fn: (i: number) => number): Float32Array {
  const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = fn(i); return a;
}

describe('assembleTrack', () => {
  it('assembles a full AnalyzedTrack from raw channels + beats', () => {
    const frameRate = 100, n = 400;
    const t = assembleTrack({
      duration: 4, sampleRate: 44100, frameRate, tempoBpm: 120,
      loudness: ramp(n, () => 0.5),
      bass: ramp(n, (i) => (i % 50 === 0 ? 1 : 0)),
      lowMid: ramp(n, () => 0.1), mid: ramp(n, () => 0.1), high: ramp(n, () => 0.1),
      onset: ramp(n, (i) => (i % 50 === 0 ? 1 : 0)),
      beats: Float32Array.from([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]),
    });
    expect(t.tempoBpm).toBe(120);
    expect(t.duration).toBe(4);
    expect(t.beats.length).toBe(8);
    for (const ch of [t.loudness, t.presence, t.bass, t.lowMid, t.mid, t.high, t.onset, t.anticipation]) {
      expect(ch.length).toBe(n);
    }
    expect(t.downbeats.length).toBeGreaterThan(0);
    for (const d of t.downbeats) expect(Array.from(t.beats)).toContain(d);
    expect(t.presence[200]).toBeGreaterThan(0);
  });

  it('produces finite channels and no downbeats when there are no beats', () => {
    const n = 100;
    const t = assembleTrack({
      duration: 1, sampleRate: 44100, frameRate: 100, tempoBpm: 0,
      loudness: ramp(n, () => 0.3), bass: ramp(n, () => 0.2),
      lowMid: ramp(n, () => 0), mid: ramp(n, () => 0), high: ramp(n, () => 0),
      onset: ramp(n, () => 0), beats: Float32Array.from([]),
    });
    for (const v of t.bass) expect(Number.isFinite(v)).toBe(true);
    expect(t.downbeats.length).toBe(0);
  });
});
