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

describe('FeatureExtractor energy + onset', () => {
  function fx() { return new FeatureExtractor(SAMPLE_RATE, FFT_SIZE); }
  const silent = new Uint8Array(FFT_SIZE / 2).fill(0);
  function loud(v = 200) { return new Uint8Array(FFT_SIZE / 2).fill(v); }

  it('energy rises toward sustained loudness and decays in silence', () => {
    const f = fx();
    let feat = f.process(silent, 0.016);
    expect(feat.energy).toBeLessThan(0.05);
    for (let i = 0; i < 300; i++) feat = f.process(loud(), 0.016);
    expect(feat.energy).toBeGreaterThan(0.3);
    for (let i = 0; i < 600; i++) feat = f.process(silent, 0.016);
    expect(feat.energy).toBeLessThan(0.1);
  });

  it('reports a beat on a sudden spectral jump, not on steady signal', () => {
    const f = fx();
    for (let i = 0; i < 30; i++) f.process(silent, 0.016);
    const jump = f.process(loud(255), 0.016);
    expect(jump.beat).toBeGreaterThan(0.2);
    let steady = jump;
    for (let i = 0; i < 10; i++) steady = f.process(loud(255), 0.016);
    expect(steady.beat).toBeLessThan(jump.beat);
  });
});

describe('FeatureExtractor absolute-loudness energy', () => {
  const fx = () => new FeatureExtractor(SAMPLE_RATE, FFT_SIZE);
  const fill = (v: number) => new Uint8Array(FFT_SIZE / 2).fill(v);
  const silent = fill(0);

  it('is loudness-reactive: a moderate signal reads mild while a loud one reads high', () => {
    // The whole point of the absolute model: a steady MODERATE level should NOT look
    // like a loud one. Quieter input -> meaningfully lower energy.
    const moderate = fx();
    let m = moderate.process(silent, 0.016);
    for (let i = 0; i < 400; i++) m = moderate.process(fill(45), 0.016);

    const loud = fx();
    let l = loud.process(silent, 0.016);
    for (let i = 0; i < 400; i++) l = loud.process(fill(150), 0.016);

    expect(m.energy).toBeLessThan(0.5);          // moderate stays mild
    expect(l.energy).toBeGreaterThan(m.energy + 0.25); // loud is clearly higher
  });

  it('gets quieter when the music gets quieter (energy drops on a soft passage)', () => {
    const f = fx();
    let feat = f.process(silent, 0.016);
    for (let i = 0; i < 400; i++) feat = f.process(fill(180), 0.016); // loud
    const loudLevel = feat.energy;
    for (let i = 0; i < 200; i++) feat = f.process(fill(40), 0.016);  // soft passage
    expect(feat.energy).toBeLessThan(loudLevel * 0.6); // clearly receded with the volume
  });

  it('sensitivity gain raises energy for the same input', () => {
    const fill45 = fill(45);
    const lowGain = fx(); lowGain.gain = 0.6;
    const highGain = fx(); highGain.gain = 2.0;
    let lo = lowGain.process(silent, 0.016);
    let hi = highGain.process(silent, 0.016);
    for (let i = 0; i < 400; i++) { lo = lowGain.process(fill45, 0.016); hi = highGain.process(fill45, 0.016); }
    expect(hi.energy).toBeGreaterThan(lo.energy);
  });

  it('starts low — energy ramps up rather than jumping on the first loud frame', () => {
    const f = fx();
    const first = f.process(fill(200), 0.016);
    expect(first.energy).toBeLessThan(0.2); // born small; presence has to ramp
  });

  it('recedes toward zero only when the input is essentially silent', () => {
    const f = fx();
    let feat = f.process(silent, 0.016);
    for (let i = 0; i < 400; i++) feat = f.process(fill(180), 0.016);
    for (let i = 0; i < 700; i++) feat = f.process(silent, 0.016);
    expect(feat.energy).toBeLessThan(0.1);
  });

  it('builds progressively — not near-full within a fraction of a second of sound', () => {
    const f = fx();
    let feat = f.process(silent, 0.016);
    for (let i = 0; i < 20; i++) feat = f.process(fill(200), 0.016); // ~0.3s of loud sound
    expect(feat.energy).toBeLessThan(0.4);                           // still ramping, not slammed high
    for (let i = 0; i < 300; i++) feat = f.process(fill(200), 0.016);
    expect(feat.energy).toBeGreaterThan(0.6);                        // eventually reaches high
  });

  it('does not reach high energy on sparse transient noise (e.g. keyboard taps)', () => {
    const f = fx();
    let feat = f.process(silent, 0.016);
    // ~5s of sparse broadband taps: one loud frame every ~0.25s, silence in between
    for (let i = 0; i < 320; i++) {
      const tap = i % 16 === 0;
      feat = f.process(tap ? fill(160) : silent, 0.016);
    }
    expect(feat.energy).toBeLessThan(0.4);
  });
});
