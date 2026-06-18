import type { AudioFeatures } from '../types';
import { StageController } from './StageController';
import { Palette } from './Palette';
import type { Layer, RenderEnv } from './Layer';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private stage = new StageController();
  private palette = new Palette();
  private t = 0;
  private last = 0;
  private raf = 0;
  private w = 0; private h = 0;

  constructor(private canvas: HTMLCanvasElement, private layers: Layer[],
              private getFeatures: () => AudioFeatures) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.canvas.width = this.w * dpr; this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    const ctx = this.ctx;

    // trail fade — lighter fade when energetic so glow builds up
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(3,4,10,${0.30 - features.energy * 0.12})`;
    ctx.fillRect(0, 0, this.w, this.h);

    const env: RenderEnv = {
      ctx, w: this.w, h: this.h, cx: this.w / 2, cy: this.h / 2,
      dt, features, gates: this.stage.gates(features.energy), palette: this.palette, t: this.t,
    };

    ctx.globalCompositeOperation = 'lighter'; // additive glow
    for (const layer of this.layers) { layer.update(env); layer.render(env); }
  }
}
