import { WAVEFORM } from '../config';
import type { AnalyzedTrack } from '../audio/offline/types';
import type { Transport } from '../audio/Transport';
import { sampleColumn, waveformWindow, barSeconds, pointerTime, formatTime } from './waveform';

const ICON = {
  back: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3v10H3.5V3z"/><path d="M13 3l-7 5 7 5z"/></svg>',
  fwd: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 3l7 5-7 5z"/><path d="M11 3v10h1.5V3z"/></svg>',
  play: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3l8 5-8 5z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="3" height="10"/><rect x="9" y="3" width="3" height="10"/></svg>',
  eye: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z"/><circle cx="8" cy="8" r="2"/></svg>',
  eyeoff: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1 8s2.5-4.5 7-4.5c1 0 1.9.2 2.7.5M15 8s-2.5 4.5-7 4.5c-1 0-1.9-.2-2.7-.5"/><path d="M2 2l12 12"/></svg>',
};

/** Bottom panel (file-only): transport controls + a scrolling band-colored waveform. */
export class WaveformPanel {
  readonly el = document.createElement('div');
  private canvas = document.createElement('canvas');
  private cctx: CanvasRenderingContext2D | null = null;
  private wrap: HTMLElement;
  private playBtn: HTMLButtonElement;
  private toggleBtn: HTMLButtonElement;
  private timeEl: HTMLElement;
  private track?: AnalyzedTrack;
  private transport?: Transport;
  private showWave = true;
  private dragging = false;

  constructor() {
    this.el.className = 'hud-wave hidden';
    this.el.innerHTML = `
      <div class="hud-wave-row">
        <button class="hud-wbtn" data-a="back" title="Back one bar" aria-label="Seek back one bar">${ICON.back}</button>
        <button class="hud-wbtn main" data-a="play" title="Play / pause" aria-label="Play or pause">${ICON.play}</button>
        <button class="hud-wbtn" data-a="fwd" title="Forward one bar" aria-label="Seek forward one bar">${ICON.fwd}</button>
        <span class="hud-wtime">0:00 / 0:00</span>
        <span class="hud-wspacer"></span>
        <button class="hud-wbtn" data-a="toggle" title="Toggle waveform" aria-label="Toggle waveform">${ICON.eye}</button>
      </div>
      <div class="hud-wave-canvas-wrap"></div>`;

    this.wrap = this.el.querySelector('.hud-wave-canvas-wrap') as HTMLElement;
    this.wrap.appendChild(this.canvas);
    this.playBtn = this.el.querySelector('[data-a="play"]') as HTMLButtonElement;
    this.toggleBtn = this.el.querySelector('[data-a="toggle"]') as HTMLButtonElement;
    this.timeEl = this.el.querySelector('.hud-wtime') as HTMLElement;
    try { this.cctx = this.canvas.getContext('2d'); } catch { this.cctx = null; }

    this.el.querySelector('[data-a="back"]')!.addEventListener('click', () => this.skip(-1));
    this.el.querySelector('[data-a="fwd"]')!.addEventListener('click', () => this.skip(1));
    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.toggleBtn.addEventListener('click', () => this.toggleWave());

    this.canvas.addEventListener('pointerdown', (e) => { this.dragging = true; this.seekTo(e); });
    this.canvas.addEventListener('pointermove', (e) => { if (this.dragging) this.seekTo(e); });
    window.addEventListener('pointerup', () => { this.dragging = false; });
  }

  show(track: AnalyzedTrack, transport: Transport): void {
    this.track = track;
    this.transport = transport;
    this.showWave = true;
    this.wrap.classList.remove('hidden');
    this.toggleBtn.innerHTML = ICON.eye;
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.el.classList.add('hidden');
    this.track = undefined;
    this.transport = undefined;
  }

  /** Called once per render frame. */
  frame(): void {
    if (this.el.classList.contains('hidden') || !this.transport || !this.track) return;
    this.timeEl.textContent = `${formatTime(this.transport.position())} / ${formatTime(this.track.duration)}`;
    this.playBtn.innerHTML = this.transport.isPlaying ? ICON.pause : ICON.play;
    if (this.showWave) this.draw();
  }

  private togglePlay(): void {
    if (!this.transport) return;
    if (this.transport.isPlaying) this.transport.pause();
    else this.transport.play();
    this.playBtn.innerHTML = this.transport.isPlaying ? ICON.pause : ICON.play;
  }

  private toggleWave(): void {
    this.showWave = !this.showWave;
    this.wrap.classList.toggle('hidden', !this.showWave);
    this.toggleBtn.innerHTML = this.showWave ? ICON.eye : ICON.eyeoff;
  }

  private step(): number {
    if (!this.track) return 5;
    const bs = barSeconds(this.track.tempoBpm) * WAVEFORM.seekStepBars;
    return bs > 0 ? bs : 5;
  }

  private skip(dir: number): void {
    if (!this.transport) return;
    this.transport.seek(this.transport.position() + dir * this.step());
  }

  private seekTo(e: PointerEvent): void {
    if (!this.transport || !this.track) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0) return;
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    this.transport.seek(pointerTime(frac, this.transport.position(), this.track.tempoBpm));
  }

  private draw(): void {
    const ctx = this.cctx;
    if (!ctx || !this.transport || !this.track) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr; this.canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pos = this.transport.position();
    const dur = this.track.duration;
    const { t0, windowSec } = waveformWindow(pos, this.track.tempoBpm);
    const mid = h / 2;
    const maxHalf = mid * WAVEFORM.heightScale;

    for (let x = 0; x < w; x++) {
      const t = t0 + (x / w) * windowSec;
      if (t < 0 || t > dur) continue;
      const s = sampleColumn(this.track, t);
      const half = Math.min(1, s.amp / WAVEFORM.ampFullScale) * maxHalf;
      ctx.fillStyle = `rgb(${s.r},${s.g},${s.b})`;
      ctx.fillRect(x, mid - half, 1, half * 2);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (const dt of this.track.downbeats) {
      if (dt < t0 || dt > t0 + windowSec) continue;
      const x = ((dt - t0) / windowSec) * w;
      ctx.fillRect(x, 0, 1, h);
    }

    ctx.fillStyle = '#fff';
    ctx.fillRect(w / 2 - 1, 0, 2, h);
  }
}
