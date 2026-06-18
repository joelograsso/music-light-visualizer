import { SCENES, SCENE_SWITCH } from '../config';
import type { Palette } from './Palette';

/**
 * Rotates the show through "scenes" (color family + kaleidoscope symmetry). Switches
 * on each drop — but no sooner than minSeconds after the last switch — and falls back
 * to switching every maxSeconds so the look evolves even on a drop-less stretch.
 */
export class SceneController {
  index = 0;
  private timeIn = 0;
  private prevDrop = 0;

  constructor(private palette: Palette) {
    this.palette.setTarget(SCENES[0].hue);
  }

  get segments(): number {
    return SCENES[this.index].segments;
  }

  update(dt: number, drop: number): void {
    this.timeIn += dt;
    const dropEdge = this.prevDrop < 0.5 && drop > 0.9;
    this.prevDrop = drop;

    if ((dropEdge && this.timeIn >= SCENE_SWITCH.minSeconds) || this.timeIn >= SCENE_SWITCH.maxSeconds) {
      this.advance();
    }
  }

  private advance(): void {
    this.index = (this.index + 1) % SCENES.length;
    this.timeIn = 0;
    this.palette.setTarget(SCENES[this.index].hue);
  }
}
