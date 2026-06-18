import type { Layer, RenderEnv } from '../Layer';

export class RibbonLayer implements Layer {
  update(_env: RenderEnv): void { /* stateless */ }

  render(env: RenderEnv): void {
    const { ctx, w, cy, features: f, palette: p, t, gates } = env;
    const a = gates.ribbons;
    if (a <= 0.01) return;
    const spd = f.motionSpeed;
    for (let b = 0; b < 3; b++) {
      const hue = p.baseHue + b * 70;
      // Peaks stay modest when quiet but grow much taller at high energy.
      const amp = (10 + f.energy * 115) + b * 6;
      ctx.beginPath();
      for (let px = 0; px <= w; px += 10) {
        const y = cy + Math.sin(px * 0.012 + t * spd * 0.8 + b) * amp * Math.sin(px * 0.006 + t * 0.4);
        px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
      }
      ctx.strokeStyle = p.hsl(hue, 80, 60, 0.16 * a);
      ctx.lineWidth = 2 + f.energy * 2.5;
      ctx.stroke();
    }
  }
}
