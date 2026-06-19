import { WAVEFORM } from '../config';
import type { AnalyzedTrack } from '../audio/offline/types';
import type { Transport } from '../audio/Transport';
import type { AudioFeatures } from '../types';
import { bandPeaks, sampleBands, waveformWindow, barSeconds, pointerTime, formatTime, barNumber, currentSection, tierColor } from './waveform';
import type { BandPeaks } from './waveform';
import { setButtonIcon, WaveformBandLegend, WaveformCanvasPane, WaveformTransportRow } from './WaveformPanelComponents';

/** Bottom panel (file-only): transport controls + a scrolling band-colored waveform. */
export class WaveformPanel {
  readonly el = document.createElement('div');
  private row = new WaveformTransportRow();
  private legend = new WaveformBandLegend();
  private canvasPane = new WaveformCanvasPane();
  private canvas = this.canvasPane.canvas;
  private cctx: CanvasRenderingContext2D | null = null;
  private wrap = this.canvasPane.el;
  private playBtn = this.row.controls.playBtn;
  private toggleBtn = this.row.toggleBtn;
  private timeEl = this.row.info.timeEl;
  private bpmEl = this.row.info.bpmEl;
  private bpmDot = this.row.info.bpmDot;
  private barEl = this.row.info.barEl;
  private sectionEl = this.row.info.sectionEl;
  private sectionDot = this.row.info.sectionDot;
  private sectionLabel = this.row.info.sectionLabel;
  private energyFill = this.row.info.energyFill;
  private legendEl = this.legend.el;
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
    this.el.append(this.row.el, this.legend.el, this.canvasPane.el);
    try { this.cctx = this.canvas.getContext('2d'); } catch { this.cctx = null; }

    this.row.controls.backBtn.addEventListener('click', () => this.skip(-1));
    this.row.controls.fwdBtn.addEventListener('click', () => this.skip(1));
    this.row.controls.startBtn.addEventListener('click', () => this.seekToStart());
    this.row.controls.endBtn.addEventListener('click', () => this.seekToEnd());
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
    setButtonIcon(this.toggleBtn, 'eye');
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
    setButtonIcon(this.playBtn, this.transport.isPlaying ? 'pause' : 'play');
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
    setButtonIcon(this.playBtn, this.transport.isPlaying ? 'pause' : 'play');
  }

  private toggleWave(): void {
    this.showWave = !this.showWave;
    this.wrap.classList.toggle('hidden', !this.showWave);
    this.legendEl.classList.toggle('hidden', !this.showWave);
    setButtonIcon(this.toggleBtn, this.showWave ? 'eye' : 'eyeoff');
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
