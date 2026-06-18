export interface Particle {
  x: number; y: number; vx: number; vy: number;
  hue: number; life: number; decay: number;
  gravity: number; drag: number;
}

export interface SpawnOpts {
  x: number; y: number; vx: number; vy: number; hue: number;
  decay?: number; gravity?: number; drag?: number;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  constructor(private cap: number) {}

  get count(): number { return this.particles.length; }

  spawn(o: SpawnOpts): void {
    if (this.particles.length >= this.cap) this.particles.shift();
    this.particles.push({
      x: o.x, y: o.y, vx: o.vx, vy: o.vy, hue: o.hue,
      life: 1, decay: o.decay ?? 0.011, gravity: o.gravity ?? 0, drag: o.drag ?? 0.985,
    });
  }

  update(dt: number, motionSpeed: number): void {
    const step = dt * 60; // normalize so decay/drag tuned for ~60fps frames
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * motionSpeed * dt;
      p.y += p.vy * motionSpeed * dt;
      p.vy += p.gravity * step;
      p.vx *= p.drag; p.vy *= p.drag;
      p.life -= p.decay * (0.6 + motionSpeed * 0.5) * step;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  forEach(fn: (p: Particle) => void): void { this.particles.forEach(fn); }
  clear(): void { this.particles.length = 0; }
}
