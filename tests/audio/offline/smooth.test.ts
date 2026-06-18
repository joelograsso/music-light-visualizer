import { describe, it, expect } from 'vitest';
import { smoothZeroPhase } from '../../../src/audio/offline/smooth';

describe('smoothZeroPhase', () => {
  it('leaves a constant signal unchanged', () => {
    const out = smoothZeroPhase(Float32Array.from([0.5, 0.5, 0.5, 0.5, 0.5]), 0.3);
    for (const v of out) expect(v).toBeCloseTo(0.5, 5);
  });

  it('is zero-phase: the smoothed peak stays aligned with the input peak (no lag)', () => {
    const x = new Float32Array(21);
    x[10] = 1; // impulse at the center
    const out = smoothZeroPhase(x, 0.3);
    let arg = 0;
    for (let i = 1; i < out.length; i++) if (out[i] > out[arg]) arg = i;
    expect(arg).toBe(10); // a one-directional EMA would shift the peak later; zero-phase does not
  });

  it('reduces variance of a noisy signal', () => {
    const n = 200;
    const noisy = new Float32Array(n);
    let s = 1; // LCG, deterministic
    for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) % 2147483648; noisy[i] = (s / 2147483648); }
    const out = smoothZeroPhase(noisy, 0.2);
    const varOf = (a: Float32Array) => {
      let m = 0; for (const v of a) m += v; m /= a.length;
      let v = 0; for (const x of a) v += (x - m) * (x - m); return v / a.length;
    };
    expect(varOf(out)).toBeLessThan(varOf(noisy));
  });

  it('returns an empty array for empty input', () => {
    expect(smoothZeroPhase(new Float32Array(0), 0.3).length).toBe(0);
  });
});
