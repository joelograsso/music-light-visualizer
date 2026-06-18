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

describe('FeatureExtractor adaptive energy + presence baseline', () => {
  const fx = () => new FeatureExtractor(SAMPLE_RATE, FFT_SIZE);
  const fill = (v: number) => new Uint8Array(FFT_SIZE / 2).fill(v);
  const silent = fill(0);

  it('reaches high energy even for a quietly-mastered (low-amplitude) signal', () => {
    // A constant but quiet signal should still normalize up to the top of the range,
    // so the high-energy layers become reachable on any song, not just loud ones.
    const f = fx();
    let feat = f.process(silent, 0.016);
    for (let i = 0; i < 400; i++) feat = f.process(fill(60), 0.016);
    expect(feat.energy).toBeGreaterThan(0.7);
  });

  it('holds a baseline and does not collapse on a quiet-but-present passage', () => {
    const f = fx();
    let feat = f.process(silent, 0.016);
    for (let i = 0; i < 400; i++) feat = f.process(fill(180), 0.016); // warm up
    for (let i = 0; i < 80; i++) feat = f.process(fill(40), 0.016);   // soft passage, still audible
    expect(feat.energy).toBeGreaterThan(0.3); // stays at/above baseline, not collapsed to zero
  });

  it('starts low — energy ramps up rather than jumping to baseline on the first loud frame', () => {
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
});
