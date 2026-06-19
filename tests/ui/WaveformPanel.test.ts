import { describe, it, expect, beforeEach } from 'vitest';
import { WaveformPanel } from '../../src/ui/WaveformPanel';
import type { AnalyzedTrack } from '../../src/audio/offline/types';
import type { AudioFeatures } from '../../src/types';

function track(over: Partial<AnalyzedTrack> = {}): AnalyzedTrack {
  const z = (v: number[]) => Float32Array.from(v);
  return {
    duration: 100, sampleRate: 44100, frameRate: 1, tempoBpm: 120,
    loudness: z([0, 1, 0]), presence: z([1, 1, 1]),
    bass: z([0, 0, 0]), lowMid: z([0, 0, 0]), mid: z([0, 0, 0]), high: z([0, 0, 0]),
    onset: z([0, 0, 0]), anticipation: z([0, 0, 0]),
    beats: z([]), downbeats: z([]), drops: [], sections: [],
    ...over,
  };
}

function fakeTransport() {
  return {
    isPlaying: false,
    duration: 100,
    calls: [] as any[],
    position() { return 10; },
    play() { this.isPlaying = true; this.calls.push('play'); },
    pause() { this.isPlaying = false; this.calls.push('pause'); },
    seek(s: number) { this.calls.push(['seek', s]); },
    stop() {},
    get output() { return {} as any; },
  };
}

const F = (over: Partial<AudioFeatures> = {}): AudioFeatures =>
  ({ beat: 0, energy: 0, ...over } as AudioFeatures);

describe('WaveformPanel', () => {
  let root: HTMLElement;
  beforeEach(() => { root = document.createElement('div'); document.body.appendChild(root); });

  it('the eye toggle hides and shows the canvas', () => {
    const p = new WaveformPanel(); root.appendChild(p.el);
    p.show(track(), fakeTransport() as any);
    const wrap = p.el.querySelector('.hud-wave-canvas-wrap') as HTMLElement;
    const toggle = p.el.querySelector('[data-a="toggle"]') as HTMLButtonElement;
    expect(wrap.classList.contains('hidden')).toBe(false);
    toggle.click();
    expect(wrap.classList.contains('hidden')).toBe(true);
    toggle.click();
    expect(wrap.classList.contains('hidden')).toBe(false);
  });

  it('play/pause calls the transport and updates the icon', () => {
    const p = new WaveformPanel(); root.appendChild(p.el);
    const tr = fakeTransport();
    p.show(track(), tr as any);
    const play = p.el.querySelector('[data-a="play"]') as HTMLButtonElement;
    play.click();
    expect(tr.calls).toContain('play');
    play.click();
    expect(tr.calls).toContain('pause');
  });

  it('skip buttons seek by one bar', () => {
    const p = new WaveformPanel(); root.appendChild(p.el);
    const tr = fakeTransport();
    p.show(track(), tr as any); // tempoBpm 120 -> barSec 2, position 10
    (p.el.querySelector('[data-a="back"]') as HTMLButtonElement).click();
    (p.el.querySelector('[data-a="fwd"]') as HTMLButtonElement).click();
    expect(tr.calls).toContainEqual(['seek', 8]);
    expect(tr.calls).toContainEqual(['seek', 12]);
  });

  it('click on the canvas seeks to the pointed time', () => {
    const p = new WaveformPanel(); root.appendChild(p.el);
    const tr = fakeTransport();
    p.show(track(), tr as any);
    const canvas = p.el.querySelector('canvas') as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 110, right: 100, bottom: 110, x: 0, y: 0, toJSON() {} });
    canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 50, bubbles: true }));
    expect(tr.calls).toContainEqual(['seek', 10]); // frac .5 -> t0 2 + .5*16
  });

  it('frame() updates the time readout and does not throw without a 2D context', () => {
    const p = new WaveformPanel(); root.appendChild(p.el);
    p.show(track(), fakeTransport() as any);
    expect(() => p.frame(F())).not.toThrow();
    expect((p.el.querySelector('.hud-wtime') as HTMLElement).textContent).toBe('0:10 / 1:40');
  });

  it('jump-to-start/end seek to the track ends', () => {
    const p = new WaveformPanel(); root.appendChild(p.el);
    const tr = fakeTransport(); // duration 100
    p.show(track(), tr as any);
    (p.el.querySelector('[data-a="start"]') as HTMLButtonElement).click();
    (p.el.querySelector('[data-a="end"]') as HTMLButtonElement).click();
    expect(tr.calls).toContainEqual(['seek', 0]);
    expect(tr.calls).toContainEqual(['seek', 99.95]); // duration 100 - 0.05
  });

  it('frame() shows BPM, bar number, and the current section', () => {
    const p = new WaveformPanel(); root.appendChild(p.el);
    const secs = [
      { start: 0, end: 50, intensity: 0.2, tier: 'calm' as const },
      { start: 50, end: 100, intensity: 0.9, tier: 'peak' as const },
    ];
    p.show(track({ tempoBpm: 120, sections: secs }), fakeTransport() as any); // position 10, barSec 2
    p.frame(F({ beat: 1, energy: 0.5 }));
    expect((p.el.querySelector('.hud-wbpm b') as HTMLElement).textContent).toBe('120');
    expect((p.el.querySelector('.hud-wbar b') as HTMLElement).textContent).toBe('6'); // floor(10/2)+1
    const section = p.el.querySelector('.hud-wsection') as HTMLElement;
    expect(section.classList.contains('hidden')).toBe(false);
    expect((section.querySelector('b') as HTMLElement).textContent).toBe('§1 · calm'); // pos 10 -> section 0
    expect((p.el.querySelector('.hud-wenergy i') as HTMLElement).style.width).toBe('50%');
  });

  it('frame() hides the section chip when the track has no sections', () => {
    const p = new WaveformPanel(); root.appendChild(p.el);
    p.show(track({ sections: [] }), fakeTransport() as any);
    p.frame(F());
    expect((p.el.querySelector('.hud-wsection') as HTMLElement).classList.contains('hidden')).toBe(true);
  });

  it('renders a 3-band color legend that hides with the waveform', () => {
    const p = new WaveformPanel(); root.appendChild(p.el);
    p.show(track(), fakeTransport() as any);
    expect(p.el.querySelectorAll('.hud-wleg').length).toBe(3);
    const legend = p.el.querySelector('.hud-wlegend') as HTMLElement;
    expect(legend.classList.contains('hidden')).toBe(false);
    (p.el.querySelector('[data-a="toggle"]') as HTMLButtonElement).click();
    expect(legend.classList.contains('hidden')).toBe(true);
  });
});
