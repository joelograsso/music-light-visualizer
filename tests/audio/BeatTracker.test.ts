import { describe, it, expect } from 'vitest';
import { BeatTracker } from '../../src/audio/BeatTracker';

const DT = 1 / 60;

describe('BeatTracker', () => {
  it('emits roughly one beat per period when locked', () => {
    const bt = new BeatTracker();
    const period = 0.5; // 120 BPM
    let t = 0;
    let beats = 0;
    for (let i = 0; i < 60 * 8; i++) {
      t += DT;
      const onset = t % period < DT; // onset at each beat
      bt.update(DT, period, onset, 1, 0.8);
      if (i >= 60 * 4 && bt.beatNow) beats++; // count over the last 4s
    }
    expect(beats).toBeGreaterThanOrEqual(7);
    expect(beats).toBeLessThanOrEqual(9); // ~8 beats in 4s at 120 BPM
  });

  it('locks phase so onsets land near a beat boundary even when they start out of phase', () => {
    const bt = new BeatTracker();
    const period = 0.5;
    // onsets offset by a quarter beat from the tracker's free-run start
    let t = 0;
    const errs: number[] = [];
    for (let i = 0; i < 60 * 10; i++) {
      t += DT;
      const onset = (t + 0.125) % period < DT; // shifted onsets
      bt.update(DT, period, onset, 1, 0.8);
      if (i >= 60 * 6 && onset) {
        const p = bt.beatPhase;
        errs.push(Math.min(p, 1 - p)); // distance to nearest beat
      }
    }
    const avg = errs.reduce((a, b) => a + b, 0) / errs.length;
    expect(avg).toBeLessThan(0.12); // locked within ~12% of a beat
  });

  it('beatPulse peaks on a predicted beat and decays between', () => {
    const bt = new BeatTracker();
    let peakOnBeat = 0;
    let valleyBetween = 1;
    for (let i = 0; i < 60 * 4; i++) {
      bt.update(DT, 0.5, false, 0, 0.8); // free-run, no onsets
      if (bt.beatNow) peakOnBeat = Math.max(peakOnBeat, bt.beatPulse);
      else valleyBetween = Math.min(valleyBetween, bt.beatPulse);
    }
    expect(peakOnBeat).toBeGreaterThan(0.9);
    expect(valleyBetween).toBeLessThan(0.3);
  });

  it('reports near-zero confidence when tempo confidence is zero', () => {
    const bt = new BeatTracker();
    for (let i = 0; i < 200; i++) bt.update(DT, 0, false, 0, 0);
    expect(bt.beatConfidence).toBeLessThan(0.1);
  });
});
