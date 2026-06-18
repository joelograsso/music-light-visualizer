import type { Layer, RenderEnv } from '../Layer';

export class RibbonLayer implements Layer {
  update(_env: RenderEnv): void { /* stateless */ }

  render(env: RenderEnv): void {
    const { ctx, w, cy, features: f, palette: p, t, gates } = env;
    const a = gates.ribbons;
    if (a <= 0.01) return;
    // Steady drift: the whole waveform rides a single moving coordinate `u`, so the
    // carrier and its envelope translate together at the SAME constant speed —
    // independent of energy. This keeps the original wave shape but makes it glide
    // across the screen smoothly at all times, instead of the carrier sliding through
    // a near-stationary envelope (which looked like it stopped at random spots and
    // only moved at high energy).
    const DRIFT = 95; // px/sec, constant, rightward
    for (let b = 0; b < 3; b++) {
      const hue = p.baseHue + b * 70;
      // Peaks stay modest when quiet but grow much taller at high energy.
      const amp = (10 + f.energy * 115) + b * 6;
      ctx.beginPath();
      for (let px = 0; px <= w; px += 10) {
        const u = px - DRIFT * t; // shared moving coordinate -> rigid, steady translation
        const y = cy + Math.sin(u * 0.012 + b) * amp * Math.sin(u * 0.006);
        px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
      }
      ctx.strokeStyle = p.hsl(hue, 80, 60, 0.16 * a);
      ctx.lineWidth = 2 + f.energy * 2.5;
      ctx.stroke();
    }
  }
}
