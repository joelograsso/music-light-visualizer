import { describe, it, expect } from 'vitest';
import { detectSections } from '../../../src/audio/offline/segmentation';

// 40 beats at 0.5s spacing (120 BPM); first 20 timbre A + quiet, next 20 timbre B + loud.
function setup() {
  const beats = new Float32Array(41);
  for (let i = 0; i < 41; i++) beats[i] = i * 0.5;
  const feats: number[][] = [];
  for (let i = 0; i < 40; i++) feats.push(i < 20 ? [1, 0] : [0, 1]);
  const frameRate = 100;
  const loudness = new Float32Array(Math.round(40 * 0.5 * frameRate) + frameRate);
  for (let f = 0; f < loudness.length; f++) loudness[f] = (f / frameRate) < 10 ? 0.1 : 0.6; // quiet then loud at t=10s (beat 20)
  return { beats, feats, loudness, frameRate };
}

describe('detectSections', () => {
  it('splits a two-block song at the boundary with differing tiers', () => {
    const { beats, feats, loudness, frameRate } = setup();
    const secs = detectSections(feats, beats, loudness, frameRate);
    expect(secs.length).toBe(2);
    expect(secs[0].start).toBeCloseTo(0, 3);
    expect(Math.abs(secs[0].end - 10)).toBeLessThanOrEqual(1.5); // boundary near t=10s
    expect(secs[1].intensity).toBeGreaterThan(secs[0].intensity); // 2nd block louder
  });

  it('returns one section when the song is uniform', () => {
    const { beats, frameRate } = setup();
    const feats: number[][] = []; for (let i = 0; i < 40; i++) feats.push([1, 1]);
    const loudness = new Float32Array(2200).fill(0.3);
    const secs = detectSections(feats, beats, loudness, frameRate);
    expect(secs.length).toBe(1);
    expect(secs[0].start).toBeCloseTo(0, 3);
  });

  it('returns [] for empty features', () => {
    expect(detectSections([], new Float32Array([0]), new Float32Array(10), 100).length).toBe(0);
  });
});
