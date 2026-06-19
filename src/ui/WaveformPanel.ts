import { WAVEFORM } from '../config';
import type { AnalyzedTrack } from '../audio/offline/types';
import type { Transport } from '../audio/Transport';
import type { AudioFeatures } from '../types';
import { bandPeaks, waveformColumn, waveformGridMarkers, waveformWindow, barSeconds, formatTime, barNumber, currentSection, tierColor } from './waveform';
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
  private dragStartX = 0;
  private dragStartPos = 0;
  private dragWindowSec = WAVEFORM.fallbackWindowSec;
  private dragPointerId: number | null = null;
  private endDrag = (e?: PointerEvent): void => {
    if (!this.dragging) return;
    if (e && this.dragPointerId !== null && e.pointerId !== this.dragPointerId) return;
    if (this.dragPointerId !== null) {
      try { this.canvas.releasePointerCapture(this.dragPointerId); } catch { /* pointer already released */ }
    }
    this.dragging = false;
    this.dragPointerId = null;
    this.wrap.classList.remove('dragging');
  };

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

    this.canvas.addEventListener('pointerdown', (e) => this.beginDrag(e));
    this.canvas.addEventListener('pointermove', (e) => this.dragTo(e));
    window.addEventListener('pointerup', this.endDrag);
    window.addEventListener('pointercancel', this.endDrag);
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
    this.endDrag();
  }

  /** Detach the global pointerup listener (call if the panel is ever discarded). */
  destroy(): void {
    window.removeEventListener('pointerup', this.endDrag);
    window.removeEventListener('pointercancel', this.endDrag);
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

  private beginDrag(e: PointerEvent): void {
    if (!this.transport || !this.track) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0) return;
    e.preventDefault();
    this.dragging = true;
    this.dragStartX = e.clientX;
    this.dragStartPos = this.transport.position();
    this.dragWindowSec = waveformWindow(this.dragStartPos, this.track.tempoBpm).windowSec;
    this.dragPointerId = typeof e.pointerId === 'number' ? e.pointerId : null;
    if (this.dragPointerId !== null) {
      try { this.canvas.setPointerCapture(this.dragPointerId); } catch { /* capture is best-effort */ }
    }
    if (this.transport.isPlaying) {
      this.transport.pause();
      setButtonIcon(this.playBtn, 'play');
    }
    this.wrap.classList.add('dragging');
  }

  private dragTo(e: PointerEvent): void {
    if (!this.dragging || !this.transport || !this.track) return;
    if (this.dragPointerId !== null && e.pointerId !== this.dragPointerId) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0) return;
    e.preventDefault();
    const deltaSec = ((e.clientX - this.dragStartX) / rect.width) * this.dragWindowSec;
    const nextPos = Math.max(0, Math.min(this.track.duration, this.dragStartPos - deltaSec));
    this.transport.seek(nextPos);
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

    ctx.lineWidth = 1;
    ctx.globalAlpha = WAVEFORM.waveStrokeAlpha;
    ctx.lineCap = 'butt';

    // Single mirrored waveform envelope: height follows loudness, color follows the dominant
    // frequency band. This avoids the solid stacked blocks produced by filling each band.
    for (let x = 0; x < w; x++) {
      const t = t0 + ((x + 0.5) / w) * windowSec;
      if (t < 0 || t > dur) continue;
      const col = waveformColumn(this.track, t, this.peaks);
      if (col.amplitude <= 0) continue;
      const half = Math.max(1, col.amplitude * maxHalf);
      ctx.strokeStyle = col.color;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, mid - half);
      ctx.lineTo(x + 0.5, mid + half);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const grid = waveformGridMarkers(pos, this.track.tempoBpm, dur);
    const beatSpacing = grid.length > 1 ? Math.abs((grid[1].x - grid[0].x) * w) : Infinity;
    const showBeatLabels = beatSpacing >= WAVEFORM.minBeatLabelSpacingPx;

    ctx.lineWidth = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '10px ui-monospace, monospace';
    for (const marker of grid) {
      const x = marker.x * w;
      const isBar = marker.isBarStart;
      ctx.strokeStyle = isBar ? WAVEFORM.barColor : WAVEFORM.subbarColor;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, isBar ? 0 : 12);
      ctx.lineTo(x + 0.5, isBar ? h : h - 12);
      ctx.stroke();

      if (showBeatLabels || isBar) {
        ctx.fillStyle = isBar ? WAVEFORM.barLabelColor : WAVEFORM.subbarLabelColor;
        const labelX = Math.max(14, Math.min(w - 14, x));
        ctx.fillText(marker.label, labelX, 3);
      }
    }

    ctx.fillStyle = WAVEFORM.playheadColor;
    ctx.fillRect(w / 2 - 1, 0, 2, h);
  }
}
