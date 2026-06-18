import type { Layer, RenderEnv } from '../Layer';
import { CAPS } from '../../config';
import type { BloomLayer } from './BloomLayer';

interface Shard { x: number; y: number; vx: number; vy: number; rot: number; life: number; hue: number; size: number; }

export class KaleidoscopeLayer implements Layer {
  private shards: Shard[] = [];
  constructor(private blooms: BloomLayer) {}

  update(env: RenderEnv): void {
    const q = this.blooms.shardQueue;
    while (q.length) {
      const r = q.shift()!;
      if (this.shards.length >= CAPS.shards) this.shards.shift();
      this.shards.push({ ...r, rot: 0, life: 1 });
    }
    const spd = env.features.motionSpeed;
    const step = env.dt * 60;
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.x += s.vx * spd * step; s.y += s.vy * spd * step;
      s.rot += 0.04 * spd * step;
      s.life -= 0.006 * (0.6 + spd * 0.5) * step;
      if (s.life <= 0) this.shards.splice(i, 1);
    }
  }

  render(env: RenderEnv): void {
    const { ctx, palette: p, gates } = env;
    const a = gates.kaleidoscope;
    for (const s of this.shards) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      for (let k = 0; k < 6; k++) {
        ctx.rotate((Math.PI * 2) / 6);
        ctx.strokeStyle = p.hsl(s.hue, 90, 64, s.life * 0.8 * a);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(s.size * s.life, 0);
        ctx.lineTo(s.size * 0.5 * s.life, s.size * 0.5 * s.life);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
