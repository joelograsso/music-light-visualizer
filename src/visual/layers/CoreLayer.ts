import type { Layer, RenderEnv } from '../Layer';
import { coreRadius } from '../coreRadius';

export class CoreLayer implements Layer {
  update(_env: RenderEnv): void { /* stateless; driven by features each frame */ }

  render(env: RenderEnv): void {
    const { ctx, cx, cy, features: f, palette: p, t } = env;
    const minDim = Math.min(env.w, env.h);
    const bass = f.bands.bass; // smoothed band drives the spikes — no spiky onset term
    const coreR = coreRadius(f.energy, f.bands, minDim);
    const spd = f.motionSpeed;
    const hueBase = p.baseHue;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * spd * 0.12);

    // solid ring so it always reads as one uniform circle
    ctx.beginPath();
    ctx.arc(0, 0, coreR, 0, Math.PI * 2);
    ctx.strokeStyle = p.hsl(hueBase + 20, 85, 60, 0.45 + f.energy * 0.3);
    ctx.lineWidth = 3 + f.energy * 3;
    ctx.stroke();

    // spike count scales with circumference -> constant tight spacing
    const N = Math.max(64, Math.round(coreR * 1.4));
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2;
      // slow undulation sweeping around the ring. The `-t` term makes the wave
      // travel clockwise, matching the body rotation above, so the whole ring reads
      // as moving in one consistent direction rather than two opposing ones.
      const band = Math.abs(Math.sin(i * 0.6 - t * spd * 0.4)) * (0.25 + bass);
      // gentle high-energy liveliness, also traveling clockwise (matching sign)
      const jitter = f.energy * f.energy * Math.sin(i * 7.0 - t * spd * 1.1) * 0.25;
      const len = Math.max(0, (5 + band * 46 + jitter * 40) * (0.3 + f.energy));
      const hue = hueBase + (i / N) * 200;
      const x1 = Math.cos(ang) * coreR, y1 = Math.sin(ang) * coreR;
      const x2 = Math.cos(ang) * (coreR + len), y2 = Math.sin(ang) * (coreR + len);
      ctx.strokeStyle = p.hsl(hue, 90, 62, 0.55 + f.energy * 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }

    // inner glow disk
    const r = Math.max(coreR, 6);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, p.hsl(hueBase + 40, 90, 66, 0.28 + f.beat * 0.45));
    g.addColorStop(0.7, p.hsl(hueBase, 80, 55, 0.12));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
