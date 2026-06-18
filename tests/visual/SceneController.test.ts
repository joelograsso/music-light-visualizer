import { describe, it, expect } from 'vitest';
import { SceneController } from '../../src/visual/SceneController';
import { Palette } from '../../src/visual/Palette';
import { SCENES, SCENE_SWITCH } from '../../src/config';

const F = (over: Partial<import('../../src/types').AudioFeatures> = {}) =>
  ({ drop: 0, sectionActive: false, sectionBoundary: 0, sectionIntensity: 1, ...over } as import('../../src/types').AudioFeatures);

describe('SceneController', () => {
  it('advances to a new scene on a drop (after the minimum dwell time)', () => {
    const sc = new SceneController(new Palette());
    const first = sc.segments;
    for (let i = 0; i < 600; i++) sc.update(0.016, F()); // ~9.6s, past minSeconds
    sc.update(0.016, F({ drop: 1 })); // drop edge
    expect(sc.index).not.toBe(0);
    // segments come from the new scene
    expect(sc.segments).toBe(SCENES[sc.index].segments);
    expect(typeof first).toBe('number');
  });

  it('does NOT switch on a drop that arrives too soon (within min dwell)', () => {
    const sc = new SceneController(new Palette());
    sc.update(0.016, F({ drop: 1 })); // drop almost immediately
    expect(sc.index).toBe(0);
  });

  it('switches on the max-time fallback even without any drop', () => {
    const sc = new SceneController(new Palette());
    for (let i = 0; i < 2000; i++) sc.update(0.016, F()); // ~32s, past maxSeconds
    expect(sc.index).not.toBe(0);
  });

  it('points the palette at the active scene hue', () => {
    const p = new Palette();
    const sc = new SceneController(p);
    for (let i = 0; i < 700; i++) sc.update(0.016, F());
    sc.update(0.016, F({ drop: 1 })); // switch
    p.update(2, 1); // let the palette ease toward the new target
    // baseHue should be near the new scene's hue (within drift tolerance)
    const targetHue = SCENES[sc.index].hue;
    const diff = Math.abs(((p.baseHue - targetHue + 540) % 360) - 180);
    expect(diff).toBeLessThan(40);
  });

  it('advances on a section boundary when sections are active', () => {
    const sc = new SceneController(new Palette());
    const start = sc.index;
    sc.update(SCENE_SWITCH.minSeconds + 0.1, F({ sectionActive: true, sectionBoundary: 0 })); // time passes, no boundary
    expect(sc.index).toBe(start);
    sc.update(0.016, F({ sectionActive: true, sectionBoundary: 1 }));                         // boundary -> advance
    expect(sc.index).toBe((start + 1) % SCENES.length);
  });

  it('ignores drops for rotation when sections are active', () => {
    const sc = new SceneController(new Palette());
    const start = sc.index;
    sc.update(SCENE_SWITCH.minSeconds + 0.1, F({ sectionActive: true, drop: 1 })); // drop, but sectioned
    expect(sc.index).toBe(start);
  });
});
