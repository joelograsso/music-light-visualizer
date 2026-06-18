import { ParticleSystem } from '../ParticleSystem';
import { coreRadius } from '../coreRadius';
import type { Layer, RenderEnv } from '../Layer';

interface Shockwave {
  r: number;
  life: number;
  hue: number;
}

/**
 * The "drop" payoff. When features.drop spikes, erupt a full-screen flash, an
 * expanding shockwave ring, and a fast radial burst of particles from the core.
 * Driven entirely by features.drop (0..1), produced by the DropDetector.
 */
export class ExplosionLayer implements Layer {
  private ps = new ParticleSystem(700);
  private rings: Shockwave[] = [];
  private prevDrop = 0;

  update(env: RenderEnv): void {
    const { features: f, cx, cy, dt } = env;
    const minDim = Math.min(env.w, env.h);
    const d = f.drop;

    // Fresh trigger: the drop envelope just jumped up.
    if (this.prevDrop < 0.5 && d > 0.9) {
      const coreR = coreRadius(f.energy, f.presence, f.bands, minDim);
      this.rings.push({ r: coreR, life: 1, hue: env.palette.baseHue });
      for (let i = 0; i < 220; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 6 + Math.random() * 16;
        this.ps.spawn({
          x: cx + Math.cos(ang) * coreR,
          y: cy + Math.sin(ang) * coreR,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          hue: env.palette.baseHue + Math.random() * 120,
          decay: 0.012,
          drag: 0.99,
        });
      }
    }
    this.prevDrop = d;

    const step = dt * 60;
    const maxR = Math.hypot(env.w, env.h);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.r += (14 + r.r * 0.07) * step; // expand, accelerating outward
      r.life -= 0.02 * step;
      if (r.life <= 0 || r.r > maxR) this.rings.splice(i, 1);
    }
    // Explosion particles fly at full speed regardless of the song's motionSpeed.
    this.ps.update(dt, 1);
  }

  render(env: RenderEnv): void {
    const { ctx, w, h, cx, cy, features: f, palette: p } = env;

    if (f.drop > 0.01) {
      // Draw as a source-over veil (not additive) so it tracks the envelope and fades
      // out cleanly instead of accumulating to a white-out over successive frames.
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.7, f.drop * 0.6)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
    }

    for (const r of this.rings) {
      ctx.strokeStyle = p.hsl(r.hue, 90, 66, r.life * 0.6);
      ctx.lineWidth = 2 + r.life * 7;
      ctx.beginPath();
      ctx.arc(cx, cy, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    this.ps.forEach((part) => {
      ctx.fillStyle = p.hsl(part.hue, 95, 66, part.life);
      ctx.beginPath();
      ctx.arc(part.x, part.y, 2.6 * part.life + 0.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}
