import { describe, it, expect } from 'vitest';
import { PlayClock } from '../../src/audio/PlayClock';

describe('PlayClock', () => {
  it('advances while playing and freezes when paused', () => {
    const c = new PlayClock(10);
    c.play(0);
    expect(c.position(0)).toBeCloseTo(0, 5);
    expect(c.position(3)).toBeCloseTo(3, 5);
    c.pause(5);
    expect(c.isPlaying).toBe(false);
    expect(c.position(100)).toBeCloseTo(5, 5);
  });

  it('resumes from the paused offset', () => {
    const c = new PlayClock(10);
    c.play(0); c.pause(4); c.play(100);
    expect(c.position(102)).toBeCloseTo(6, 5);
  });

  it('seeks to an absolute position', () => {
    const c = new PlayClock(10);
    c.play(0); c.seek(8, 2);
    expect(c.position(2)).toBeCloseTo(8, 5);
    expect(c.position(3)).toBeCloseTo(9, 5);
  });

  it('wraps position for looping', () => {
    const c = new PlayClock(10);
    c.play(0);
    expect(c.position(12)).toBeCloseTo(2, 5);
    expect(c.position(25)).toBeCloseTo(5, 5);
  });

  it('clamps seeks into range', () => {
    const c = new PlayClock(10);
    c.seek(999, 0);
    expect(c.position(0)).toBeLessThan(10);
    c.seek(-5, 0);
    expect(c.position(0)).toBeCloseTo(0, 5);
  });
});
