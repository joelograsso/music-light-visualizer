import { describe, it, expect } from 'vitest';
import { Palette } from '../../src/visual/Palette';

describe('Palette', () => {
  it('advances hue over time scaled by motion speed', () => {
    const p = new Palette();
    const h0 = p.baseHue;
    p.update(1, 1); // 1 second at speed 1
    expect(p.baseHue).not.toBe(h0);
  });
  it('hsl() wraps hue into 0..360 and returns an hsla string', () => {
    const p = new Palette();
    expect(p.hsl(400, 90, 60, 0.5)).toMatch(/^hsla\(40,/);
  });
});
