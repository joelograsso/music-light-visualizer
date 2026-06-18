import { describe, it, expect } from 'vitest';
import { StageController } from '../../src/visual/StageController';

describe('StageController', () => {
  const sc = new StageController();
  it('all layers closed at zero energy', () => {
    const g = sc.gates(0);
    expect(g.ribbons).toBe(0);
    expect(g.blooms).toBe(0);
    expect(g.kaleidoscope).toBe(0);
  });
  it('ribbons open before blooms before kaleidoscope', () => {
    const g = sc.gates(0.3);
    expect(g.ribbons).toBe(1);
    expect(g.blooms).toBeGreaterThan(0);
    expect(g.blooms).toBeLessThan(1);
    expect(g.kaleidoscope).toBe(0);
  });
  it('all open at high energy', () => {
    const g = sc.gates(0.95);
    expect(g.ribbons).toBe(1);
    expect(g.blooms).toBe(1);
    expect(g.kaleidoscope).toBe(1);
  });
});
