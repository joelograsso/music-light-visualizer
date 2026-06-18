import { describe, it, expect } from 'vitest';
import { DropDetector } from '../../src/audio/DropDetector';

describe('DropDetector', () => {
  it('fires a strong envelope on a sudden energy jump', () => {
    const d = new DropDetector();
    for (let i = 0; i < 120; i++) d.update(0.35, 0.016); // settle at moderate
    let peak = 0;
    for (let i = 0; i < 40; i++) peak = Math.max(peak, d.update(0.9, 0.016)); // sudden jump
    expect(peak).toBeGreaterThan(0.9);
  });

  it('does NOT fire on a slow gradual ramp', () => {
    const d = new DropDetector();
    let peak = 0;
    for (let i = 0; i < 600; i++) {
      const en = Math.min(0.9, (i / 600) * 0.9); // ~10s ramp
      peak = Math.max(peak, d.update(en, 0.016));
    }
    expect(peak).toBeLessThan(0.5);
  });

  it('respects the cooldown — only one spike per drop', () => {
    const d = new DropDetector();
    for (let i = 0; i < 120; i++) d.update(0.3, 0.016);
    let spikes = 0;
    let prev = 0;
    for (let i = 0; i < 120; i++) {
      const e = d.update(0.9, 0.016); // sustained high, no second jump
      if (prev < 0.5 && e > 0.95) spikes++;
      prev = e;
    }
    expect(spikes).toBe(1);
  });

  it('decays back to zero after firing', () => {
    const d = new DropDetector();
    for (let i = 0; i < 120; i++) d.update(0.3, 0.016);
    let e = 0;
    for (let i = 0; i < 240; i++) e = d.update(0.9, 0.016); // fire, then sustained (no new jump)
    expect(e).toBeLessThan(0.05);
  });
});
