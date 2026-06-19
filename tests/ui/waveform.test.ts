import { describe, it, expect } from 'vitest';
import { WAVEFORM } from '../../src/config';
import {
  bandPeaks,
  sampleBands,
  waveformColumn,
  waveformBarMarkers,
  waveformGridMarkers,
  barSeconds,
  waveformWindow,
  pointerTime,
  formatTime,
  barNumber,
  currentSection,
  tierColor,
} from '../../src/ui/waveform';
import { analyzeTrack } from '../../src/audio/offline/analyzeTrack';
import type { AnalyzedTrack, Section } from '../../src/audio/offline/types';

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

describe('waveformColumn', () => {
  it('uses one mirrored amplitude envelope instead of stacking band heights', () => {
    const t = tinyTrack({
      loudness: Float32Array.from([0, 0.25, 1]),
      bass: Float32Array.from([1, 1, 1]),
      lowMid: Float32Array.from([1, 1, 1]),
      mid: Float32Array.from([1, 1, 1]),
      high: Float32Array.from([1, 1, 1]),
    });
    const p = bandPeaks(t);
    expect(waveformColumn(t, 0, p).amplitude).toBe(0);
    expect(waveformColumn(t, 1, p).amplitude).toBeLessThan(waveformColumn(t, 2, p).amplitude);
    expect(waveformColumn(t, 2, p).amplitude).toBeLessThanOrEqual(1);
  });

  it('colors columns by the dominant frequency band', () => {
    const p = { low: 1, mid: 1, high: 1, loudness: 1 };
    expect(waveformColumn(tinyTrack({ loudness: Float32Array.from([1]), bass: Float32Array.from([1]) }), 0, p).color).toBe(WAVEFORM.lowColor);
    expect(waveformColumn(tinyTrack({ loudness: Float32Array.from([1]), mid: Float32Array.from([1]) }), 0, p).color).toBe(WAVEFORM.midColor);
    expect(waveformColumn(tinyTrack({ loudness: Float32Array.from([1]), high: Float32Array.from([1]) }), 0, p).color).toBe(WAVEFORM.highColor);
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

describe('waveformBarMarkers', () => {
  it('places visible bar markers from BPM, independent of detected downbeats', () => {
    const markers = waveformBarMarkers(10, 120, 100);
    expect(markers.map((m) => m.time)).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18]);
    expect(markers[0].x).toBeCloseTo(0, 5);
    expect(markers[4].x).toBeCloseTo(0.5, 5);
    expect(markers[8].x).toBeCloseTo(1, 5);
  });

  it('returns no markers when tempo is unknown', () => {
    expect(waveformBarMarkers(10, 0, 100)).toEqual([]);
  });
});

describe('waveformGridMarkers', () => {
  it('labels beat subdivisions as bar.beat across the visible BPM grid', () => {
    const markers = waveformGridMarkers(8, 120, 100);
    expect(markers.slice(0, 8).map((m) => m.label)).toEqual([
      '1.1', '1.2', '1.3', '1.4',
      '2.1', '2.2', '2.3', '2.4',
    ]);
    expect(markers[0]).toMatchObject({ time: 0, x: 0, bar: 1, beat: 1, isBarStart: true });
    expect(markers[1]).toMatchObject({ time: 0.5, beat: 2, isBarStart: false });
    expect(markers[4]).toMatchObject({ time: 2, bar: 2, beat: 1, isBarStart: true });
  });

  it('returns no subdivision markers when tempo is unknown', () => {
    expect(waveformGridMarkers(10, 0, 100)).toEqual([]);
  });
});

describe('formatTime', () => {
  it('formats m:ss', () => {
    expect(formatTime(72)).toBe('1:12');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(0)).toBe('0:00');
  });
});

describe('barNumber', () => {
  it('is 1 at the start and increments per bar', () => {
    expect(barNumber(0, 120)).toBe(1);   // barSeconds 2
    expect(barNumber(1.9, 120)).toBe(1);
    expect(barNumber(2, 120)).toBe(2);
    expect(barNumber(7, 120)).toBe(4);
  });
  it('is 1 when tempo is unknown', () => {
    expect(barNumber(50, 0)).toBe(1);
  });
});

describe('currentSection', () => {
  const secs: Section[] = [
    { start: 0, end: 10, intensity: 0.2, tier: 'calm' },
    { start: 10, end: 20, intensity: 0.9, tier: 'peak' },
  ];
  it('finds the section containing t', () => {
    expect(currentSection(secs, 5)?.index).toBe(0);
    expect(currentSection(secs, 15)?.index).toBe(1);
  });
  it('clamps to the last section past its end', () => {
    expect(currentSection(secs, 25)?.index).toBe(1);
  });
  it('returns null with no sections', () => {
    expect(currentSection([], 5)).toBe(null);
  });
});

describe('tierColor', () => {
  it('maps each tier to its configured color', () => {
    expect(tierColor('calm')).toBe('#3a8ee2');
    expect(tierColor('peak')).toBe('#e2563b');
  });
});
