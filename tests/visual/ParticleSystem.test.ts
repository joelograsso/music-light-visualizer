import { describe, it, expect } from 'vitest';
import { ParticleSystem } from '../../src/visual/ParticleSystem';

describe('ParticleSystem', () => {
  it('spawns and tracks live particles', () => {
    const ps = new ParticleSystem(100);
    ps.spawn({ x: 0, y: 0, vx: 1, vy: 0, hue: 10, decay: 0.1 });
    expect(ps.count).toBe(1);
  });
  it('removes particles when life reaches zero', () => {
    const ps = new ParticleSystem(100);
    ps.spawn({ x: 0, y: 0, vx: 0, vy: 0, hue: 10, decay: 0.5 });
    for (let i = 0; i < 5; i++) ps.update(0.5, 1);
    expect(ps.count).toBe(0);
  });
  it('enforces the cap by dropping the oldest', () => {
    const ps = new ParticleSystem(2);
    for (let i = 0; i < 5; i++) ps.spawn({ x: i, y: 0, vx: 0, vy: 0, hue: 0, decay: 0.001 });
    expect(ps.count).toBeLessThanOrEqual(2);
  });
  it('advances position by velocity * motionSpeed', () => {
    const ps = new ParticleSystem(10);
    ps.spawn({ x: 0, y: 0, vx: 10, vy: 0, hue: 0, decay: 0.001 });
    ps.update(1, 2);
    const positions: number[] = [];
    ps.forEach((p) => positions.push(p.x));
    expect(positions[0]).toBeCloseTo(20, 1);
  });
});
