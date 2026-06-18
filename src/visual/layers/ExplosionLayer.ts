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

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

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

/** A jagged polyline from a to b (midpoint displacement), staying near the straight chord. */
function jaggedLine(a: Pt, b: Pt, displ: number): Pt[] {
  let pts: Pt[] = [a, b];
  let amp = displ;
  for (let lvl = 0; lvl < 3; lvl++) {
    const next: Pt[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const off = (Math.random() * 2 - 1) * amp;
      next.push(p, [(p[0] + q[0]) / 2 + nx * off, (p[1] + q[1]) / 2 + ny * off]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
    amp *= 0.5;
  }
  return pts;
}

function polyArea(p: Pt[]): number {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const q = p[(i + 1) % n];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return Math.abs(a) / 2;
}

/** Split a polygon in two along a jagged crack between points on two of its edges. */
function splitPolygon(poly: Pt[]): [Pt[], Pt[]] | null {
  const n = poly.length;
  let a = Math.floor(Math.random() * n);
  let b = Math.floor(Math.random() * n);
  let guard = 0;
  while (b === a && guard++ < 10) b = Math.floor(Math.random() * n);
  if (a === b) return null;
  if (a > b) { const t = a; a = b; b = t; }

  const A = lerp(poly[a], poly[(a + 1) % n], 0.25 + Math.random() * 0.5);
  const B = lerp(poly[b], poly[(b + 1) % n], 0.25 + Math.random() * 0.5);
  const chord = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const interior = jaggedLine(A, B, chord * 0.05).slice(1, -1);

  const poly1: Pt[] = [A];
  for (let i = a + 1; i <= b; i++) poly1.push(poly[i % n]);
  poly1.push(B);
  for (let i = interior.length - 1; i >= 0; i--) poly1.push(interior[i]);

  const poly2: Pt[] = [B];
  for (let i = b + 1; i <= a + n; i++) poly2.push(poly[i % n]);
  poly2.push(A);
  for (const p of interior) poly2.push(p);

  return [poly1, poly2];
}

/**
 * The "drop" payoff. When features.drop spikes, the screen SHATTERS into colored glass
 * shards — a different fracture pattern each time: radial from the core, jagged branching
 * cracks, a jittered triangular tessellation, or a regular equilateral-triangle tiling.
 * Some shards stay clear so the show shows through the broken glass. Plus a shockwave
 * ring and a particle burst. Hues come from the current scene's color family.
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
    const variant = Math.floor(Math.random() * 4);
    if (variant === 0) return this.radialShatter(w, h, w / 2, h / 2, 0, Math.PI * 2, baseHue);
    if (variant === 1) return this.crackShatter(w, h, baseHue);
    if (variant === 2) return this.gridShatter(w, h, baseHue);
    return this.equilateralShatter(w, h, baseHue);
  }

  /** Scene-family hue + a fill amount; `clearChance` of shards stay clear (show background). */
  private shardStyle(baseHue: number, clearChance: number): { hue: number; fill: number } {
    const hue = baseHue + Math.random() * 120;
    const fill = Math.random() < clearChance ? 0 : 0.4 + Math.random() * 0.6;
    return { hue, fill };
  }

  /** Wedges radiating from an impact point (two rings deep), over an angular sweep. */
  private radialShatter(w: number, h: number, ox: number, oy: number, start: number, sweep: number, baseHue: number): Shard[] {
    const shards: Shard[] = [];
    const N = 14 + Math.floor(Math.random() * 8);
    const exits: Pt[] = [];
    for (let i = 0; i <= N; i++) {
      const ang = start + sweep * (i / N) + (Math.random() - 0.5) * (sweep / N) * 0.6;
      exits.push(rayToRect(ox, oy, ang, w, h));
    }
    const o: Pt = [ox, oy];
    const midF = 0.34 + Math.random() * 0.16;
    for (let i = 0; i < N; i++) {
      const m0 = lerp(o, exits[i], midF);
      const m1 = lerp(o, exits[i + 1], midF);
      shards.push({ pts: [o, m0, m1], ...this.shardStyle(baseHue, 0.3) });
      shards.push({ pts: [m0, exits[i], exits[i + 1], m1], ...this.shardStyle(baseHue, 0.3) });
    }
    return shards;
  }

  /** Recursively split the screen with jagged cracks that branch off one another. */
  private crackShatter(w: number, h: number, baseHue: number): Shard[] {
    let polys: Pt[][] = [[[0, 0], [w, 0], [w, h], [0, h]]];
    const target = 24 + Math.floor(Math.random() * 10);
    let guard = 0;
    while (polys.length < target && guard++ < 200) {
      let bi = 0, ba = -1;
      for (let i = 0; i < polys.length; i++) {
        const ar = polyArea(polys[i]);
        if (ar > ba) { ba = ar; bi = i; }
      }
      const res = splitPolygon(polys[bi]);
      if (!res) continue;
      polys.splice(bi, 1, res[0], res[1]);
    }
    return polys.map((p) => ({ pts: p, ...this.shardStyle(baseHue, 0.3) }));
  }

  /** A jittered triangular grid covering the whole screen. */
  private gridShatter(w: number, h: number, baseHue: number): Shard[] {
    const cols = 5 + Math.floor(Math.random() * 3);
    const rows = 4 + Math.floor(Math.random() * 2);
    const grid: Pt[][] = [];
    for (let r = 0; r <= rows; r++) {
      const row: Pt[] = [];
      for (let c = 0; c <= cols; c++) {
        const jx = c === 0 || c === cols ? 0 : (Math.random() - 0.5) * (w / cols) * 0.7;
        const jy = r === 0 || r === rows ? 0 : (Math.random() - 0.5) * (h / rows) * 0.7;
        row.push([(c / cols) * w + jx, (r / rows) * h + jy]);
      }
      grid.push(row);
    }
    const shards: Shard[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = grid[r][c], b = grid[r][c + 1], cc = grid[r + 1][c + 1], d = grid[r + 1][c];
        shards.push({ pts: [a, b, d], ...this.shardStyle(baseHue, 0.3) });
        shards.push({ pts: [b, cc, d], ...this.shardStyle(baseHue, 0.3) });
      }
    }
    return shards;
  }

  /** A regular equilateral-triangle tiling of the screen, with more clear gaps. */
  private equilateralShatter(w: number, h: number, baseHue: number): Shard[] {
    const cols = 7 + Math.floor(Math.random() * 3);
    const s = w / cols;
    const rowH = (s * Math.sqrt(3)) / 2;
    const shards: Shard[] = [];
    for (let row = 0; row * rowH < h + rowH; row++) {
      const y0 = row * rowH;
      const y1 = y0 + rowH;
      const xOff = row % 2 === 0 ? 0 : -s / 2;
      for (let k = -1; k * s + xOff < w + s; k++) {
        const x = k * s + xOff;
        shards.push({ pts: [[x, y1], [x + s, y1], [x + s / 2, y0]], ...this.shardStyle(baseHue, 0.5) });
        shards.push({ pts: [[x + s / 2, y0], [x + s + s / 2, y0], [x + s, y1]], ...this.shardStyle(baseHue, 0.5) });
      }
    }
    return shards;
  }

  render(env: RenderEnv): void {
    const { ctx, cx, cy, features: f, palette: p } = env;

    if (f.drop > 0.01 && this.shards.length) {
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
        ctx.strokeStyle = `rgba(255,255,255,${a * 0.75})`;
        ctx.lineWidth = 2;
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
