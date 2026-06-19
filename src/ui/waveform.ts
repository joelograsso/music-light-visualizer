import { WAVEFORM, TIER_COLORS } from '../config';
import type { AnalyzedTrack, Section, SectionTier } from '../audio/offline/types';

/** Per-channel normalization peaks; `low` = bass, `mid` = lowMid+mid, `high` = high. */
export interface BandPeaks { low: number; mid: number; high: number; loudness: number; }
/** Normalized 0..1 per-band presence at one slice. */
export interface Bands3 { low: number; mid: number; high: number; }
/** One drawn waveform column: a single mirrored amplitude, colored by the spectral mix. */
export interface WaveformColumn { amplitude: number; color: string; bands: Bands3; }
/** A visible bar grid marker generated from BPM and the current waveform window. */
export interface WaveformBarMarker { time: number; x: number; }
/** Beat-level grid marker, labelled as bar.beat (for example 2.3). */
export interface WaveformGridMarker extends WaveformBarMarker {
  bar: number;
  beat: number;
  label: string;
  isBarStart: boolean;
}

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
    loudness: Math.max(floor, percentile(Array.from(track.loudness), p)),
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

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Spectral color for one column. Pure-band columns return the configured band colors. */
export function waveformColor(bands: Bands3): string {
  const sum = bands.low + bands.mid + bands.high;
  if (sum <= 1e-6) return 'rgba(255,255,255,0)';
  if (bands.low > 0 && bands.mid === 0 && bands.high === 0) return WAVEFORM.lowColor;
  if (bands.mid > 0 && bands.low === 0 && bands.high === 0) return WAVEFORM.midColor;
  if (bands.high > 0 && bands.low === 0 && bands.mid === 0) return WAVEFORM.highColor;

  const [lr, lg, lb] = hexToRgb(WAVEFORM.lowColor);
  const [mr, mg, mb] = hexToRgb(WAVEFORM.midColor);
  const [hr, hg, hb] = hexToRgb(WAVEFORM.highColor);
  const low = bands.low / sum, mid = bands.mid / sum, high = bands.high / sum;
  return rgbToHex(lr * low + mr * mid + hr * high, lg * low + mg * mid + hg * high, lb * low + mb * mid + hb * high);
}

/** One visual waveform column: height follows loudness, color follows frequency balance. */
export function waveformColumn(track: AnalyzedTrack, t: number, peaks: BandPeaks): WaveformColumn {
  const f = t * track.frameRate;
  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const bands = sampleBands(track, t, peaks);
  const loud = clamp01(interp(track.loudness, f) / peaks.loudness);
  return {
    amplitude: loud,
    color: waveformColor(bands),
    bands,
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

/** Bar grid positions in the visible window, generated from tempo rather than downbeat detection. */
export function waveformBarMarkers(pos: number, tempoBpm: number, duration: number): WaveformBarMarker[] {
  const bs = barSeconds(tempoBpm);
  if (bs <= 0) return [];
  const { t0, windowSec } = waveformWindow(pos, tempoBpm);
  const end = Math.min(duration, t0 + windowSec);
  const start = Math.max(0, Math.ceil((t0 - 1e-6) / bs) * bs);
  const markers: WaveformBarMarker[] = [];
  for (let t = start; t <= end + 1e-6; t += bs) {
    markers.push({ time: Math.round(t * 1e6) / 1e6, x: (t - t0) / windowSec });
  }
  return markers;
}

/** Beat subdivision grid positions in the visible window, labelled as bar.beat. */
export function waveformGridMarkers(pos: number, tempoBpm: number, duration: number): WaveformGridMarker[] {
  const bs = barSeconds(tempoBpm);
  if (bs <= 0) return [];

  const beatSec = bs / WAVEFORM.beatsPerBar;
  const { t0, windowSec } = waveformWindow(pos, tempoBpm);
  const end = Math.min(duration, t0 + windowSec);
  const startIndex = Math.max(0, Math.ceil((t0 - 1e-6) / beatSec));
  const markers: WaveformGridMarker[] = [];

  for (let idx = startIndex; ; idx++) {
    const t = idx * beatSec;
    if (t > end + 1e-6) break;
    const bar = Math.floor(idx / WAVEFORM.beatsPerBar) + 1;
    const beat = (idx % WAVEFORM.beatsPerBar) + 1;
    markers.push({
      time: Math.round(t * 1e6) / 1e6,
      x: (t - t0) / windowSec,
      bar,
      beat,
      label: `${bar}.${beat}`,
      isBarStart: beat === 1,
    });
  }
  return markers;
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/** 1-based bar number at playhead position `pos`; 1 when tempo is unknown. */
export function barNumber(pos: number, tempoBpm: number): number {
  const bs = barSeconds(tempoBpm);
  if (bs <= 0) return 1;
  return Math.floor(Math.max(0, pos) / bs) + 1;
}

/** The section containing time `t` (clamped to the last section once past its end), or null
 *  if `t` is before the first section or `sections` is empty. */
export function currentSection(sections: Section[], t: number): { index: number; section: Section } | null {
  for (let i = 0; i < sections.length; i++) {
    if (t >= sections[i].start && t < sections[i].end) return { index: i, section: sections[i] };
  }
  if (sections.length > 0 && t >= sections[sections.length - 1].end) {
    const i = sections.length - 1;
    return { index: i, section: sections[i] };
  }
  return null;
}

/** The display color for a section tier. */
export function tierColor(tier: SectionTier): string {
  return TIER_COLORS[tier];
}
