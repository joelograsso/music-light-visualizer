import { LIGHTNING } from '../../config';
import { coreRadius } from '../coreRadius';
import type { Layer, RenderEnv } from '../Layer';

type Pt = [number, number];

interface Bolt {
  pts: Pt[];
  life: number;
  hue: number;
}

/**
 * Electric arcs that snap outward from the core on strong beats. Each bolt is a
 * jagged path (recursive midpoint displacement) that flashes bright and fades fast.
 */
export class LightningLayer implements Layer {
  private bolts: Bolt[] = [];
  private lastVolley = -1;

  private makeBolt(a: Pt, b: Pt): Pt[] {
    let pts: Pt[] = [a, b];
    let disp = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.18;
    for (let lvl = 0; lvl < 4; lvl++) {
      const next: Pt[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1];
        const dx = q[0] - p[0], dy = q[1] - p[1];
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len; // perpendicular
        const off = (Math.random() * 2 - 1) * disp;
        next.push(p, [(p[0] + q[0]) / 2 + nx * off, (p[1] + q[1]) / 2 + ny * off]);
      }
      next.push(pts[pts.length - 1]);
      pts = next;
      disp *= 0.5;
    }
    return pts;
  }

  update(env: RenderEnv): void {
    const { features: f, t, cx, cy } = env;
    const minDim = Math.min(env.w, env.h);
    const coreR = coreRadius(f.energy, f.presence, f.bands, minDim);

    if (f.energy > 0.25 && f.beat > LIGHTNING.beatThreshold && t - this.lastVolley > LIGHTNING.minGap) {
      this.lastVolley = t;
      const n = 1 + Math.floor(f.energy * (LIGHTNING.maxBolts - 1));
      for (let b = 0; b < n; b++) {
        const ang = Math.random() * Math.PI * 2;
        const start: Pt = [cx + Math.cos(ang) * coreR, cy + Math.sin(ang) * coreR];
        const len = coreR * (1.2 + Math.random() * 1.8) * (0.5 + f.energy);
        const end: Pt = [cx + Math.cos(ang) * (coreR + len), cy + Math.sin(ang) * (coreR + len)];
        this.bolts.push({ pts: this.makeBolt(start, end), life: 1, hue: env.palette.baseHue + 180 + Math.random() * 40 });
      }
    }

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      this.bolts[i].life -= LIGHTNING.decayPerSec * env.dt;
      if (this.bolts[i].life <= 0) this.bolts.splice(i, 1);
    }
  }

  render(env: RenderEnv): void {
    const { ctx, palette: p } = env;
    for (const bolt of this.bolts) {
      ctx.beginPath();
      ctx.moveTo(bolt.pts[0][0], bolt.pts[0][1]);
      for (let i = 1; i < bolt.pts.length; i++) ctx.lineTo(bolt.pts[i][0], bolt.pts[i][1]);
      ctx.strokeStyle = p.hsl(bolt.hue, 85, 72, bolt.life);
      ctx.lineWidth = 1 + bolt.life * 2.5;
      ctx.stroke();
      // hot white core
      ctx.strokeStyle = `rgba(255,255,255,${bolt.life * 0.8})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}
