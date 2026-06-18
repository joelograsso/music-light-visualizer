import type { SourceKind } from '../audio/InputManager';
import { ENERGY } from '../config';

const ICON: Record<string, string> = {
  mic: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="6" y="2" width="4" height="7" rx="2"/><path d="M4 8a4 4 0 0 0 8 0M8 12v2"/></svg>',
  display: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="3" width="12" height="8" rx="1"/><path d="M6 14h4M8 11v3"/></svg>',
  file: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3"/><circle cx="7" cy="10.5" r="1.3"/><path d="M8.3 10.5V7l2 .6"/></svg>',
  maximize: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3"/></svg>',
  minimize: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M6 3v3H3M10 3v3h3M6 13v-3H3M10 13v-3h3"/></svg>',
};

/** Bottom-center dock: source selector, reactive meter, sensitivity, fullscreen button. */
export class Controls {
  readonly el = document.createElement('div');
  private bars: HTMLElement[] = [];
  private fsBtn: HTMLButtonElement;

  constructor(
    private onSelect: (kind: SourceKind, file?: File) => void | Promise<void>,
    private onSensitivity: (value: number) => void,
    private onToggleFullscreen: () => void,
  ) {
    this.el.className = 'hud-dock';
    this.el.innerHTML = `
      <div class="hud-accent-line"></div>
      <div class="hud-sources">
        <button class="hud-src is-active" data-k="mic" title="Microphone" aria-label="Microphone">${ICON.mic}</button>
        <button class="hud-src" data-k="display" title="Tab / system audio" aria-label="Tab or system audio">${ICON.display}</button>
        <label class="hud-src" data-k="file" title="Audio file" aria-label="Audio file">${ICON.file}<input type="file" accept="audio/*" hidden></label>
      </div>
      <div class="hud-meter">${'<span class="hud-meter-bar"></span>'.repeat(5)}</div>
      <label class="hud-sens" title="Sensitivity — lower if it maxes out, raise if it stays dim">sens
        <input id="sens" type="range" min="${ENERGY.minSensitivity}" max="${ENERGY.maxSensitivity}" step="0.05" value="${ENERGY.defaultSensitivity}">
      </label>
      <span class="hud-status"></span>
      <button class="hud-fs" title="Fullscreen (F)" aria-label="Toggle fullscreen">${ICON.maximize}</button>`;

    this.bars = Array.from(this.el.querySelectorAll('.hud-meter-bar'));

    // Source buttons trigger immediately; the file <label> opens its hidden input natively
    // (no preventDefault) and reports via the input's change event.
    this.el.querySelectorAll('[data-k]').forEach((b) =>
      b.addEventListener('click', () => {
        const kind = b.getAttribute('data-k') as SourceKind;
        if (kind !== 'file') this.pick(kind);
      }));
    const fileInput = this.el.querySelector('input[type=file]') as HTMLInputElement;
    fileInput.addEventListener('change', () => {
      if (fileInput.files?.[0]) this.pick('file', fileInput.files[0]);
    });

    const sens = this.el.querySelector('#sens') as HTMLInputElement;
    sens.addEventListener('input', () => this.onSensitivity(parseFloat(sens.value)));

    this.fsBtn = this.el.querySelector('.hud-fs') as HTMLButtonElement;
    this.fsBtn.addEventListener('click', () => this.onToggleFullscreen());
  }

  /** Set the 5 meter bar heights from 0..1 levels. */
  setMeter(levels: number[]): void {
    for (let i = 0; i < this.bars.length; i++) {
      const v = Math.max(0, Math.min(1, levels[i] ?? 0));
      this.bars[i].style.height = `${Math.round(v * 100)}%`;
    }
  }

  /** Swap the fullscreen button icon to reflect the current state. */
  setFullscreen(active: boolean): void {
    this.fsBtn.innerHTML = active ? ICON.minimize : ICON.maximize;
  }

  setStatus(s: string): void {
    (this.el.querySelector('.hud-status') as HTMLElement).textContent = s;
  }

  private setActive(kind: SourceKind): void {
    this.el.querySelectorAll('.hud-src').forEach((b) =>
      b.classList.toggle('is-active', b.getAttribute('data-k') === kind));
  }

  private async pick(kind: SourceKind, file?: File): Promise<void> {
    this.setActive(kind);
    this.setStatus('starting ' + kind + '…');
    try { await this.onSelect(kind, file); this.setStatus('listening: ' + kind); }
    catch (e) { this.setStatus('error: ' + (e as Error).message); }
  }
}
