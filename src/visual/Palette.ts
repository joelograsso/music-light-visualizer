export class Palette {
  baseHue = 200;

  update(dt: number, motionSpeed: number): void {
    this.baseHue = (this.baseHue + dt * 30 * motionSpeed) % 360;
  }

  hsl(h: number, s: number, l: number, a = 1): string {
    const hue = ((h % 360) + 360) % 360;
    return `hsla(${hue},${s}%,${l}%,${a})`;
  }
}
