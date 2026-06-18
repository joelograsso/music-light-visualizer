import { ParticleSystem } from '../ParticleSystem';
import { coreRadius } from '../coreRadius';
import type { Layer, RenderEnv } from '../Layer';

type Pt = [number, number];

interface Shockwave {
  r: number;
  life: number;
  hue: number;
}

/** A glass shard: absolute screen-space polygon, a scene-family hue, and a fill amount
 *  (0 = stays clear so the show behind shows through; >0 = tinted that strongly). */
interface Shard {
  pts: Pt[];
  hue: number;
  fill: number;
}

/** Where the ray from (ox,oy) at angle `ang` exits the [0,w]x[0,h] rectangle. */
function rayToRect(ox: number, oy: number, ang: number, w: number, h: number): Pt {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  let t = Infinity;
  if (dx > 1e-6) t = Math.min(t, (w - ox) / dx);
  else if (dx < -1e-6) t = Math.min(t, -ox / dx);
  if (dy > 1e-6) t = Math.min(t, (h - oy) / dy);
  else if (dy < -1e-6) t = Math.min(t, -oy / dy);
  return [ox + dx * t, oy + dy * t];
}

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/**
 * The "drop" payoff. When features.drop spikes, the screen SHATTERS into colored glass
 * shards — a different fracture pattern each time (radial from the core, cracking in
 * from a side, or a triangular tessellation). Some shards stay clear so the show shows
 * through the broken glass. Plus a shockwave ring and a radial particle burst. Shard
 * hues come from the current scene's color family so the flash matches what's on screen.
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

    if (this.prevDrop < 0.5 && d > 0.9) {
      const coreR = coreRadius(f.energy, f.presence, f.bands, minDim);
      this.shards = this.buildShatter(env.w, env.h, env.palette.baseHue);
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
      r.r += (14 + r.r * 0.07) * step;
      r.life -= 0.02 * step;
      if (r.life <= 0 || r.r > maxR) this.rings.splice(i, 1);
    }
    this.ps.update(dt, 1);
  }

  /** Pick one of the fracture patterns at random so each drop shatters differently. */
  private buildShatter(w: number, h: number, baseHue: number): Shard[] {
    const variant = Math.floor(Math.random() * 3);
    if (variant === 0) return this.radialShatter(w, h, w / 2, h / 2, 0, Math.PI * 2, baseHue);
    if (variant === 1) return this.edgeShatter(w, h, baseHue);
    return this.gridShatter(w, h, baseHue);
  }

  /** Scene-family hue + a fill amount; ~30% of shards stay clear (show the background). */
  private shardStyle(baseHue: number): { hue: number; fill: number } {
    const hue = baseHue + Math.random() * 120;
    const fill = Math.random() < 0.32 ? 0 : 0.4 + Math.random() * 0.6;
    return { hue, fill };
  }

  /** Wedges radiating from an impact point (two rings deep), over an angular sweep. */
  private radialShatter(w: number, h: number, ox: number, oy: number, start: number, sweep: number, baseHue: number): Shard[] {
    const shards: Shard[] = [];
    const N = 14 + Math.floor(Math.random() * 8);
    const exits: Pt[] = [];
    for (let i = 0; i <= N; i++) {
      const a = start + sweep * (i / N) + (Math.random() - 0.5) * (sweep / N) * 0.6;
      exits.push(rayToRect(ox, oy, a, w, h));
    }
    const o: Pt = [ox, oy];
    const midF = 0.34 + Math.random() * 0.16;
    for (let i = 0; i < N; i++) {
      const p0 = exits[i];
      const p1 = exits[i + 1];
      const m0 = lerp(o, p0, midF);
      const m1 = lerp(o, p1, midF);
      shards.push({ pts: [o, m0, m1], ...this.shardStyle(baseHue) });
      shards.push({ pts: [m0, p0, p1, m1], ...this.shardStyle(baseHue) });
    }
    return shards;
  }

  /** Cracks fanning IN from a random side of the screen (the screen cracked on that edge). */
  private edgeShatter(w: number, h: number, baseHue: number): Shard[] {
    const side = Math.floor(Math.random() * 4);
    let ox: number, oy: number, normal: number;
    if (side === 0) { ox = 0; oy = Math.random() * h; normal = 0; }            // left -> point right
    else if (side === 1) { ox = w; oy = Math.random() * h; normal = Math.PI; } // right -> point left
    else if (side === 2) { ox = Math.random() * w; oy = 0; normal = Math.PI / 2; } // top -> point down
    else { ox = Math.random() * w; oy = h; normal = -Math.PI / 2; }            // bottom -> point up
    const sweep = Math.PI * (0.78 + Math.random() * 0.18);
    return this.radialShatter(w, h, ox, oy, normal - sweep / 2, sweep, baseHue);
  }

  /** A jittered triangular grid covering the whole screen — geometric shattered glass. */
  private gridShatter(w: number, h: number, baseHue: number): Shard[] {
    const cols = 5 + Math.floor(Math.random() * 3);
    const rows = 4 + Math.floor(Math.random() * 2);
    const grid: Pt[][] = [];
    for (let r = 0; r <= rows; r++) {
      const row: Pt[] = [];
      for (let c = 0; c <= cols; c++) {
        const edgeC = c === 0 || c === cols;
        const edgeR = r === 0 || r === rows;
        const jx = edgeC ? 0 : (Math.random() - 0.5) * (w / cols) * 0.7;
        const jy = edgeR ? 0 : (Math.random() - 0.5) * (h / rows) * 0.7;
        row.push([(c / cols) * w + jx, (r / rows) * h + jy]);
      }
      grid.push(row);
    }
    const shards: Shard[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = grid[r][c], b = grid[r][c + 1], cc = grid[r + 1][c + 1], d = grid[r + 1][c];
        shards.push({ pts: [a, b, d], ...this.shardStyle(baseHue) });
        shards.push({ pts: [b, cc, d], ...this.shardStyle(baseHue) });
      }
    }
    return shards;
  }

  render(env: RenderEnv): void {
    const { ctx, cx, cy, features: f, palette: p } = env;

    if (f.drop > 0.01 && this.shards.length) {
      // Fill tinted shards (clear ones show the background); draw the crack seams on ALL
      // shards so the fracture pattern reads even where the glass is transparent.
      ctx.globalCompositeOperation = 'source-over';
      const a = Math.min(0.85, f.drop * 0.95);
      for (const s of this.shards) {
        ctx.beginPath();
        ctx.moveTo(s.pts[0][0], s.pts[0][1]);
        for (let j = 1; j < s.pts.length; j++) ctx.lineTo(s.pts[j][0], s.pts[j][1]);
        ctx.closePath();
        if (s.fill > 0.02) {
          ctx.fillStyle = p.hsl(s.hue, 92, 58, a * s.fill);
          ctx.fill();
        }
        ctx.strokeStyle = `rgba(255,255,255,${a * 0.5})`;
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
