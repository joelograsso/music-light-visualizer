import { describe, it, expect } from 'vitest';
import { DropDetector } from '../../src/audio/DropDetector';

const FPS = 1 / 0.016;
function warm(d: DropDetector, energy: number, seconds: number): void {
  const n = Math.round(seconds * FPS);
  for (let i = 0; i < n; i++) d.update(energy, 0.016);
}

describe('DropDetector', () => {
  it('fires a strong envelope on a sudden energy jump (after warmup)', () => {
    const d = new DropDetector();
    warm(d, 0.35, 11); // past the warmup, settled groove
    let peak = 0;
    for (let i = 0; i < 40; i++) peak = Math.max(peak, d.update(0.9, 0.016));
    expect(peak).toBeGreaterThan(0.9);
  });

  it('does NOT fire during a song’s opening seconds (warmup), even on a sudden jump', () => {
    const d = new DropDetector();
    warm(d, 0.35, 2); // only 2s into the song
    let peak = 0;
    for (let i = 0; i < 40; i++) peak = Math.max(peak, d.update(0.9, 0.016));
    expect(peak).toBeLessThan(0.5);
  });

  it('does NOT fire on the intro ramp-up from silence', () => {
    const d = new DropDetector();
    let peak = 0;
    for (let i = 0; i < 180; i++) {
      const e = Math.min(0.9, (i / 180) * 0.9); // 0 -> 0.9 over ~3s
      peak = Math.max(peak, d.update(e, 0.016));
    }
    expect(peak).toBeLessThan(0.5);
  });

  it('does NOT fire on a slow gradual ramp (even after warmup)', () => {
    const d = new DropDetector();
    warm(d, 0.2, 11);
    let peak = 0;
    for (let i = 0; i < 600; i++) {
      const e = Math.min(0.9, 0.2 + (i / 600) * 0.7);
      peak = Math.max(peak, d.update(e, 0.016));
    }
    expect(peak).toBeLessThan(0.5);
  });

  it('re-warms after a sustained silence (treats it as a new song)', () => {
    const d = new DropDetector();
    warm(d, 0.4, 11); // song 1, warmed up
    warm(d, 0.0, 2);  // sustained gap -> re-warm
    warm(d, 0.4, 1);  // new song, only 1s in
    let peak = 0;
    for (let i = 0; i < 40; i++) peak = Math.max(peak, d.update(0.9, 0.016));
    expect(peak).toBeLessThan(0.5);
  });

  it('still fires through a brief silence right before a drop (does not re-warm)', () => {
    const d = new DropDetector();
    warm(d, 0.4, 11);  // warmed
    warm(d, 0.0, 0.6); // brief pre-drop silence (< gapSec) -> stays warmed
    let peak = 0;
    for (let i = 0; i < 40; i++) peak = Math.max(peak, d.update(0.9, 0.016));
    expect(peak).toBeGreaterThan(0.9);
  });

  it('respects the cooldown — only one spike per drop', () => {
    const d = new DropDetector();
    warm(d, 0.3, 11);
    let spikes = 0;
    let prev = 0;
    for (let i = 0; i < 120; i++) {
      const e = d.update(0.9, 0.016);
      if (prev < 0.5 && e > 0.95) spikes++;
      prev = e;
    }
    expect(spikes).toBe(1);
  });

  it('decays back to zero after firing', () => {
    const d = new DropDetector();
    warm(d, 0.3, 11);
    let e = 0;
    for (let i = 0; i < 240; i++) e = d.update(0.9, 0.016);
    expect(e).toBeLessThan(0.05);
  });
});
