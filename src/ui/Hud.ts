import type { AudioFeatures } from '../types';
import type { SourceKind } from '../audio/InputManager';
import type { AnalyzedTrack } from '../audio/offline/types';
import type { Transport } from '../audio/Transport';
import { Controls } from './Controls';
import { NowPlaying } from './NowPlaying';
import { WaveformPanel } from './WaveformPanel';
import { meterLevels } from './meter';

export interface HudCallbacks {
  onSelect: (kind: SourceKind, file?: File) => void | Promise<void>;
  onSensitivity: (value: number) => void;
  onToggleFullscreen: () => void;
  onLogin: () => void;
}

/** Owns the HUD panels and routes per-frame data (scene tint + meter + waveform) to them. */
export class Hud {
  readonly controls: Controls;
  readonly nowPlaying: NowPlaying;
  readonly waveform: WaveformPanel;

  constructor(private mount: HTMLElement, cb: HudCallbacks) {
    this.controls = new Controls(cb.onSelect, cb.onSensitivity, cb.onToggleFullscreen);
    this.nowPlaying = new NowPlaying(cb.onLogin);
    this.waveform = new WaveformPanel();
    mount.appendChild(this.controls.el);
    mount.appendChild(this.nowPlaying.el);
    mount.appendChild(this.waveform.el);
  }

  /** Show the file transport + waveform panel and lift the dock above it. */
  showWaveform(track: AnalyzedTrack, transport: Transport): void {
    this.waveform.show(track, transport);
    this.mount.classList.add('has-waveform');
  }

  /** Hide the panel (non-file sources, or analysis fallback). */
  hideWaveform(): void {
    this.waveform.hide();
    this.mount.classList.remove('has-waveform');
  }

  /** Called each frame: tint the HUD, update the meter, and redraw the waveform. */
  update(features: AudioFeatures, hue: number): void {
    const h = Math.round(((hue % 360) + 360) % 360);
    this.mount.style.setProperty('--accent', `hsl(${h}, 90%, 62%)`);
    this.controls.setMeter(meterLevels(features));
    this.waveform.frame(features);
  }
}
