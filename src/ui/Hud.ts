import type { AudioFeatures } from '../types';
import type { SourceKind } from '../audio/InputManager';
import { Controls } from './Controls';
import { NowPlaying } from './NowPlaying';
import { meterLevels } from './meter';

export interface HudCallbacks {
  onSelect: (kind: SourceKind, file?: File) => void | Promise<void>;
  onSensitivity: (value: number) => void;
  onToggleFullscreen: () => void;
  onLogin: () => void;
}

/** Owns the two HUD panels and routes per-frame data (scene tint + meter) to them. */
export class Hud {
  readonly controls: Controls;
  readonly nowPlaying: NowPlaying;

  constructor(private mount: HTMLElement, cb: HudCallbacks) {
    this.controls = new Controls(cb.onSelect, cb.onSensitivity, cb.onToggleFullscreen);
    this.nowPlaying = new NowPlaying(cb.onLogin);
    mount.appendChild(this.controls.el);
    mount.appendChild(this.nowPlaying.el);
  }

  /** Called each frame: tint the HUD to the scene hue and update the reactive meter. */
  update(features: AudioFeatures, hue: number): void {
    const h = Math.round(((hue % 360) + 360) % 360);
    this.mount.style.setProperty('--accent', `hsl(${h}, 90%, 62%)`);
    this.controls.setMeter(meterLevels(features));
  }
}
