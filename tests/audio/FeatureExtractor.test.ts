import { describe, it, expect } from 'vitest';
import { binForFreq, computeBands, FeatureExtractor } from '../../src/audio/FeatureExtractor';

const SAMPLE_RATE = 44100;
const FFT_SIZE = 2048;

describe('binForFreq', () => {
  it('maps a frequency to its FFT bin index', () => {
    // bin width = 44100 / 2048 ≈ 21.53 Hz
    expect(binForFreq(0, SAMPLE_RATE, FFT_SIZE)).toBe(0);
    expect(binForFreq(100, SAMPLE_RATE, FFT_SIZE)).toBe(5); // round(100/21.53)
  });
});

describe('computeBands', () => {
  it('averages normalized magnitudes within each band', () => {
    const bins = FFT_SIZE / 2; // 1024
    const data = new Uint8Array(bins).fill(0);
    // Put full energy (255) in the bass region only (~50 Hz -> bin 2)
    data[2] = 255;
    const bands = computeBands(data, SAMPLE_RATE, FFT_SIZE);
    expect(bands.bass).toBeGreaterThan(0);
    expect(bands.high).toBe(0);
    expect(bands.bass).toBeLessThanOrEqual(1);
  });
});

describe('FeatureExtractor onset (from spectral data)', () => {
  const fx = () => new FeatureExtractor(SAMPLE_RATE, FFT_SIZE);
  const freq = (v: number) => new Uint8Array(FFT_SIZE / 2).fill(v);
  const silentFreq = freq(0);

  it('reports a beat on a sudden spectral jump, not on steady signal', () => {
    const f = fx();
    for (let i = 0; i < 30; i++) f.process(silentFreq, 0, 0.016);
    const jump = f.process(freq(255), 0.3, 0.016);
    expect(jump.beat).toBeGreaterThan(0.2);
    let steady = jump;
    for (let i = 0; i < 10; i++) steady = f.process(freq(255), 0.3, 0.016);
    expect(steady.beat).toBeLessThan(jump.beat);
  });
});

// Loudness now comes from the time-domain RMS argument (a true absolute amplitude),
// NOT the frequency data. These tests drive loudness directly via that rms value.
describe('FeatureExtractor absolute-loudness energy', () => {
  const fx = () => new FeatureExtractor(SAMPLE_RATE, FFT_SIZE);
  const spectrum = new Uint8Array(FFT_SIZE / 2).fill(40); // frequency data is irrelevant to loudness here
  const silentFreq = new Uint8Array(FFT_SIZE / 2).fill(0);
  const warm = (f: FeatureExtractor, rms: number, n = 400) => {
    let feat = f.process(silentFreq, 0, 0.016);
    for (let i = 0; i < n; i++) feat = f.process(spectrum, rms, 0.016);
    return feat;
  };

  it('is loudness-reactive: a moderate level reads mild while a loud one reads high', () => {
    const m = warm(fx(), 0.10); // moderate RMS
    const l = warm(fx(), 0.32); // loud RMS
    expect(m.energy).toBeLessThan(0.5);                // moderate stays mild
    expect(l.energy).toBeGreaterThan(m.energy + 0.25); // loud is clearly higher
  });

  it('gets quieter when the music gets quieter (energy drops on a soft passage)', () => {
    const f = fx();
    let feat = warm(f, 0.32);
    const loudLevel = feat.energy;
    for (let i = 0; i < 200; i++) feat = f.process(spectrum, 0.06, 0.016); // soft passage
    expect(feat.energy).toBeLessThan(loudLevel * 0.6);
  });

  it('treats faint noise as near-silence, not a strong response', () => {
    const feat = warm(fx(), 0.012); // below the silence threshold
    expect(feat.energy).toBeLessThan(0.08);
  });

  it('sensitivity gain raises energy for the same input', () => {
    const lo = fx(); lo.gain = 0.6;
    const hi = fx(); hi.gain = 2.0;
    expect(warm(hi, 0.10).energy).toBeGreaterThan(warm(lo, 0.10).energy);
  });

  it('starts low — energy ramps up rather than jumping on the first loud frame', () => {
    const first = fx().process(spectrum, 0.32, 0.016);
    expect(first.energy).toBeLessThan(0.2);
  });

  it('recedes toward zero only when the input is essentially silent', () => {
    const f = fx();
    let feat = warm(f, 0.3);
    for (let i = 0; i < 700; i++) feat = f.process(silentFreq, 0, 0.016);
    expect(feat.energy).toBeLessThan(0.1);
  });

  it('builds progressively — not near-full within a fraction of a second of sound', () => {
    const f = fx();
    let feat = f.process(silentFreq, 0, 0.016);
    for (let i = 0; i < 20; i++) feat = f.process(spectrum, 0.32, 0.016); // ~0.3s of loud
    expect(feat.energy).toBeLessThan(0.4);                                // still ramping
    for (let i = 0; i < 400; i++) feat = f.process(spectrum, 0.32, 0.016);
    expect(feat.energy).toBeGreaterThan(0.6);                             // eventually high
  });

  it('does not reach high energy on sparse transient noise (e.g. keyboard taps)', () => {
    const f = fx();
    let feat = f.process(silentFreq, 0, 0.016);
    for (let i = 0; i < 320; i++) {
      const tap = i % 16 === 0; // one loud frame every ~0.25s, silence between
      feat = f.process(spectrum, tap ? 0.3 : 0, 0.016);
    }
    expect(feat.energy).toBeLessThan(0.4);
  });
});
