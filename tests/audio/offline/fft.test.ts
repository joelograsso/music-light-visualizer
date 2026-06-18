import { describe, it, expect } from 'vitest';
import { magnitudeSpectrum } from '../../../src/audio/offline/fft';

describe('magnitudeSpectrum', () => {
  it('peaks at the bin of a pure cosine', () => {
    const n = 64, k = 8;
    const sig = new Float32Array(n);
    for (let i = 0; i < n; i++) sig[i] = Math.cos((2 * Math.PI * k * i) / n);
    const mag = magnitudeSpectrum(sig);
    expect(mag.length).toBe(n / 2);
    let arg = 0;
    for (let i = 1; i < mag.length; i++) if (mag[i] > mag[arg]) arg = i;
    expect(arg).toBe(k);
    expect(mag[k]).toBeGreaterThan(0.4); // full-amplitude cosine -> ~0.5 with 1/N scaling
  });

  it('a different frequency peaks at a different bin', () => {
    const n = 128, k = 20;
    const sig = new Float32Array(n);
    for (let i = 0; i < n; i++) sig[i] = Math.cos((2 * Math.PI * k * i) / n);
    const mag = magnitudeSpectrum(sig);
    let arg = 0;
    for (let i = 1; i < mag.length; i++) if (mag[i] > mag[arg]) arg = i;
    expect(arg).toBe(k);
  });

  it('a zero signal has zero magnitude', () => {
    const mag = magnitudeSpectrum(new Float32Array(32));
    for (const v of mag) expect(v).toBeCloseTo(0, 6);
  });
});
