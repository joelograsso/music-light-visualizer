import { STARFIELD } from '../../config';
import type { Layer, RenderEnv } from '../Layer';

interface Star {
  x: number; // centered coords (-w..w, -h..h)
  y: number;
  z: number; // depth; small = near the viewer
  pz: number; // previous depth (for the streak)
}

/**
 * Warp-speed starfield behind everything. Stars fly toward the viewer (z shrinking),
 * projected so they streak outward from center. Warp speed scales with energy —
 * a gentle drift when quiet, hyperspace on the loud parts.
 */
export class StarfieldLayer implements Layer {
  private stars: Star[] = [];
  private ready = false;

  private spawn(w: number, h: number, near = false): Star {
    return {
      x: (Math.random() * 2 - 1) * w,
      y: (Math.random() * 2 - 1) * h,
      z: near ? Math.random() * w : w,
      pz: w,
    };
  }

  update(env: RenderEnv): void {
    if (!this.ready) {
      for (let i = 0; i < STARFIELD.count; i++) this.stars.push(this.spawn(env.w, env.h, true));
      this.ready = true;
    }
    const f = env.features;
    const speed = (STARFIELD.baseSpeed + f.energy * STARFIELD.energySpeed) * env.w * env.dt;
    for (const s of this.stars) {
      s.pz = s.z;
      s.z -= speed;
      if (s.z < 1) {
        const ns = this.spawn(env.w, env.h);
        s.x = ns.x; s.y = ns.y; s.z = env.w; s.pz = env.w;
      }
    }
  }

  render(env: RenderEnv): void {
    const { ctx, cx, cy, palette: p } = env;
    const focal = env.w;
    for (const s of this.stars) {
      const sx = cx + (s.x / s.z) * focal;
      const sy = cy + (s.y / s.z) * focal;
      const px = cx + (s.x / s.pz) * focal;
      const py = cy + (s.y / s.pz) * focal;
      const bright = Math.min(1, (env.w - s.z) / env.w);
      ctx.strokeStyle = p.hsl(p.baseHue + 180, 35, 62 + bright * 30, 0.25 + bright * 0.6);
      ctx.lineWidth = bright * 1.8 + 0.3;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(sx, sy);
      ctx.stroke();
    }
  }
}
