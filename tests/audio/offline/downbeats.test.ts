import { describe, it, expect } from 'vitest';
import { findDownbeats } from '../../../src/audio/offline/downbeats';

describe('findDownbeats', () => {
  it('picks the bar phase whose beats carry the most onset energy', () => {
    const frameRate = 100;
    // 16 beats every 0.5s; strong onset on beats at phase 1 (indices 1,5,9,13)
    const beats = new Float32Array(16);
    for (let i = 0; i < 16; i++) beats[i] = i * 0.5;
    const onset = new Float32Array(Math.round(16 * 0.5 * frameRate) + frameRate);
    for (let i = 1; i < 16; i += 4) onset[Math.round(beats[i] * frameRate)] = 1;
    const down = findDownbeats(beats, onset, frameRate);
    expect(down.length).toBe(4);
    expect(down[0]).toBeCloseTo(0.5, 6);  // phase 1 -> first downbeat is beats[1]
    expect(down[1]).toBeCloseTo(2.5, 6);
  });

  it('returns empty when there are no beats', () => {
    expect(findDownbeats(new Float32Array(0), new Float32Array(10), 100).length).toBe(0);
  });
});
