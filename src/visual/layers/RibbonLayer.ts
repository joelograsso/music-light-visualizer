import type { Layer, RenderEnv } from '../Layer';

export class RibbonLayer implements Layer {
  update(_env: RenderEnv): void { /* stateless */ }

  render(env: RenderEnv): void {
    const { ctx, w, cy, features: f, palette: p, t, gates } = env;
    const a = gates.ribbons;
    if (a <= 0.01) return;
    const spd = f.motionSpeed;
    const RIBBONS = 5;
    for (let b = 0; b < RIBBONS; b++) {
      const hue = p.baseHue + b * 50;
      // Peaks stay modest when quiet but grow much taller at high energy.
      const amp = (10 + f.energy * 115) + b * 5;
      // Each ribbon gets a DISTINCT wavelength and a DESYNCED envelope, so they weave
      // and cross consistently and never all pinch flat at the same place (which is
      // what made them collapse into parallel "lines").
      const kCarrier = 0.011 + b * 0.0035;
      const kEnv = 0.006 + b * 0.0019;
      const carrierPhase = b * 1.3;
      const envPhase = b * 2.3;
      ctx.beginPath();
      for (let px = 0; px <= w; px += 8) {
        const y =
          cy +
          Math.sin(px * kCarrier + t * spd * 0.8 + carrierPhase) *
            amp *
            Math.sin(px * kEnv + t * 0.4 + envPhase);
        px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
      }
      ctx.strokeStyle = p.hsl(hue, 80, 60, 0.16 * a);
      ctx.lineWidth = 2 + f.energy * 2.5;
      ctx.stroke();
    }
  }
}
