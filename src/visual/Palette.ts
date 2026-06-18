export class Palette {
  baseHue = 200;
  private target = 200;

  /** Point the palette at a new color family (the SceneController calls this). */
  setTarget(hue: number): void {
    this.target = ((hue % 360) + 360) % 360;
  }

  update(dt: number, motionSpeed: number): void {
    // The target drifts gently on its own, and baseHue eases toward it — so a scene
    // change (setTarget) sweeps smoothly into the new color family rather than snapping.
    this.target = (this.target + dt * 12 * motionSpeed) % 360;
    let diff = ((this.target - this.baseHue + 540) % 360) - 180; // shortest path
    this.baseHue = (this.baseHue + diff * Math.min(1, dt * 2) + 360) % 360;
  }

  hsl(h: number, s: number, l: number, a = 1): string {
    const hue = ((h % 360) + 360) % 360;
    return `hsla(${hue},${s}%,${l}%,${a})`;
  }
}
