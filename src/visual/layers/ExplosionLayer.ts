import { ParticleSystem } from '../ParticleSystem';
import { coreRadius } from '../coreRadius';
import type { Layer, RenderEnv } from '../Layer';

interface Shockwave {
  r: number;
  life: number;
  hue: number;
}

/** A glass shard: polygon points relative to center, with its own vivid color. */
interface Shard {
  pts: Array<[number, number]>;
  hue: number;
}

/**
 * The "drop" payoff. When features.drop spikes, the screen SHATTERS: it fractures
 * into colored glass shards radiating from the core (each a different vivid hue),
 * plus an expanding shockwave ring and a fast radial burst of particles. The shatter
 * tracks the drop envelope and fades out. Driven entirely by features.drop.
 */
export class ExplosionLayer implements Layer {
  private ps = new ParticleSystem(700);
  private rings: Shockwave[] = [];
  private shards: Shard[] = [];
  private prevDrop = 0;

  update(env: RenderEnv): void {
    const { features: f, cx, cy, dt } = env;
    const minDim = Math.min(env.w, env.h);
    const d = f.drop;

    // Fresh trigger: the drop envelope just jumped up.
    if (this.prevDrop < 0.5 && d > 0.9) {
      const coreR = coreRadius(f.energy, f.presence, f.bands, minDim);
      this.shards = this.buildShatter(Math.hypot(env.w, env.h), env.palette.baseHue);
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

  /**
   * Fracture the screen into colored shards radiating from the center (two rings deep).
   * Shard hues are drawn from the current scene's color family (baseHue + a spread) so
   * the flash matches the colors on screen instead of clashing pastel rainbow.
   */
  private buildShatter(maxR: number, baseHue: number): Shard[] {
    const shards: Shard[] = [];
    const N = 16 + Math.floor(Math.random() * 8);
    const angs: number[] = [];
    for (let i = 0; i < N; i++) angs.push((i / N) * Math.PI * 2 + (Math.random() - 0.5) * 0.3);
    const midR = (0.32 + Math.random() * 0.16) * maxR;
    const hue = () => baseHue + Math.random() * 120; // within the scene's family (hsl wraps)
    for (let i = 0; i < N; i++) {
      const a0 = angs[i];
      const a1 = (i + 1 === N ? angs[0] + Math.PI * 2 : angs[i + 1]);
      const m0: [number, number] = [Math.cos(a0) * midR, Math.sin(a0) * midR];
      const m1: [number, number] = [Math.cos(a1) * midR, Math.sin(a1) * midR];
      const e0: [number, number] = [Math.cos(a0) * maxR, Math.sin(a0) * maxR];
      const e1: [number, number] = [Math.cos(a1) * maxR, Math.sin(a1) * maxR];
      shards.push({ pts: [[0, 0], m0, m1], hue: hue() });
      shards.push({ pts: [m0, e0, e1, m1], hue: hue() });
    }
    return shards;
  }

  render(env: RenderEnv): void {
    const { ctx, cx, cy, features: f, palette: p } = env;

    if (f.drop > 0.01 && this.shards.length) {
      // Shattered-glass color flash: source-over so it tracks the envelope and fades
      // cleanly. Each shard a different vivid color, with bright "crack" seams.
      ctx.globalCompositeOperation = 'source-over';
      const a = Math.min(0.85, f.drop * 0.95);
      for (const s of this.shards) {
        ctx.beginPath();
        ctx.moveTo(cx + s.pts[0][0], cy + s.pts[0][1]);
        for (let j = 1; j < s.pts.length; j++) ctx.lineTo(cx + s.pts[j][0], cy + s.pts[j][1]);
        ctx.closePath();
        ctx.fillStyle = p.hsl(s.hue, 92, 58, a);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${a * 0.6})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
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
