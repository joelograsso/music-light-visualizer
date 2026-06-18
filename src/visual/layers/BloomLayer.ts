import { CAPS } from '../../config';
import { ParticleSystem } from '../ParticleSystem';
import type { Layer, RenderEnv } from '../Layer';
import { coreRadius } from '../coreRadius';

export interface ShardRequest { x: number; y: number; vx: number; vy: number; hue: number; size: number; }

export class BloomLayer implements Layer {
  private ps = new ParticleSystem(CAPS.blooms);
  private lastBeat = -1;
  /** Filled with crystallization requests for the KaleidoscopeLayer to consume. */
  readonly shardQueue: ShardRequest[] = [];

  update(env: RenderEnv): void {
    const { features: f, t, gates, cx, cy } = env;
    const minDim = Math.min(env.w, env.h);
    const coreR = coreRadius(f.energy, f.bands, f.beat, minDim);

    if (gates.blooms > 0.01 && f.beat > 0.4 && t - this.lastBeat > 0.18) {
      this.lastBeat = t;
      const n = Math.round((4 + f.energy * 30) * gates.blooms);
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = (0.5 + Math.random() * 2.8) * (0.4 + f.energy);
        this.ps.spawn({
          x: cx + Math.cos(ang) * coreR, y: cy + Math.sin(ang) * coreR,
          vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
          hue: env.palette.baseHue + Math.random() * 70, decay: 0.011,
        });
      }
    }
    this.ps.update(env.dt, f.motionSpeed);

    // crystallization: a fraction of mid-life particles become shards at peak energy
    if (gates.kaleidoscope > 0.3) {
      this.ps.forEach((part) => {
        if (part.life < 0.7 && part.life > 0.66 && Math.random() < 0.05) {
          this.shardQueue.push({
            x: part.x, y: part.y, vx: part.vx * 0.4, vy: part.vy * 0.4,
            hue: part.hue, size: 6 + f.energy * 14,
          });
        }
      });
    }
  }

  render(env: RenderEnv): void {
    const { ctx, palette: p } = env;
    this.ps.forEach((part) => {
      ctx.fillStyle = p.hsl(part.hue, 90, 62, part.life * 0.9);
      ctx.beginPath();
      ctx.arc(part.x, part.y, 2.4 * part.life + 0.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}
