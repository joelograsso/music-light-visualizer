import type { SourceKind } from '../audio/InputManager';
import { ENERGY } from '../config';

export class Controls {
  readonly el = document.createElement('div');
  constructor(
    private onSelect: (kind: SourceKind, file?: File) => void,
    private onSensitivity: (value: number) => void,
  ) {
    this.el.style.cssText =
      'position:fixed;left:16px;bottom:16px;display:flex;gap:8px;align-items:center;' +
      'background:rgba(10,12,22,.6);padding:10px 12px;border-radius:10px;font:13px ui-monospace,monospace;';
    this.el.innerHTML = `
      <button data-k="mic">🎤 Mic</button>
      <button data-k="display" title="Share a browser tab's audio. On macOS, full system audio needs a virtual device like BlackHole.">🖥️ Tab/System</button>
      <label style="cursor:pointer">📁 File<input type="file" accept="audio/*" hidden></label>
      <label title="Calibrate to your audio level: lower if it maxes out too easily, raise if it stays dim."
             style="display:flex;align-items:center;gap:6px;margin-left:6px;opacity:.85">
        sens
        <input id="sens" type="range" min="${ENERGY.minSensitivity}" max="${ENERGY.maxSensitivity}"
               step="0.05" value="${ENERGY.defaultSensitivity}" style="width:90px">
      </label>
      <span id="status" style="opacity:.6;margin-left:6px"></span>`;
    this.el.querySelectorAll('button[data-k]').forEach((b) =>
      b.addEventListener('click', () => this.pick(b.getAttribute('data-k') as SourceKind)));
    const input = this.el.querySelector('input[type=file]') as HTMLInputElement;
    input.addEventListener('change', () => {
      if (input.files?.[0]) this.pick('file', input.files[0]);
    });
    const sens = this.el.querySelector('#sens') as HTMLInputElement;
    sens.addEventListener('input', () => this.onSensitivity(parseFloat(sens.value)));
  }
  private async pick(kind: SourceKind, file?: File) {
    this.setStatus('starting ' + kind + '…');
    try { await this.onSelect(kind, file); this.setStatus('listening: ' + kind); }
    catch (e) { this.setStatus('error: ' + (e as Error).message); }
  }
  setStatus(s: string) { (this.el.querySelector('#status') as HTMLElement).textContent = s; }
}
