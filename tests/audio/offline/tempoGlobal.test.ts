import { describe, it, expect } from 'vitest';
import { globalTempo } from '../../../src/audio/offline/tempoGlobal';

function pulseTrain(frameRate: number, seconds: number, bpm: number): Float32Array {
  const n = Math.round(frameRate * seconds);
  const period = Math.round((60 / bpm) * frameRate);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i += period) env[i] = 1;
  return env;
}

describe('globalTempo', () => {
  it('recovers 120 BPM', () => {
    const bpm = globalTempo(pulseTrain(100, 8, 120), 100);
    expect(bpm).toBeGreaterThan(116);
    expect(bpm).toBeLessThan(124);
  });

  it('recovers 90 BPM', () => {
    const bpm = globalTempo(pulseTrain(100, 8, 90), 100);
    expect(bpm).toBeGreaterThan(86);
    expect(bpm).toBeLessThan(94);
  });

  it('returns 0 without enough history', () => {
    expect(globalTempo(new Float32Array(20), 100)).toBe(0);
  });
});
