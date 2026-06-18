import { magnitudeSpectrum } from './fft';

export interface Stft {
  frames: Float32Array[];  // magnitude spectra, each length fftSize/2
  rms: Float32Array;       // per-frame time-domain RMS (absolute loudness)
  frameCount: number;
  hop: number;
}

/** A periodic Hann window of length n. */
export function hannWindow(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

/** How many hop-spaced frames of size fftSize fit in a signal of `length`. */
export function frameCount(length: number, fftSize: number, hop: number): number {
  if (length < fftSize) return 0;
  return 1 + Math.floor((length - fftSize) / hop);
}

/** Hann-windowed STFT: per-frame magnitude spectra plus per-frame (unwindowed) RMS. */
export function computeStft(signal: Float32Array, fftSize: number, hop: number): Stft {
  const win = hannWindow(fftSize);
  const count = frameCount(signal.length, fftSize, hop);
  const frames: Float32Array[] = [];
  const rms = new Float32Array(count);
  const buf = new Float32Array(fftSize);
  for (let f = 0; f < count; f++) {
    const start = f * hop;
    let sumSq = 0;
    for (let i = 0; i < fftSize; i++) {
      const s = signal[start + i];
      sumSq += s * s;
      buf[i] = s * win[i];
    }
    rms[f] = Math.sqrt(sumSq / fftSize);
    frames.push(magnitudeSpectrum(buf));
  }
  return { frames, rms, frameCount: count, hop };
}
