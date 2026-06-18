import { describe, it, expect } from 'vitest';
import { Hud } from '../../src/ui/Hud';
import type { AudioFeatures } from '../../src/types';

function features(p: Partial<AudioFeatures> & { bands?: Partial<AudioFeatures['bands']> } = {}): AudioFeatures {
  return {
    loudness: 0, energy: 0,
    bands: { bass: 0, lowMid: 0, mid: 0, high: 0, ...(p.bands ?? {}) },
    beat: 0, motionSpeed: 1, tempoBpm: null, presence: 0, drop: 0,
    beatPhase: 0, beatConfidence: 0, ...p,
  } as AudioFeatures;
}

const noopCallbacks = {
  onSelect: () => {}, onSensitivity: () => {}, onToggleFullscreen: () => {}, onLogin: () => {},
};

describe('Hud', () => {
  it('mounts the controls dock and now-playing chip', () => {
    const mount = document.createElement('div');
    new Hud(mount, noopCallbacks);
    expect(mount.querySelector('.hud-dock')).not.toBeNull();
    expect(mount.querySelector('.hud-np')).not.toBeNull();
  });

  it('update() sets the --accent variable from the hue', () => {
    const mount = document.createElement('div');
    const hud = new Hud(mount, noopCallbacks);
    hud.update(features(), 280);
    expect(mount.style.getPropertyValue('--accent')).toBe('hsl(280, 90%, 62%)');
  });

  it('update() drives the meter bars from the features', () => {
    const mount = document.createElement('div');
    const hud = new Hud(mount, noopCallbacks);
    hud.update(features({ energy: 1, bands: { bass: 1, lowMid: 1, mid: 1, high: 1 } }), 200);
    const bars = mount.querySelectorAll<HTMLElement>('.hud-meter-bar');
    expect(bars).toHaveLength(5);
    expect(parseInt(bars[0].style.height)).toBeGreaterThan(0);
  });
});
