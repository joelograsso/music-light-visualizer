import { WAVEFORM } from '../config';
import type { AnalyzedTrack } from '../audio/offline/types';

/** Per-band normalization peaks; `low` = bass, `mid` = lowMid+mid, `high` = high. */
export interface BandPeaks { low: number; mid: number; high: number; }
/** Normalized 0..1 per-band presence at one slice. */
export interface Bands3 { low: number; mid: number; high: number; }

function interp(ch: Float32Array, f: number): number {
  if (ch.length === 0) return 0;
  if (f <= 0) return ch[0];
  if (f >= ch.length - 1) return ch[ch.length - 1];
  const i = Math.floor(f);
  return ch[i] + (ch[i + 1] - ch[i]) * (f - i);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * Robust per-band normalization peaks for the whole track. Music has far more energy in
 * the lows than the highs, so without this the bass swamps everything. Normalizing each
 * band to its own ~p95 peak makes quieter bands (hats/highs) visible — the way DJ
 * waveforms do. Computed once per track.
 */
export function bandPeaks(track: AnalyzedTrack): BandPeaks {
  const n = track.bass.length;
  const low = new Array<number>(n), mid = new Array<number>(n), high = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    low[i] = track.bass[i];
    mid[i] = track.lowMid[i] + track.mid[i];
    high[i] = track.high[i];
  }
  const floor = 1e-3;
  const p = WAVEFORM.peakPercentile;
  return {
    low: Math.max(floor, percentile(low, p)),
    mid: Math.max(floor, percentile(mid, p)),
    high: Math.max(floor, percentile(high, p)),
  };
}

/** Normalized 0..1 presence of each band at time t, balanced by the per-band peaks. */
export function sampleBands(track: AnalyzedTrack, t: number, peaks: BandPeaks): Bands3 {
  const f = t * track.frameRate;
  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  return {
    low: clamp01(interp(track.bass, f) / peaks.low),
    mid: clamp01((interp(track.lowMid, f) + interp(track.mid, f)) / peaks.mid),
    high: clamp01(interp(track.high, f) / peaks.high),
  };
}

/** Seconds per bar at the given tempo; 0 if tempo is unknown. */
export function barSeconds(tempoBpm: number): number {
  return tempoBpm > 0 ? (WAVEFORM.beatsPerBar * 60) / tempoBpm : 0;
}

/** The visible window [t0, t0 + windowSec] centered on the playhead position `pos`. */
export function waveformWindow(pos: number, tempoBpm: number): { t0: number; windowSec: number } {
  const bs = barSeconds(tempoBpm);
  const windowSec = bs > 0 ? bs * (WAVEFORM.barsBehind + WAVEFORM.barsAhead) : WAVEFORM.fallbackWindowSec;
  const behind = bs > 0 ? bs * WAVEFORM.barsBehind : windowSec / 2;
  return { t0: pos - behind, windowSec };
}

/** Map a 0..1 horizontal fraction of the canvas to a time in the window. */
export function pointerTime(fracX: number, pos: number, tempoBpm: number): number {
  const { t0, windowSec } = waveformWindow(pos, tempoBpm);
  return t0 + fracX * windowSec;
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}
