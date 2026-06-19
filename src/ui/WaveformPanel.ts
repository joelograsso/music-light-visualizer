import { WAVEFORM } from '../config';
import type { AnalyzedTrack } from '../audio/offline/types';
import type { Transport } from '../audio/Transport';
import type { AudioFeatures } from '../types';
import { bandPeaks, sampleBands, waveformWindow, barSeconds, pointerTime, formatTime, barNumber, currentSection, tierColor } from './waveform';
import type { BandPeaks } from './waveform';

const ICON = {
  start: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="1.7" height="10"/><path d="M13 3.2v9.6L6 8z"/></svg>',
  end: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 3.2v9.6L10 8z"/><rect x="11.3" y="3" width="1.7" height="10"/></svg>',
  back: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 5 8l5 5"/></svg>',
  fwd: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>',
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
  private bpmEl!: HTMLElement;
  private bpmDot!: HTMLElement;
  private barEl!: HTMLElement;
  private sectionEl!: HTMLElement;
  private sectionDot!: HTMLElement;
  private sectionLabel!: HTMLElement;
  private energyFill!: HTMLElement;
  private legendEl!: HTMLElement;
  private lastBpm = -1;
  private lastBar = -1;
  private lastSectionIdx = -1;
  private track?: AnalyzedTrack;
  private transport?: Transport;
  private peaks?: BandPeaks;
  private showWave = true;
  private dragging = false;
  private endDrag = (): void => { this.dragging = false; };

  constructor() {
    this.el.className = 'hud-wave hidden';
    this.el.innerHTML = `
      <div class="hud-wave-row">
        <button class="hud-wbtn" data-a="start" title="Jump to start" aria-label="Jump to start">${ICON.start}</button>
        <button class="hud-wbtn" data-a="back" title="Back one bar" aria-label="Seek back one bar">${ICON.back}</button>
        <button class="hud-wbtn main" data-a="play" title="Play / pause" aria-label="Play or pause">${ICON.play}</button>
        <button class="hud-wbtn" data-a="fwd" title="Forward one bar" aria-label="Seek forward one bar">${ICON.fwd}</button>
        <button class="hud-wbtn" data-a="end" title="Jump to end" aria-label="Jump to end">${ICON.end}</button>
        <span class="hud-wtime">0:00 / 0:00</span>
        <span class="hud-wspacer"></span>
        <div class="hud-winfo">
          <span class="hud-wbpm"><i class="hud-wbpm-dot"></i><b>0</b> BPM</span>
          <span class="hud-wbar">Bar <b>1</b></span>
          <span class="hud-wsection hidden"><i class="hud-wsection-dot"></i><b></b></span>
          <span class="hud-wenergy" title="energy"><i></i></span>
        </div>
        <span class="hud-wspacer"></span>
        <button class="hud-wbtn" data-a="toggle" title="Toggle waveform" aria-label="Toggle waveform">${ICON.eye}</button>
      </div>
      <div class="hud-wlegend">
        <span class="hud-wleg-label">bands</span>
        <span class="hud-wleg"><i style="background:${WAVEFORM.lowColor}"></i>lows</span>
        <span class="hud-wleg"><i style="background:${WAVEFORM.midColor}"></i>mids</span>
        <span class="hud-wleg"><i style="background:${WAVEFORM.highColor}"></i>highs</span>
      </div>
      <div class="hud-wave-canvas-wrap"></div>`;

    this.wrap = this.el.querySelector('.hud-wave-canvas-wrap') as HTMLElement;
    this.wrap.appendChild(this.canvas);
    this.playBtn = this.el.querySelector('[data-a="play"]') as HTMLButtonElement;
    this.toggleBtn = this.el.querySelector('[data-a="toggle"]') as HTMLButtonElement;
    this.timeEl = this.el.querySelector('.hud-wtime') as HTMLElement;
    this.bpmEl = this.el.querySelector('.hud-wbpm b') as HTMLElement;
    this.bpmDot = this.el.querySelector('.hud-wbpm-dot') as HTMLElement;
    this.barEl = this.el.querySelector('.hud-wbar b') as HTMLElement;
    this.sectionEl = this.el.querySelector('.hud-wsection') as HTMLElement;
    this.sectionDot = this.el.querySelector('.hud-wsection-dot') as HTMLElement;
    this.sectionLabel = this.el.querySelector('.hud-wsection b') as HTMLElement;
    this.energyFill = this.el.querySelector('.hud-wenergy i') as HTMLElement;
    this.legendEl = this.el.querySelector('.hud-wlegend') as HTMLElement;
    try { this.cctx = this.canvas.getContext('2d'); } catch { this.cctx = null; }

    this.el.querySelector('[data-a="back"]')!.addEventListener('click', () => this.skip(-1));
    this.el.querySelector('[data-a="fwd"]')!.addEventListener('click', () => this.skip(1));
    this.el.querySelector('[data-a="start"]')!.addEventListener('click', () => this.seekToStart());
    this.el.querySelector('[data-a="end"]')!.addEventListener('click', () => this.seekToEnd());
    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.toggleBtn.addEventListener('click', () => this.toggleWave());

    this.canvas.addEventListener('pointerdown', (e) => { this.dragging = true; this.seekTo(e); });
    this.canvas.addEventListener('pointermove', (e) => { if (this.dragging) this.seekTo(e); });
    window.addEventListener('pointerup', this.endDrag);
  }

  show(track: AnalyzedTrack, transport: Transport): void {
    this.track = track;
    this.transport = transport;
    this.peaks = bandPeaks(track); // per-band normalization, computed once per track
    this.lastBpm = -1; this.lastBar = -1; this.lastSectionIdx = -1;
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

  /** Detach the global pointerup listener (call if the panel is ever discarded). */
  destroy(): void {
    window.removeEventListener('pointerup', this.endDrag);
  }

  /** Called once per render frame with the current live features. */
  frame(features: AudioFeatures): void {
    if (this.el.classList.contains('hidden') || !this.transport || !this.track) return;
    const pos = this.transport.position();
    this.timeEl.textContent = `${formatTime(pos)} / ${formatTime(this.track.duration)}`;
    this.playBtn.innerHTML = this.transport.isPlaying ? ICON.pause : ICON.play;
    this.updateInfo(features, pos);
    if (this.showWave) this.draw();
  }

  /** Update the BPM/beat-pulse, bar number, section chip, and live energy meter. */
  private updateInfo(features: AudioFeatures, pos: number): void {
    if (!this.track) return;

    const bpm = Math.round(this.track.tempoBpm);
    if (bpm !== this.lastBpm) { this.bpmEl.textContent = String(bpm); this.lastBpm = bpm; }
    this.bpmDot.style.opacity = (0.3 + 0.7 * features.beat).toFixed(3);
    this.bpmDot.style.transform = `scale(${(0.8 + 0.6 * features.beat).toFixed(3)})`;

    const bar = barNumber(pos, this.track.tempoBpm);
    if (bar !== this.lastBar) { this.barEl.textContent = String(bar); this.lastBar = bar; }

    const cur = currentSection(this.track.sections, pos);
    if (cur) {
      if (cur.index !== this.lastSectionIdx) {
        const col = tierColor(cur.section.tier);
        this.sectionEl.classList.remove('hidden');
        this.sectionLabel.textContent = `§${cur.index + 1} · ${cur.section.tier}`;
        this.sectionDot.style.background = col;
        this.sectionEl.style.borderColor = col;
        this.lastSectionIdx = cur.index;
      }
    } else if (this.lastSectionIdx !== -1) {
      this.sectionEl.classList.add('hidden');
      this.lastSectionIdx = -1;
    }

    this.energyFill.style.width = `${Math.round(features.energy * 100)}%`;
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
    this.legendEl.classList.toggle('hidden', !this.showWave);
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

  private seekToStart(): void {
    if (!this.transport) return;
    this.transport.seek(0);
  }

  private seekToEnd(): void {
    if (this.transport && this.track) this.transport.seek(Math.max(0, this.track.duration - 0.05));
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
    if (!ctx || !this.transport || !this.track || !this.peaks) return;
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
    const unit = maxHalf * WAVEFORM.bandHeightScale; // a fully-present band's height

    // Stacked, mirrored band waveform: lows (red) at the core, mids (green) then highs
    // (blue) layered outward. Each band is per-band normalized so highs stay visible.
    for (let x = 0; x < w; x++) {
      const t = t0 + (x / w) * windowSec;
      if (t < 0 || t > dur) continue;
      const b = sampleBands(this.track, t, this.peaks);
      let acc = 0;
      acc = this.stack(ctx, x, mid, acc, b.low * unit, maxHalf, WAVEFORM.lowColor);
      acc = this.stack(ctx, x, mid, acc, b.mid * unit, maxHalf, WAVEFORM.midColor);
      this.stack(ctx, x, mid, acc, b.high * unit, maxHalf, WAVEFORM.highColor);
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

  /** Draw one mirrored band segment from `acc` outward; returns the new stacked height (clamped). */
  private stack(ctx: CanvasRenderingContext2D, x: number, mid: number, acc: number, hgt: number, maxHalf: number, color: string): number {
    if (acc >= maxHalf || hgt <= 0) return acc;
    const seg = Math.min(hgt, maxHalf - acc);
    ctx.fillStyle = color;
    ctx.fillRect(x, mid - acc - seg, 1, seg); // upper half
    ctx.fillRect(x, mid + acc, 1, seg);       // lower half (mirror)
    return acc + seg;
  }
}
