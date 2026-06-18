import type { ProgressStage } from '../audio/sources/AnalyzedFileSource';

/** A small centered overlay shown while a file is decoded and analyzed before playback. */
export class AnalysisOverlay {
  private el: HTMLDivElement;
  private label: HTMLDivElement;
  private bar: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'analysis-overlay hidden';
    this.label = document.createElement('div');
    this.label.className = 'analysis-label';
    const track = document.createElement('div');
    track.className = 'analysis-track';
    this.bar = document.createElement('div');
    this.bar.className = 'analysis-bar';
    track.appendChild(this.bar);
    this.el.appendChild(this.label);
    this.el.appendChild(track);
    parent.appendChild(this.el);
  }

  update(stage: ProgressStage, pct: number): void {
    if (stage === 'ready') {
      this.el.classList.add('hidden');
      return;
    }
    this.el.classList.remove('hidden');
    const p = Math.round(pct * 100);
    this.label.textContent = stage === 'decoding' ? 'Decoding…' : `Analyzing… ${p}%`;
    this.bar.style.width = `${p}%`;
  }
}
