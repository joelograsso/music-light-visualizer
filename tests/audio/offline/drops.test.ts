import { describe, it, expect } from 'vitest';
import { findDrops } from '../../../src/audio/offline/drops';

describe('findDrops', () => {
  it('detects a build+slam, snaps it to a downbeat, and ramps anticipation before it', () => {
    const frameRate = 100, n = 600; // 6s
    const energy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (i < 200) energy[i] = 0.1;
      else if (i < 350) energy[i] = 0.2 + (0.5 - 0.2) * ((i - 200) / 150); // build 0.2 -> 0.5
      else energy[i] = 0.9; // slam, sustained
    }
    const bass = energy; // same shape for the test
    const downbeats = Float32Array.from([3.5]);
    const { drops, anticipation } = findDrops(energy, bass, downbeats, frameRate);
    expect(drops.length).toBe(1);
    expect(drops[0].time).toBeCloseTo(3.5, 1);
    expect(drops[0].intensity).toBeGreaterThan(0.8);
    const justBefore = anticipation[Math.round(3.4 * frameRate)];
    const wellBefore = anticipation[Math.round(2.2 * frameRate)];
    expect(justBefore).toBeGreaterThan(wellBefore);
    expect(justBefore).toBeGreaterThan(0.5);
  });

  it('does not fire on a gradual swell with no slam', () => {
    const frameRate = 100, n = 600;
    const energy = new Float32Array(n);
    for (let i = 0; i < n; i++) energy[i] = (i / n) * 0.9; // slow ramp, tiny per-window jump
    const { drops } = findDrops(energy, energy, new Float32Array(0), frameRate);
    expect(drops.length).toBe(0);
  });

  it('detects a downbeat slam after a brief pre-drop dip', () => {
    const frameRate = 100, n = 800; // 8s
    const energy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / frameRate;
      if (t < 3.8) energy[i] = 0.18;
      else if (t < 5.5) energy[i] = 0.28 + (0.74 - 0.28) * ((t - 3.8) / 1.7);
      else if (t < 6.0) energy[i] = 0.06; // short pre-drop cut
      else energy[i] = 0.92; // slam
    }
    const bass = energy;
    const downbeats = Float32Array.from([2, 6]);

    const { drops, anticipation } = findDrops(energy, bass, downbeats, frameRate);

    expect(drops.length).toBe(1);
    expect(drops[0].time).toBeCloseTo(6, 2);
    expect(drops[0].intensity).toBeGreaterThan(0.85);
    expect(anticipation[Math.round(5.9 * frameRate)]).toBeGreaterThan(0.8);
  });

  it('returns empty structures for an empty signal', () => {
    const { drops, anticipation } = findDrops(new Float32Array(0), new Float32Array(0), new Float32Array(0), 100);
    expect(drops.length).toBe(0);
    expect(anticipation.length).toBe(0);
  });
});
