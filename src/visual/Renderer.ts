import type { AudioFeatures } from '../types';
import { KALEIDO } from '../config';
import { StageController } from './StageController';
import { Palette } from './Palette';
import type { Layer, RenderEnv } from './Layer';

function gate(v: number, [lo, hi]: [number, number]): number {
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private scene: HTMLCanvasElement;       // offscreen buffer the layers draw into
  private sctx: CanvasRenderingContext2D;
  private stage = new StageController();
  private palette = new Palette();
  private t = 0;
  private last = 0;
  private raf = 0;
  private w = 0; private h = 0;

  constructor(private canvas: HTMLCanvasElement, private layers: Layer[],
              private getFeatures: () => AudioFeatures) {
    this.ctx = canvas.getContext('2d')!;
    this.scene = document.createElement('canvas');
    this.sctx = this.scene.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth; this.h = window.innerHeight;
    for (const c of [this.canvas, this.scene]) {
      c.width = this.w * dpr; c.height = this.h * dpr;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  start(): void {
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now; this.t += dt;
      this.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void { cancelAnimationFrame(this.raf); }

  private frame(dt: number): void {
    const features = this.getFeatures();
    this.palette.update(dt, features.motionSpeed);

    // --- render the scene into the offscreen buffer ---
    const sc = this.sctx;
    sc.globalCompositeOperation = 'source-over';
    sc.fillStyle = `rgba(3,4,10,${0.30 - features.energy * 0.12})`; // trail fade
    sc.fillRect(0, 0, this.w, this.h);

    const env: RenderEnv = {
      ctx: sc, w: this.w, h: this.h, cx: this.w / 2, cy: this.h / 2,
      dt, features, gates: this.stage.gates(features.energy), palette: this.palette, t: this.t,
    };
    sc.globalCompositeOperation = 'lighter'; // additive glow
    for (const layer of this.layers) { layer.update(env); layer.render(env); }

    // --- composite to the visible canvas, mirroring into a kaleidoscope at high energy ---
    const k = gate(features.energy, KALEIDO.gate);
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.drawImage(this.scene, 0, 0, this.w, this.h); // straight scene underneath
    if (k > 0.01) {
      ctx.globalAlpha = k;                            // crossfade the mirror in
      this.kaleidoscope(ctx);
      ctx.globalAlpha = 1;
    }
  }

  /** Mirror the offscreen scene into N-fold radial symmetry around the center. */
  private kaleidoscope(ctx: CanvasRenderingContext2D): void {
    const N = KALEIDO.segments;
    const seg = (Math.PI * 2) / N;
    const cx = this.w / 2, cy = this.h / 2;
    const R = Math.hypot(this.w, this.h);
    for (let i = 0; i < N; i++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(i * seg);
      if (i % 2 === 1) ctx.scale(1, -1); // reflect alternate wedges so they tile seamlessly
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, -seg / 2, seg / 2);
      ctx.closePath();
      ctx.clip();
      ctx.translate(-cx, -cy);
      ctx.drawImage(this.scene, 0, 0, this.w, this.h);
      ctx.restore();
    }
  }
}
