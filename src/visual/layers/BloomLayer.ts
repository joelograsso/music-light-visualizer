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
    const coreR = coreRadius(f.energy, f.presence, f.bands, minDim);

    // Bursts emit from the ring. Aggressiveness scales with energy: at low energy
    // they're rare and small; at high energy they fire on weaker onsets, far more
    // often, with many more particles thrown outward fast enough to reach the edges.
    const beatThresh = 0.45 - 0.3 * f.energy; // easier to trigger when energetic
    const minGap = 0.24 - 0.16 * f.energy;    // bursts fire up to ~3x more often
    if (gates.blooms > 0.01 && f.beat > beatThresh && t - this.lastBeat > minGap) {
      this.lastBeat = t;
      const n = Math.round((3 + f.energy * f.energy * 70) * gates.blooms);
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        // velocity scales with energy so particles fly from the ring across the screen
        const sp = (2 + Math.random() * 6) * (0.5 + f.energy * 1.3);
        this.ps.spawn({
          x: cx + Math.cos(ang) * coreR, y: cy + Math.sin(ang) * coreR,
          vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
          hue: env.palette.baseHue + Math.random() * 70,
          decay: 0.006 + Math.random() * 0.004, // longer-lived -> travel farther
          drag: 0.992,                           // less drag -> keep going to the edges
        });
      }
    }
    this.ps.update(env.dt, f.motionSpeed);

    // Crystallization into kaleidoscope shards — frequency scales with energy, so
    // shards pop sparsely at low energy and abundantly at high energy.
    if (gates.kaleidoscope > 0.01) {
      const prob = (0.01 + 0.045 * f.energy) * gates.kaleidoscope;
      this.ps.forEach((part) => {
        if (part.life > 0.5 && part.life < 0.82 && Math.random() < prob) {
          this.shardQueue.push({
            x: part.x, y: part.y, vx: part.vx * 0.6, vy: part.vy * 0.6,
            hue: part.hue, size: 6 + f.energy * 16,
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
