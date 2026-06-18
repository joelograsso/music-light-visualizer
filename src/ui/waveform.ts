import { WAVEFORM } from '../config';
import type { AnalyzedTrack } from '../audio/offline/types';

export interface Slice { amp: number; r: number; g: number; b: number; }

function interp(ch: Float32Array, f: number): number {
  if (ch.length === 0) return 0;
  if (f <= 0) return ch[0];
  if (f >= ch.length - 1) return ch[ch.length - 1];
  const i = Math.floor(f);
  return ch[i] + (ch[i + 1] - ch[i]) * (f - i);
}

/** Sample the track at time t (seconds) -> amplitude + blended RGB (red lows / green mids / blue highs). */
export function sampleColumn(track: AnalyzedTrack, t: number): Slice {
  const f = t * track.frameRate;
  const amp = interp(track.loudness, f);
  const bass = interp(track.bass, f);
  const mids = interp(track.lowMid, f) + interp(track.mid, f);
  const high = interp(track.high, f);
  const total = bass + mids + high + 1e-6;
  const ch = (band: number) => Math.round(WAVEFORM.colorFloor + (band / total) * WAVEFORM.colorScale);
  return { amp, r: ch(bass), g: ch(mids), b: ch(high) };
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
