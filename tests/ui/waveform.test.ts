import { describe, it, expect } from 'vitest';
import { sampleColumn, barSeconds, waveformWindow, pointerTime, formatTime } from '../../src/ui/waveform';
import type { AnalyzedTrack } from '../../src/audio/offline/types';

function track(over: Partial<AnalyzedTrack> = {}): AnalyzedTrack {
  const z = (v: number[]) => Float32Array.from(v);
  return {
    duration: 4, sampleRate: 44100, frameRate: 1, tempoBpm: 120,
    loudness: z([0, 1, 0]), presence: z([1, 1, 1]),
    bass: z([0, 0, 0]), lowMid: z([0, 0, 0]), mid: z([0, 0, 0]), high: z([0, 0, 0]),
    onset: z([0, 0, 0]), anticipation: z([0, 0, 0]),
    beats: z([]), downbeats: z([]), drops: [],
    ...over,
  };
}

describe('sampleColumn', () => {
  it('colors a bass-dominant slice red', () => {
    const s = sampleColumn(track({ bass: Float32Array.from([0, 1, 0]) }), 1);
    expect(s.r).toBeGreaterThan(s.g);
    expect(s.r).toBeGreaterThan(s.b);
    expect(s.amp).toBeCloseTo(1, 5);
  });
  it('colors a mid-dominant slice green', () => {
    const s = sampleColumn(track({ lowMid: Float32Array.from([0, 1, 0]) }), 1);
    expect(s.g).toBeGreaterThan(s.r);
    expect(s.g).toBeGreaterThan(s.b);
  });
  it('colors a high-dominant slice blue', () => {
    const s = sampleColumn(track({ high: Float32Array.from([0, 1, 0]) }), 1);
    expect(s.b).toBeGreaterThan(s.r);
    expect(s.b).toBeGreaterThan(s.g);
  });
  it('interpolates amplitude between frames', () => {
    const s = sampleColumn(track({ loudness: Float32Array.from([0, 1]) }), 0.5);
    expect(s.amp).toBeCloseTo(0.5, 5);
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
