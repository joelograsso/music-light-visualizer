import { describe, it, expect } from 'vitest';
import { analyzeTrack } from '../../../src/audio/offline/analyzeTrack';

/** A synthetic 120 BPM kick track: a short decaying low-sine burst on each beat. */
function kickTrack(sr: number, seconds: number, bpm: number): Float32Array {
  const n = sr * seconds;
  const x = new Float32Array(n);
  const period = (sr * 60) / bpm;
  const burst = Math.round(sr * 0.05);
  for (let b = 0; b * period < n; b++) {
    const start = Math.round(b * period);
    for (let i = 0; i < burst && start + i < n; i++) {
      const env = Math.exp(-i / (sr * 0.012));
      x[start + i] += Math.sin((2 * Math.PI * 80 * i) / sr) * env;
    }
  }
  return x;
}

describe('analyzeTrack', () => {
  it('recovers tempo, beats, and a consistent timeline', () => {
    const sr = 22050;
    const track = analyzeTrack(kickTrack(sr, 6, 120), sr);
    expect(track.tempoBpm).toBeGreaterThan(108);
    expect(track.tempoBpm).toBeLessThan(132);
    expect(track.beats.length).toBeGreaterThan(8);
    expect(track.duration).toBeCloseTo(6, 1);
    expect(track.frameRate).toBeCloseTo(sr / 512, 3);
    const len = track.loudness.length;
    for (const ch of [track.presence, track.bass, track.lowMid, track.mid, track.high, track.onset, track.anticipation]) {
      expect(ch.length).toBe(len);
    }
  });

  it('drives the progress callback to completion', () => {
    const sr = 22050;
    let last = 0;
    analyzeTrack(kickTrack(sr, 4, 120), sr, (p) => { last = p; });
    expect(last).toBe(1);
  });
});
