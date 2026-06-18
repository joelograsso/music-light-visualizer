import { describe, it, expect } from 'vitest';
import { bandPeaks, sampleBands, barSeconds, waveformWindow, pointerTime, formatTime } from '../../src/ui/waveform';
import { analyzeTrack } from '../../src/audio/offline/analyzeTrack';
import type { AnalyzedTrack } from '../../src/audio/offline/types';

// A signal with KNOWN per-band content at distinct times: kick (55Hz/bass) + stab
// (1200Hz/mid) on every beat, hi-hat (6000Hz/high) on every off-beat.
function synth(sr: number, dur: number, bpm: number): Float32Array {
  const n = Math.floor(sr * dur);
  const x = new Float32Array(n);
  const beat = 60 / bpm;
  const add = (start: number, len: number, fn: (i: number) => number) => {
    const s = Math.floor(start * sr), L = Math.floor(len * sr);
    for (let i = 0; i < L && s + i < n && s + i >= 0; i++) x[s + i] += fn(i);
  };
  for (let b = 0; b * beat < dur; b++) {
    const t = b * beat;
    add(t, 0.12, (i) => Math.sin(2 * Math.PI * 55 * i / sr) * Math.exp(-i / (sr * 0.03)) * 0.9);
    add(t, 0.12, (i) => Math.sin(2 * Math.PI * 1200 * i / sr) * Math.exp(-i / (sr * 0.04)) * 0.4);
    add(t + beat / 2, 0.04, (i) => Math.sin(2 * Math.PI * 6000 * i / sr) * Math.exp(-i / (sr * 0.01)) * 0.5);
  }
  return x;
}

function tinyTrack(over: Partial<AnalyzedTrack> = {}): AnalyzedTrack {
  const z = (v: number[]) => Float32Array.from(v);
  return {
    duration: 4, sampleRate: 44100, frameRate: 1, tempoBpm: 120,
    loudness: z([0, 1, 0]), presence: z([1, 1, 1]),
    bass: z([0, 0, 0]), lowMid: z([0, 0, 0]), mid: z([0, 0, 0]), high: z([0, 0, 0]),
    onset: z([0, 0, 0]), anticipation: z([0, 0, 0]),
    beats: z([]), downbeats: z([]), drops: [], sections: [],
    ...over,
  };
}

describe('bandPeaks + sampleBands (per-band balancing)', () => {
  const sr = 44100, bpm = 100;
  const track = analyzeTrack(synth(sr, 8, bpm), sr);
  const peaks = bandPeaks(track);
  const beatSec = 60 / bpm;

  it('computes positive per-band peaks', () => {
    expect(peaks.low).toBeGreaterThan(0);
    expect(peaks.mid).toBeGreaterThan(0);
    expect(peaks.high).toBeGreaterThan(0);
  });

  it('a kick reads as a present low band, not high', () => {
    const b = sampleBands(track, 2 * beatSec + 0.01, peaks);
    expect(b.low).toBeGreaterThan(0.5);
    expect(b.low).toBeGreaterThan(b.high);
  });

  it('a hi-hat reads as a VISIBLE high band despite tiny absolute energy', () => {
    const b = sampleBands(track, 2 * beatSec + beatSec / 2 + 0.005, peaks);
    expect(b.high).toBeGreaterThan(0.4); // the whole point: normalized so highs are visible
    expect(b.high).toBeGreaterThan(b.low);
  });

  it('clamps presences to 0..1', () => {
    for (let t = 0; t < 8; t += 0.25) {
      const b = sampleBands(track, t, peaks);
      for (const v of [b.low, b.mid, b.high]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    }
  });

  it('handles a silent/tiny track without dividing by zero', () => {
    const t = tinyTrack();
    const p = bandPeaks(t);
    const b = sampleBands(t, 1, p);
    expect(Number.isFinite(b.low + b.mid + b.high)).toBe(true);
  });
});

describe('barSeconds / waveformWindow / pointerTime', () => {
  it('computes seconds per bar', () => {
    expect(barSeconds(120)).toBeCloseTo(2, 5);
    expect(barSeconds(0)).toBe(0);
  });
  it('centers the window on the playhead', () => {
    const w = waveformWindow(10, 120);
    expect(w.windowSec).toBeCloseTo(16, 5);
    expect(w.t0).toBeCloseTo(2, 5);
  });
  it('uses the fallback window when tempo is unknown', () => {
    const w = waveformWindow(10, 0);
    expect(w.windowSec).toBeCloseTo(8, 5);
    expect(w.t0).toBeCloseTo(6, 5);
  });
  it('maps a pointer fraction to a time in the window', () => {
    expect(pointerTime(0.5, 10, 120)).toBeCloseTo(10, 5);
    expect(pointerTime(0, 10, 120)).toBeCloseTo(2, 5);
  });
});

describe('formatTime', () => {
  it('formats m:ss', () => {
    expect(formatTime(72)).toBe('1:12');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(0)).toBe('0:00');
  });
});
