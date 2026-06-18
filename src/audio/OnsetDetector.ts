import { ONSET } from '../config';
import { binForFreq } from './FeatureExtractor';

export interface OnsetResult {
  odf: number;     // onset detection function value this frame (rectified, low-weighted flux)
  onset: boolean;  // a beat was picked this frame
  strength: number;// odf normalized against its recent peak (0..1), for visuals
}

/**
 * Computes a clean onset detection function from the magnitude spectrum: half-wave
 * rectified spectral flux restricted to (and weighted toward) the low end where the
 * kick/snare live. Picks onsets where the flux exceeds an adaptive moving threshold,
 * with a refractory gap so a single hit fires once.
 */
export class OnsetDetector {
  private prev: Float32Array | null = null;
  private hist: number[] = [];
  private lastOnset = -Infinity;
  private clock = 0;
  private recentMax = 1e-3;
  private loBin: number;

  constructor(sampleRate: number, fftSize: number) {
    this.loBin = binForFreq(ONSET.lowHz, sampleRate, fftSize);
  }

  process(data: Uint8Array, dt: number): OnsetResult {
    this.clock += dt;
    const hi = Math.min(this.loBin, data.length);

    let flux = 0;
    let wsum = 0;
    if (this.prev) {
      for (let i = 0; i < hi; i++) {
        const cur = data[i] / 255;
        const d = cur - this.prev[i];
        const w = 1 - (i / hi) * 0.5; // weight the lowest bins (kick) highest
        if (d > 0) flux += d * w;
        wsum += w;
      }
      flux = wsum > 0 ? flux / wsum : 0;
    } else {
      this.prev = new Float32Array(data.length);
    }
    for (let i = 0; i < data.length; i++) this.prev[i] = data[i] / 255;

    // Adaptive threshold: moving average of recent flux, scaled up, plus a floor.
    this.hist.push(flux);
    if (this.hist.length > ONSET.histFrames) this.hist.shift();
    let avg = 0;
    for (const v of this.hist) avg += v;
    avg /= this.hist.length;
    const threshold = avg * ONSET.threshMargin + ONSET.threshFloor;

    let onset = false;
    if (flux > threshold && this.clock - this.lastOnset > ONSET.refractorySec) {
      onset = true;
      this.lastOnset = this.clock;
    }

    this.recentMax = Math.max(this.recentMax * 0.999, flux);
    const strength = Math.min(1, flux / this.recentMax);
    return { odf: flux, onset, strength };
  }
}
