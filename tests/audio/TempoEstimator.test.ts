import { describe, it, expect } from 'vitest';
import { estimateTempo, autocorrelate } from '../../src/audio/TempoEstimator';

function pulseTrain(rateHz: number, seconds: number, bpm: number): number[] {
  const n = Math.round(rateHz * seconds);
  const period = Math.round((60 / bpm) * rateHz); // samples per beat
  const env = new Array(n).fill(0);
  for (let i = 0; i < n; i++) if (i % period === 0) env[i] = 1;
  return env;
}

describe('autocorrelate', () => {
  it('peaks at the period of a pulse train', () => {
    const env = pulseTrain(100, 6, 120); // beat every 50 samples
    expect(autocorrelate(env, 50)).toBeGreaterThan(autocorrelate(env, 37));
    expect(autocorrelate(env, 50)).toBeGreaterThan(autocorrelate(env, 63));
  });
});

describe('estimateTempo', () => {
  it('recovers 120 BPM from a 120 BPM pulse train', () => {
    const r = estimateTempo(pulseTrain(100, 6, 120), 100);
    expect(r).not.toBeNull();
    expect(r!.bpm).toBeGreaterThan(116);
    expect(r!.bpm).toBeLessThan(124);
  });

  it('recovers 90 BPM from a 90 BPM pulse train', () => {
    const r = estimateTempo(pulseTrain(100, 6, 90), 100);
    expect(r!.bpm).toBeGreaterThan(86);
    expect(r!.bpm).toBeLessThan(94);
  });

  it('returns null without enough history', () => {
    expect(estimateTempo(new Array(50).fill(0), 100)).toBeNull();
  });

  it('reports higher confidence for a clean beat than for noise', () => {
    const clean = estimateTempo(pulseTrain(100, 6, 128), 100)!;
    const noise = new Array(600).fill(0).map((_, i) => ((i * 9301 + 49297) % 233280) / 233280);
    const noisy = estimateTempo(noise, 100)!;
    expect(clean.confidence).toBeGreaterThan(noisy.confidence);
  });
});
