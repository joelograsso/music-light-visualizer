import { FFT_SIZE, OFFLINE, ESSENTIA } from '../../config';
import { getEssentia } from './essentia';
import { assembleTrack } from './assembleTrack';
import type { AnalyzedTrack } from './types';

/** Map a MelBands energy to 0..1 via a dB window (range tuned in the spike note). */
function bandLevel(energy: number): number {
  const db = 10 * Math.log10(energy + 1e-12);
  const v = (db - ESSENTIA.bandMinDb) / (ESSENTIA.bandMaxDb - ESSENTIA.bandMinDb);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Mean of mel-band energies over the half-open index range [start, end). */
function meanRange(arr: Float32Array, start: number, end: number): number {
  const e = Math.min(end, arr.length);
  let s = 0;
  for (let i = start; i < e; i++) s += arr[i];
  return e > start ? s / (e - start) : 0;
}

/**
 * essentia.js offline analyzer: RhythmExtractor2013 for tempo + beats; manual framing at
 * hop 512 -> Windowing -> Spectrum -> MelBands (bands) + RMS (loudness); onset from band
 * flux. Raw channels + beats go to the shared assembleTrack. Every essentia vector is freed
 * immediately to keep the WASM heap flat on long tracks.
 */
export async function analyzeTrackEssentia(
  channel: Float32Array,
  sampleRate: number,
  onProgress?: (pct: number) => void,
): Promise<AnalyzedTrack> {
  const essentia = getEssentia();
  const hop = OFFLINE.hop;
  const fftSize = FFT_SIZE;
  const frameRate = sampleRate / hop;

  // --- tempo + beats (whole signal) ---
  const sig = essentia.arrayToVector(channel);
  const r = essentia.RhythmExtractor2013(sig, ESSENTIA.maxTempo, ESSENTIA.rhythmMethod, ESSENTIA.minTempo);
  const tempoBpm = r.bpm as number;
  const beats = Float32Array.from(essentia.vectorToArray(r.ticks) as Float32Array);
  r.ticks.delete(); r.estimates.delete(); r.bpmIntervals.delete(); sig.delete();
  onProgress?.(0.55);

  // --- per-frame bands + loudness + onset (manual framing at hop) ---
  const nFrames = channel.length >= fftSize ? 1 + Math.floor((channel.length - fftSize) / hop) : 0;
  const loudness = new Float32Array(nFrames);
  const bass = new Float32Array(nFrames);
  const lowMid = new Float32Array(nFrames);
  const mid = new Float32Array(nFrames);
  const high = new Float32Array(nFrames);
  const rawFlux = new Float32Array(nFrames);
  const mb = ESSENTIA.melBuckets;
  let prev: number[] | null = null;

  for (let f = 0; f < nFrames; f++) {
    const frameVec = essentia.arrayToVector(channel.slice(f * hop, f * hop + fftSize));
    const win = essentia.Windowing(frameVec);
    const spec = essentia.Spectrum(win.frame);
    const melOut = essentia.MelBands(spec.spectrum);
    const m = essentia.vectorToArray(melOut.bands) as Float32Array;
    const rms = essentia.RMS(frameVec);

    loudness[f] = rms.rms;
    const lv = [
      bandLevel(meanRange(m, mb.bass[0], mb.bass[1])),
      bandLevel(meanRange(m, mb.lowMid[0], mb.lowMid[1])),
      bandLevel(meanRange(m, mb.mid[0], mb.mid[1])),
      bandLevel(meanRange(m, mb.high[0], mb.high[1])),
    ];
    bass[f] = lv[0]; lowMid[f] = lv[1]; mid[f] = lv[2]; high[f] = lv[3];
    if (prev) { let fl = 0; for (let k = 0; k < 4; k++) { const d = lv[k] - prev[k]; if (d > 0) fl += d; } rawFlux[f] = fl; }
    prev = lv;

    frameVec.delete(); win.frame.delete(); spec.spectrum.delete(); melOut.bands.delete();
    if ((f & 511) === 0) onProgress?.(0.55 + 0.4 * (f / Math.max(1, nFrames)));
  }

  let maxFlux = 1e-9;
  for (let f = 0; f < nFrames; f++) if (rawFlux[f] > maxFlux) maxFlux = rawFlux[f];
  const onset = new Float32Array(nFrames);
  for (let f = 0; f < nFrames; f++) onset[f] = rawFlux[f] / maxFlux;
  onProgress?.(1);

  return assembleTrack({
    duration: channel.length / sampleRate,
    sampleRate, frameRate, tempoBpm,
    loudness, bass, lowMid, mid, high, onset, beats,
  });
}
