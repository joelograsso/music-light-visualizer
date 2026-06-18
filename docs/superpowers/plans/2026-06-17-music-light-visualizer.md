# Music Light Visualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based, audio-reactive "mini light show" that grows a layered canvas visualization out of a central pulsing core, reacting in real time to live audio (mic / tab-or-system capture / file), with a Spotify now-playing metadata overlay.

**Architecture:** One-way data flow — audio input → `AudioEngine` (FFT) → `FeatureExtractor` → an `AudioFeatures` object → `VisualEngine` (Renderer + StageController + four canvas layers). The visual engine depends only on `AudioFeatures`, so it can be driven by synthetic features in tests. Spotify metadata flows on a separate path into a UI overlay.

**Tech Stack:** Vite + TypeScript, Canvas 2D, Vitest (jsdom) for unit tests, Web Audio API, Spotify Web API (PKCE OAuth).

See the design spec: `docs/superpowers/specs/2026-06-17-music-light-visualizer-design.md`.

---

## File Structure

```
index.html
package.json
tsconfig.json
vite.config.ts
vitest.config.ts
src/
  main.ts                      # wires everything together
  config.ts                    # tuning constants + Spotify config
  types.ts                     # AudioFeatures + shared interfaces
  audio/
    AudioEngine.ts             # AudioContext + AnalyserNode wrapper
    FeatureExtractor.ts        # pure-ish: FFT bins -> AudioFeatures
    InputManager.ts            # selects/swaps the active source
    sources/
      AudioSource.ts           # interface
      MicSource.ts
      DisplaySource.ts
      FileSource.ts
  visual/
    Renderer.ts                # rAF loop, canvas, compositing
    StageController.ts         # energy -> layer gate opacities
    Palette.ts                 # hue/color drift
    ParticleSystem.ts          # reusable particle pool
    Layer.ts                   # Layer interface + RenderEnv type
    layers/
      CoreLayer.ts
      RibbonLayer.ts
      BloomLayer.ts
      KaleidoscopeLayer.ts
  spotify/
    SpotifyClient.ts           # PKCE auth + currently-playing
  ui/
    Controls.ts                # source selector, start/stop, fullscreen
    NowPlaying.ts              # Spotify login + overlay
tests/
  audio/FeatureExtractor.test.ts
  visual/StageController.test.ts
  visual/ParticleSystem.test.ts
  visual/Palette.test.ts
  spotify/SpotifyClient.test.ts
```

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `src/main.ts`, `src/style.css`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "music-light-visualizer",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.6.0",
    "jsdom": "^24.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create `vite.config.ts` and `vitest.config.ts`**

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
export default defineConfig({ server: { port: 5173 } });
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { globals: true, environment: 'jsdom' },
});
```

- [ ] **Step 4: Create `index.html`, `src/style.css`, `src/main.ts`**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Music Light Visualizer</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <canvas id="stage"></canvas>
    <div id="ui"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/style.css`:
```css
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; background: #03040a; overflow: hidden; font-family: ui-monospace, monospace; color: #fff; }
#stage { display: block; width: 100vw; height: 100vh; }
#ui { position: fixed; inset: 0; pointer-events: none; }
#ui > * { pointer-events: auto; }
```

`src/main.ts`:
```ts
console.log('Music Light Visualizer booting…');
```

- [ ] **Step 5: Install and verify dev server boots**

Run: `npm install && npm run dev`
Expected: Vite serves at `http://localhost:5173`, console logs the boot message, blank dark canvas. Stop with Ctrl-C.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json vite.config.ts vitest.config.ts index.html src/
git commit -m "chore: scaffold Vite + TS + Vitest project"
```

---

## Task 2: Shared types and config

**Files:**
- Create: `src/types.ts`, `src/config.ts`

- [ ] **Step 1: Create `src/types.ts`**

```ts
export interface FrequencyBands {
  bass: number;    // 0..1
  lowMid: number;  // 0..1
  mid: number;     // 0..1
  high: number;    // 0..1
}

export interface AudioFeatures {
  loudness: number;        // 0..1 instantaneous (lightly smoothed)
  energy: number;          // 0..1 slow-smoothed envelope; drives staged layering
  bands: FrequencyBands;
  beat: number;            // 0..1 onset intensity this frame (fast decay)
  motionSpeed: number;     // global motion multiplier (~0.35..1.6)
  tempoBpm: number | null; // running tempo estimate; null until confident
}

/** Per-layer gate opacities produced by StageController. */
export interface LayerGates {
  ribbons: number;       // 0..1
  blooms: number;        // 0..1
  kaleidoscope: number;  // 0..1
}
```

- [ ] **Step 2: Create `src/config.ts`**

```ts
export const FFT_SIZE = 2048;

/** Frequency band edges in Hz: [bass, lowMid, mid, high] upper bounds. */
export const BAND_EDGES = { bassMax: 150, lowMidMax: 500, midMax: 2000, highMax: 8000 };

/** Smoothing factors per frame (0..1, higher = snappier). */
export const SMOOTHING = { loudness: 0.4, energy: 0.04 };

/** Energy gate ranges for progressive layering (smoothed energy 0..1). */
export const GATES = {
  ribbons: [0.30, 0.45] as [number, number],
  blooms: [0.50, 0.62] as [number, number],
  kaleidoscope: [0.74, 0.86] as [number, number],
};

/** Core ring sizing, expressed as a fraction of min(canvasW, canvasH). */
export const CORE = { maxRadiusFrac: 0.28, growthFrac: 0.34 };

/** Particle caps for performance. */
export const CAPS = { blooms: 900, shards: 220 };

/** Spotify — fill in your registered app's values. */
export const SPOTIFY = {
  clientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '',
  redirectUri: import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? 'http://localhost:5173',
  scopes: 'user-read-currently-playing user-read-playback-state',
};
```

- [ ] **Step 3: Commit**

```bash
git add src/types.ts src/config.ts
git commit -m "feat: add AudioFeatures types and tuning config"
```

---

## Task 3: FeatureExtractor — frequency bands

**Files:**
- Create: `src/audio/FeatureExtractor.ts`, `tests/audio/FeatureExtractor.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/audio/FeatureExtractor.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { binForFreq, computeBands } from '../../src/audio/FeatureExtractor';

const SAMPLE_RATE = 44100;
const FFT_SIZE = 2048;

describe('binForFreq', () => {
  it('maps a frequency to its FFT bin index', () => {
    // bin width = 44100 / 2048 ≈ 21.53 Hz
    expect(binForFreq(0, SAMPLE_RATE, FFT_SIZE)).toBe(0);
    expect(binForFreq(100, SAMPLE_RATE, FFT_SIZE)).toBe(5); // round(100/21.53)
  });
});

describe('computeBands', () => {
  it('averages normalized magnitudes within each band', () => {
    const bins = FFT_SIZE / 2; // 1024
    const data = new Uint8Array(bins).fill(0);
    // Put full energy (255) in the bass region only (~50 Hz -> bin 2)
    data[2] = 255;
    const bands = computeBands(data, SAMPLE_RATE, FFT_SIZE);
    expect(bands.bass).toBeGreaterThan(0);
    expect(bands.high).toBe(0);
    expect(bands.bass).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/audio/FeatureExtractor.test.ts`
Expected: FAIL — `binForFreq`/`computeBands` not exported.

- [ ] **Step 3: Write minimal implementation**

`src/audio/FeatureExtractor.ts`:
```ts
import { BAND_EDGES } from '../config';
import type { FrequencyBands } from '../types';

export function binForFreq(freq: number, sampleRate: number, fftSize: number): number {
  const binWidth = sampleRate / fftSize;
  return Math.round(freq / binWidth);
}

/** Average normalized (0..1) magnitude across [loHz, hiHz). */
function bandAvg(data: Uint8Array, loHz: number, hiHz: number, sr: number, fft: number): number {
  const lo = binForFreq(loHz, sr, fft);
  const hi = Math.min(data.length - 1, binForFreq(hiHz, sr, fft));
  if (hi <= lo) return 0;
  let sum = 0;
  for (let i = lo; i < hi; i++) sum += data[i] / 255;
  return sum / (hi - lo);
}

export function computeBands(data: Uint8Array, sr: number, fft: number): FrequencyBands {
  return {
    bass: bandAvg(data, 20, BAND_EDGES.bassMax, sr, fft),
    lowMid: bandAvg(data, BAND_EDGES.bassMax, BAND_EDGES.lowMidMax, sr, fft),
    mid: bandAvg(data, BAND_EDGES.lowMidMax, BAND_EDGES.midMax, sr, fft),
    high: bandAvg(data, BAND_EDGES.midMax, BAND_EDGES.highMax, sr, fft),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/audio/FeatureExtractor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/audio/FeatureExtractor.ts tests/audio/FeatureExtractor.test.ts
git commit -m "feat: compute frequency bands from FFT data"
```

---

## Task 4: FeatureExtractor — loudness/energy smoothing + onset detection

**Files:**
- Modify: `src/audio/FeatureExtractor.ts`, `tests/audio/FeatureExtractor.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/audio/FeatureExtractor.test.ts`:
```ts
import { FeatureExtractor } from '../../src/audio/FeatureExtractor';

describe('FeatureExtractor energy + onset', () => {
  function fx() { return new FeatureExtractor(SAMPLE_RATE, FFT_SIZE); }
  const silent = new Uint8Array(FFT_SIZE / 2).fill(0);
  function loud(v = 200) { return new Uint8Array(FFT_SIZE / 2).fill(v); }

  it('energy rises toward sustained loudness and decays in silence', () => {
    const f = fx();
    let feat = f.process(silent, 0.016);
    expect(feat.energy).toBeLessThan(0.05);
    for (let i = 0; i < 300; i++) feat = f.process(loud(), 0.016);
    expect(feat.energy).toBeGreaterThan(0.3);
    for (let i = 0; i < 600; i++) feat = f.process(silent, 0.016);
    expect(feat.energy).toBeLessThan(0.1);
  });

  it('reports a beat on a sudden spectral jump, not on steady signal', () => {
    const f = fx();
    for (let i = 0; i < 30; i++) f.process(silent, 0.016);
    const jump = f.process(loud(255), 0.016);
    expect(jump.beat).toBeGreaterThan(0.2);
    let steady = jump;
    for (let i = 0; i < 10; i++) steady = f.process(loud(255), 0.016);
    expect(steady.beat).toBeLessThan(jump.beat);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/audio/FeatureExtractor.test.ts`
Expected: FAIL — `FeatureExtractor` class / `process` not defined.

- [ ] **Step 3: Implement the class**

Append to `src/audio/FeatureExtractor.ts`:
```ts
import { SMOOTHING } from '../config';
import type { AudioFeatures } from '../types';
import { computeMotionSpeed } from './tempo';

export class FeatureExtractor {
  private prev: Float32Array | null = null;
  private loudness = 0;
  private energy = 0;
  private fluxMean = 0;     // running mean of spectral flux
  private fluxVar = 1e-6;   // running variance
  private onsetTimes: number[] = [];
  private clock = 0;

  constructor(private sampleRate: number, private fftSize: number) {}

  process(data: Uint8Array, dt: number): AudioFeatures {
    this.clock += dt;
    const bands = computeBands(data, this.sampleRate, this.fftSize);

    // instantaneous loudness = mean normalized magnitude
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] / 255;
    const inst = sum / data.length;
    this.loudness += (inst - this.loudness) * SMOOTHING.loudness;
    this.energy += (this.loudness - this.energy) * SMOOTHING.energy;

    // spectral flux onset detection
    let flux = 0;
    if (this.prev) {
      for (let i = 0; i < data.length; i++) {
        const d = data[i] / 255 - this.prev[i];
        if (d > 0) flux += d;
      }
      flux /= data.length;
    }
    if (!this.prev) this.prev = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) this.prev[i] = data[i] / 255;

    // adaptive threshold via running mean/std
    const alpha = 0.05;
    const diff = flux - this.fluxMean;
    this.fluxMean += alpha * diff;
    this.fluxVar += alpha * (diff * diff - this.fluxVar);
    const std = Math.sqrt(this.fluxVar) + 1e-6;
    const z = (flux - this.fluxMean) / std;
    let beat = 0;
    if (z > 1.5) {
      beat = Math.min(1, (z - 1.5) / 3);
      const last = this.onsetTimes[this.onsetTimes.length - 1];
      if (last === undefined || this.clock - last > 0.12) {
        this.onsetTimes.push(this.clock);
        if (this.onsetTimes.length > 16) this.onsetTimes.shift();
      }
    }

    const tempoBpm = estimateTempo(this.onsetTimes);
    const motionSpeed = computeMotionSpeed(this.energy, tempoBpm);

    return { loudness: this.loudness, energy: this.energy, bands, beat, motionSpeed, tempoBpm };
  }
}

/** Median inter-onset interval -> BPM, or null if too few onsets. */
export function estimateTempo(onsetTimes: number[]): number | null {
  if (onsetTimes.length < 4) return null;
  const intervals: number[] = [];
  for (let i = 1; i < onsetTimes.length; i++) intervals.push(onsetTimes[i] - onsetTimes[i - 1]);
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  if (median <= 0) return null;
  let bpm = 60 / median;
  while (bpm < 70) bpm *= 2;   // fold into a musical range
  while (bpm > 180) bpm /= 2;
  return bpm;
}
```

- [ ] **Step 4: Run to verify pass** (Task 5 adds `tempo.ts`; if import fails, do Task 5 first, then re-run. Recommended: implement Step 3 here and Task 5 Step 3 together before running.)

Run: `npx vitest run tests/audio/FeatureExtractor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/audio/FeatureExtractor.ts tests/audio/FeatureExtractor.test.ts
git commit -m "feat: add energy smoothing, onset detection, tempo estimate"
```

---

## Task 5: Tempo → motion speed (pure function)

**Files:**
- Create: `src/audio/tempo.ts`, `tests/audio/tempo.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/audio/tempo.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeMotionSpeed } from '../../src/audio/tempo';

describe('computeMotionSpeed', () => {
  it('increases with energy', () => {
    expect(computeMotionSpeed(0.1, null)).toBeLessThan(computeMotionSpeed(0.9, null));
  });
  it('stays within sane bounds', () => {
    const s = computeMotionSpeed(1, 200);
    expect(s).toBeGreaterThan(0.3);
    expect(s).toBeLessThanOrEqual(1.8);
  });
  it('faster tempo nudges speed up', () => {
    expect(computeMotionSpeed(0.5, 80)).toBeLessThan(computeMotionSpeed(0.5, 160));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/audio/tempo.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/audio/tempo.ts`:
```ts
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Global motion multiplier from smoothed energy plus a gentle tempo nudge. */
export function computeMotionSpeed(energy: number, tempoBpm: number | null): number {
  const base = 0.35 + energy * 0.95;
  const tempoFactor = tempoBpm ? clamp(tempoBpm / 120, 0.7, 1.4) : 1;
  return clamp(base * tempoFactor, 0.3, 1.8);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/audio/tempo.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full audio test suite**

Run: `npx vitest run tests/audio`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/audio/tempo.ts tests/audio/tempo.test.ts
git commit -m "feat: derive motion speed from energy and tempo"
```

---

## Task 6: StageController (energy → layer gates)

**Files:**
- Create: `src/visual/StageController.ts`, `tests/visual/StageController.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/visual/StageController.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { StageController } from '../../src/visual/StageController';

describe('StageController', () => {
  const sc = new StageController();
  it('all layers closed at zero energy', () => {
    const g = sc.gates(0);
    expect(g.ribbons).toBe(0);
    expect(g.blooms).toBe(0);
    expect(g.kaleidoscope).toBe(0);
  });
  it('ribbons open before blooms before kaleidoscope', () => {
    const g = sc.gates(0.55);
    expect(g.ribbons).toBe(1);
    expect(g.blooms).toBeGreaterThan(0);
    expect(g.kaleidoscope).toBe(0);
  });
  it('all open at high energy', () => {
    const g = sc.gates(0.95);
    expect(g.ribbons).toBe(1);
    expect(g.blooms).toBe(1);
    expect(g.kaleidoscope).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/visual/StageController.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/visual/StageController.ts`:
```ts
import { GATES } from '../config';
import type { LayerGates } from '../types';

function gate(v: number, [lo, hi]: [number, number]): number {
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
}

export class StageController {
  gates(energy: number): LayerGates {
    return {
      ribbons: gate(energy, GATES.ribbons),
      blooms: gate(energy, GATES.blooms),
      kaleidoscope: gate(energy, GATES.kaleidoscope),
    };
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/visual/StageController.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/visual/StageController.ts tests/visual/StageController.test.ts
git commit -m "feat: stage controller maps energy to layer gates"
```

---

## Task 7: Palette (color drift)

**Files:**
- Create: `src/visual/Palette.ts`, `tests/visual/Palette.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/visual/Palette.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Palette } from '../../src/visual/Palette';

describe('Palette', () => {
  it('advances hue over time scaled by motion speed', () => {
    const p = new Palette();
    const h0 = p.baseHue;
    p.update(1, 1); // 1 second at speed 1
    expect(p.baseHue).not.toBe(h0);
  });
  it('hsl() wraps hue into 0..360 and returns an hsla string', () => {
    const p = new Palette();
    expect(p.hsl(400, 90, 60, 0.5)).toMatch(/^hsla\(40,/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/visual/Palette.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/visual/Palette.ts`:
```ts
export class Palette {
  baseHue = 200;

  update(dt: number, motionSpeed: number): void {
    this.baseHue = (this.baseHue + dt * 30 * motionSpeed) % 360;
  }

  hsl(h: number, s: number, l: number, a = 1): string {
    const hue = ((h % 360) + 360) % 360;
    return `hsla(${hue},${s}%,${l}%,${a})`;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/visual/Palette.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/visual/Palette.ts tests/visual/Palette.test.ts
git commit -m "feat: palette with time-based hue drift"
```

---

## Task 8: ParticleSystem (reusable pool)

**Files:**
- Create: `src/visual/ParticleSystem.ts`, `tests/visual/ParticleSystem.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/visual/ParticleSystem.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ParticleSystem } from '../../src/visual/ParticleSystem';

describe('ParticleSystem', () => {
  it('spawns and tracks live particles', () => {
    const ps = new ParticleSystem(100);
    ps.spawn({ x: 0, y: 0, vx: 1, vy: 0, hue: 10, decay: 0.1 });
    expect(ps.count).toBe(1);
  });
  it('removes particles when life reaches zero', () => {
    const ps = new ParticleSystem(100);
    ps.spawn({ x: 0, y: 0, vx: 0, vy: 0, hue: 10, decay: 0.5 });
    for (let i = 0; i < 5; i++) ps.update(0.5, 1);
    expect(ps.count).toBe(0);
  });
  it('enforces the cap by dropping the oldest', () => {
    const ps = new ParticleSystem(2);
    for (let i = 0; i < 5; i++) ps.spawn({ x: i, y: 0, vx: 0, vy: 0, hue: 0, decay: 0.001 });
    expect(ps.count).toBeLessThanOrEqual(2);
  });
  it('advances position by velocity * motionSpeed', () => {
    const ps = new ParticleSystem(10);
    ps.spawn({ x: 0, y: 0, vx: 10, vy: 0, hue: 0, decay: 0.001 });
    ps.update(1, 2);
    const positions: number[] = [];
    ps.forEach((p) => positions.push(p.x));
    expect(positions[0]).toBeCloseTo(20, 1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/visual/ParticleSystem.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/visual/ParticleSystem.ts`:
```ts
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
    const step = dt * 60; // normalize to ~per-frame units at 60fps
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * motionSpeed * step;
      p.y += p.vy * motionSpeed * step;
      p.vy += p.gravity * step;
      p.vx *= p.drag; p.vy *= p.drag;
      p.life -= p.decay * (0.6 + motionSpeed * 0.5) * step;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  forEach(fn: (p: Particle) => void): void { this.particles.forEach(fn); }
  clear(): void { this.particles.length = 0; }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/visual/ParticleSystem.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/visual/ParticleSystem.ts tests/visual/ParticleSystem.test.ts
git commit -m "feat: reusable capped particle system"
```

---

## Task 9: Layer interface + Renderer

**Files:**
- Create: `src/visual/Layer.ts`, `src/visual/Renderer.ts`

> No unit test — rendering is verified in-browser. Keep logic minimal here.

- [ ] **Step 1: Create `src/visual/Layer.ts`**

```ts
import type { AudioFeatures, LayerGates } from '../types';
import type { Palette } from './Palette';

export interface RenderEnv {
  ctx: CanvasRenderingContext2D;
  w: number; h: number; cx: number; cy: number;
  dt: number;
  features: AudioFeatures;
  gates: LayerGates;
  palette: Palette;
  t: number; // seconds since start
}

export interface Layer {
  update(env: RenderEnv): void;
  render(env: RenderEnv): void;
}
```

- [ ] **Step 2: Create `src/visual/Renderer.ts`**

```ts
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
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (unused-import errors are OK to resolve now if any).

- [ ] **Step 4: Commit**

```bash
git add src/visual/Layer.ts src/visual/Renderer.ts
git commit -m "feat: renderer loop, layer interface, compositing"
```

---

## Task 10: CoreLayer (uniform capped pulsing ring)

**Files:**
- Create: `src/visual/layers/CoreLayer.ts`

> Ported from the approved prototype: solid ring + circumference-scaled spikes + high-energy jitter, radius capped.

- [ ] **Step 1: Implement**

`src/visual/layers/CoreLayer.ts`:
```ts
import { CORE } from '../../config';
import type { Layer, RenderEnv } from '../Layer';

export class CoreLayer implements Layer {
  update(_env: RenderEnv): void { /* stateless; driven by features each frame */ }

  render(env: RenderEnv): void {
    const { ctx, cx, cy, features: f, palette: p, t } = env;
    const minDim = Math.min(env.w, env.h);
    const maxR = minDim * CORE.maxRadiusFrac;
    const bass = f.bands.bass * 0.6 + f.beat;
    const coreR = Math.min(maxR, 2 + f.energy * minDim * CORE.growthFrac + bass * 30 * f.energy);
    const spd = f.motionSpeed;
    const hueBase = p.baseHue;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * spd * 0.12);

    // solid ring so it always reads as one uniform circle
    ctx.beginPath();
    ctx.arc(0, 0, coreR, 0, Math.PI * 2);
    ctx.strokeStyle = p.hsl(hueBase + 20, 85, 60, 0.45 + f.energy * 0.3);
    ctx.lineWidth = 3 + f.energy * 3;
    ctx.stroke();

    // spike count scales with circumference -> constant tight spacing
    const N = Math.max(64, Math.round(coreR * 1.4));
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2;
      const band = Math.abs(Math.sin(i * 0.6 + t * spd * 2.0)) * (0.2 + bass);
      const jitter = f.energy * Math.sin(i * 12.9 + t * spd * 9.0) * 0.5 * f.energy;
      const len = Math.max(0, (5 + band * 46 + jitter * 40) * (0.3 + f.energy));
      const hue = hueBase + (i / N) * 200;
      const x1 = Math.cos(ang) * coreR, y1 = Math.sin(ang) * coreR;
      const x2 = Math.cos(ang) * (coreR + len), y2 = Math.sin(ang) * (coreR + len);
      ctx.strokeStyle = p.hsl(hue, 90, 62, 0.55 + f.energy * 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }

    // inner glow disk
    const r = Math.max(coreR, 6);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, p.hsl(hueBase + 40, 90, 66, 0.28 + f.beat * 0.45));
    g.addColorStop(0.7, p.hsl(hueBase, 80, 55, 0.12));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/visual/layers/CoreLayer.ts
git commit -m "feat: core layer — uniform capped pulsing ring"
```

---

## Task 11: RibbonLayer (aurora aura)

**Files:**
- Create: `src/visual/layers/RibbonLayer.ts`

- [ ] **Step 1: Implement**

`src/visual/layers/RibbonLayer.ts`:
```ts
import type { Layer, RenderEnv } from '../Layer';

export class RibbonLayer implements Layer {
  update(_env: RenderEnv): void { /* stateless */ }

  render(env: RenderEnv): void {
    const { ctx, w, cy, features: f, palette: p, t, gates } = env;
    const a = gates.ribbons;
    if (a <= 0.01) return;
    const spd = f.motionSpeed;
    for (let b = 0; b < 3; b++) {
      const hue = p.baseHue + b * 70;
      const amp = (14 + f.energy * 55) + b * 5;
      ctx.beginPath();
      for (let px = 0; px <= w; px += 10) {
        const y = cy + Math.sin(px * 0.012 + t * spd * 0.8 + b) * amp * Math.sin(px * 0.006 + t * 0.4);
        px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
      }
      ctx.strokeStyle = p.hsl(hue, 80, 60, 0.16 * a);
      ctx.lineWidth = 2 + f.energy * 2.5;
      ctx.stroke();
    }
  }
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` (expect no errors)
```bash
git add src/visual/layers/RibbonLayer.ts
git commit -m "feat: ribbon layer — loudness-gated aurora aura"
```

---

## Task 12: BloomLayer (bass-onset particle bursts)

**Files:**
- Create: `src/visual/layers/BloomLayer.ts`

> Spawns from the core edge on beats; shares the core radius formula. Emits a callback when a particle should crystallize, consumed by KaleidoscopeLayer (Task 13) via a shared spawn queue passed in.

- [ ] **Step 1: Implement**

`src/visual/layers/BloomLayer.ts`:
```ts
import { CAPS, CORE } from '../../config';
import { ParticleSystem } from '../ParticleSystem';
import type { Layer, RenderEnv } from '../Layer';

export interface ShardRequest { x: number; y: number; vx: number; vy: number; hue: number; size: number; }

export class BloomLayer implements Layer {
  private ps = new ParticleSystem(CAPS.blooms);
  private lastBeat = -1;
  /** Filled with crystallization requests for the KaleidoscopeLayer to consume. */
  readonly shardQueue: ShardRequest[] = [];

  update(env: RenderEnv): void {
    const { features: f, t, gates, cx, cy } = env;
    const minDim = Math.min(env.w, env.h);
    const maxR = minDim * CORE.maxRadiusFrac;
    const bass = f.bands.bass * 0.6 + f.beat;
    const coreR = Math.min(maxR, 2 + f.energy * minDim * CORE.growthFrac + bass * 30 * f.energy);

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
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` (expect no errors)
```bash
git add src/visual/layers/BloomLayer.ts
git commit -m "feat: bloom layer — bass-onset particle bursts + shard queue"
```

---

## Task 13: KaleidoscopeLayer (shards from blooms)

**Files:**
- Create: `src/visual/layers/KaleidoscopeLayer.ts`

> Consumes the `shardQueue` from a `BloomLayer` instance (passed in the constructor).

- [ ] **Step 1: Implement**

`src/visual/layers/KaleidoscopeLayer.ts`:
```ts
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
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` (expect no errors)
```bash
git add src/visual/layers/KaleidoscopeLayer.ts
git commit -m "feat: kaleidoscope layer — shards crystallized from blooms"
```

---

## Task 14: AudioEngine + sources + InputManager

**Files:**
- Create: `src/audio/sources/AudioSource.ts`, `MicSource.ts`, `DisplaySource.ts`, `FileSource.ts`, `src/audio/InputManager.ts`, `src/audio/AudioEngine.ts`

> Browser-API heavy; verified in-browser, not unit-tested.

- [ ] **Step 1: Create the source interface**

`src/audio/sources/AudioSource.ts`:
```ts
export interface AudioSource {
  readonly label: string;
  /** Create and return the source node connected to the given context. */
  connect(ctx: AudioContext): Promise<AudioNode>;
  stop(): void;
}
```

- [ ] **Step 2: Implement the three sources**

`src/audio/sources/MicSource.ts`:
```ts
import type { AudioSource } from './AudioSource';

export class MicSource implements AudioSource {
  readonly label = 'Microphone';
  private stream?: MediaStream;
  async connect(ctx: AudioContext): Promise<AudioNode> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return ctx.createMediaStreamSource(this.stream);
  }
  stop(): void { this.stream?.getTracks().forEach((t) => t.stop()); }
}
```

`src/audio/sources/DisplaySource.ts`:
```ts
import type { AudioSource } from './AudioSource';

export class DisplaySource implements AudioSource {
  readonly label = 'Tab / System audio';
  private stream?: MediaStream;
  async connect(ctx: AudioContext): Promise<AudioNode> {
    // Must request video too; many browsers won't share audio-only.
    this.stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const tracks = this.stream.getAudioTracks();
    if (tracks.length === 0) throw new Error('No audio track shared. Tick "Share tab audio".');
    return ctx.createMediaStreamSource(this.stream);
  }
  stop(): void { this.stream?.getTracks().forEach((t) => t.stop()); }
}
```

`src/audio/sources/FileSource.ts`:
```ts
import type { AudioSource } from './AudioSource';

export class FileSource implements AudioSource {
  readonly label = 'Audio file';
  readonly audio = new Audio();
  constructor(private file: File) {
    this.audio.src = URL.createObjectURL(file);
    this.audio.loop = true;
    this.audio.crossOrigin = 'anonymous';
  }
  async connect(ctx: AudioContext): Promise<AudioNode> {
    const node = ctx.createMediaElementSource(this.audio);
    node.connect(ctx.destination); // so the file is also audible
    await this.audio.play();
    return node;
  }
  stop(): void { this.audio.pause(); }
}
```

- [ ] **Step 3: Implement AudioEngine**

`src/audio/AudioEngine.ts`:
```ts
import { FFT_SIZE } from '../config';
import { FeatureExtractor } from './FeatureExtractor';
import type { AudioFeatures } from '../types';
import type { AudioSource } from './sources/AudioSource';

const SILENT: AudioFeatures = {
  loudness: 0, energy: 0, bands: { bass: 0, lowMid: 0, mid: 0, high: 0 },
  beat: 0, motionSpeed: 0.35, tempoBpm: null,
};

export class AudioEngine {
  private ctx?: AudioContext;
  private analyser?: AnalyserNode;
  private data?: Uint8Array;
  private extractor?: FeatureExtractor;
  private source?: AudioSource;
  private features: AudioFeatures = SILENT;
  private lastTime = 0;

  async use(source: AudioSource): Promise<void> {
    await this.teardown();
    this.ctx = new AudioContext();
    const node = await source.connect(this.ctx);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = 0.6;
    node.connect(this.analyser);
    this.data = new Uint8Array(this.analyser.frequencyBinCount);
    this.extractor = new FeatureExtractor(this.ctx.sampleRate, FFT_SIZE);
    this.source = source;
    this.lastTime = performance.now();
  }

  /** Pull the latest features; call once per render frame. */
  sample(): AudioFeatures {
    if (!this.analyser || !this.data || !this.extractor) return this.features;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.analyser.getByteFrequencyData(this.data);
    this.features = this.extractor.process(this.data, dt);
    return this.features;
  }

  async teardown(): Promise<void> {
    this.source?.stop();
    await this.ctx?.close();
    this.ctx = undefined; this.analyser = undefined; this.features = SILENT;
  }
}
```

- [ ] **Step 4: Implement InputManager**

`src/audio/InputManager.ts`:
```ts
import { AudioEngine } from './AudioEngine';
import { MicSource } from './sources/MicSource';
import { DisplaySource } from './sources/DisplaySource';
import { FileSource } from './sources/FileSource';

export type SourceKind = 'mic' | 'display' | 'file';

export class InputManager {
  constructor(private engine: AudioEngine) {}

  async select(kind: SourceKind, file?: File): Promise<void> {
    switch (kind) {
      case 'mic': return this.engine.use(new MicSource());
      case 'display': return this.engine.use(new DisplaySource());
      case 'file':
        if (!file) throw new Error('No file provided');
        return this.engine.use(new FileSource(file));
    }
  }
}
```

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` (expect no errors)
```bash
git add src/audio/AudioEngine.ts src/audio/InputManager.ts src/audio/sources/
git commit -m "feat: audio engine, swappable sources, input manager"
```

---

## Task 15: UI Controls + wire up main.ts

**Files:**
- Create: `src/ui/Controls.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Implement Controls**

`src/ui/Controls.ts`:
```ts
import type { SourceKind } from '../audio/InputManager';

export class Controls {
  readonly el = document.createElement('div');
  constructor(private onSelect: (kind: SourceKind, file?: File) => void) {
    this.el.style.cssText =
      'position:fixed;left:16px;bottom:16px;display:flex;gap:8px;align-items:center;' +
      'background:rgba(10,12,22,.6);padding:10px 12px;border-radius:10px;font:13px ui-monospace,monospace;';
    this.el.innerHTML = `
      <button data-k="mic">🎤 Mic</button>
      <button data-k="display">🖥️ Tab/System</button>
      <label style="cursor:pointer">📁 File<input type="file" accept="audio/*" hidden></label>
      <span id="status" style="opacity:.6;margin-left:6px"></span>`;
    this.el.querySelectorAll('button[data-k]').forEach((b) =>
      b.addEventListener('click', () => this.pick(b.getAttribute('data-k') as SourceKind)));
    const input = this.el.querySelector('input')!;
    input.addEventListener('change', () => {
      if (input.files?.[0]) this.pick('file', input.files[0]);
    });
  }
  private async pick(kind: SourceKind, file?: File) {
    this.setStatus('starting ' + kind + '…');
    try { await this.onSelect(kind, file); this.setStatus('listening: ' + kind); }
    catch (e) { this.setStatus('error: ' + (e as Error).message); }
  }
  setStatus(s: string) { (this.el.querySelector('#status') as HTMLElement).textContent = s; }
}
```

- [ ] **Step 2: Wire everything in `src/main.ts`**

```ts
import './style.css';
import { AudioEngine } from './audio/AudioEngine';
import { InputManager } from './audio/InputManager';
import { Renderer } from './visual/Renderer';
import { CoreLayer } from './visual/layers/CoreLayer';
import { RibbonLayer } from './visual/layers/RibbonLayer';
import { BloomLayer } from './visual/layers/BloomLayer';
import { KaleidoscopeLayer } from './visual/layers/KaleidoscopeLayer';
import { Controls } from './ui/Controls';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const engine = new AudioEngine();
const input = new InputManager(engine);

const blooms = new BloomLayer();
const layers = [new RibbonLayer(), new CoreLayer(), blooms, new KaleidoscopeLayer(blooms)];

const renderer = new Renderer(canvas, layers, () => engine.sample());
renderer.start();

const controls = new Controls((kind, file) => input.select(kind, file));
document.getElementById('ui')!.appendChild(controls.el);
```

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`, open `http://localhost:5173`.
Expected: blank canvas; click **🎤 Mic**, allow permission, play music near the mic → core grows from center, layers build with energy, blooms/kaleidoscope on louder moments, everything calms in silence. Try **📁 File** with an MP3 to confirm clean reactivity.

- [ ] **Step 4: Run full test suite + commit**

Run: `npm test` (expect all PASS), then `npx tsc --noEmit`.
```bash
git add src/ui/Controls.ts src/main.ts
git commit -m "feat: UI controls and end-to-end wiring (Phase 1 complete)"
```

---

## Task 16: Spotify now-playing — client (PKCE)

**Files:**
- Create: `src/spotify/SpotifyClient.ts`, `tests/spotify/SpotifyClient.test.ts`

> PKCE auth runs in-browser, verified manually. The response-parsing helper is unit-tested.

- [ ] **Step 1: Write the failing test for the parser**

`tests/spotify/SpotifyClient.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseNowPlaying } from '../../src/spotify/SpotifyClient';

describe('parseNowPlaying', () => {
  it('extracts track metadata', () => {
    const json = {
      is_playing: true, progress_ms: 1000,
      item: { name: 'Song', duration_ms: 200000,
        artists: [{ name: 'A' }, { name: 'B' }],
        album: { images: [{ url: 'big' }, { url: 'small' }] } },
    };
    const np = parseNowPlaying(json);
    expect(np).toEqual({ title: 'Song', artist: 'A, B', albumArtUrl: 'big',
      progressMs: 1000, durationMs: 200000, isPlaying: true });
  });
  it('returns null when nothing is playing', () => {
    expect(parseNowPlaying({})).toBeNull();
    expect(parseNowPlaying(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/spotify/SpotifyClient.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the client**

`src/spotify/SpotifyClient.ts`:
```ts
import { SPOTIFY } from '../config';

export interface NowPlaying {
  title: string; artist: string; albumArtUrl: string | null;
  progressMs: number; durationMs: number; isPlaying: boolean;
}

export function parseNowPlaying(json: any): NowPlaying | null {
  if (!json || !json.item) return null;
  return {
    title: json.item.name,
    artist: (json.item.artists ?? []).map((a: any) => a.name).join(', '),
    albumArtUrl: json.item.album?.images?.[0]?.url ?? null,
    progressMs: json.progress_ms ?? 0,
    durationMs: json.item.duration_ms ?? 0,
    isPlaying: !!json.is_playing,
  };
}

// --- PKCE helpers ---
function randomString(len: number): string {
  const a = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(a, (b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
async function sha256(plain: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class SpotifyClient {
  private token: string | null = null;

  /** Redirect to Spotify's consent page. */
  async login(): Promise<void> {
    const verifier = randomString(64);
    localStorage.setItem('sp_verifier', verifier);
    const challenge = await sha256(verifier);
    const params = new URLSearchParams({
      client_id: SPOTIFY.clientId, response_type: 'code',
      redirect_uri: SPOTIFY.redirectUri, scope: SPOTIFY.scopes,
      code_challenge_method: 'S256', code_challenge: challenge,
    });
    location.href = `https://accounts.spotify.com/authorize?${params}`;
  }

  /** Call on page load; exchanges ?code=… for a token if present. */
  async handleRedirect(): Promise<boolean> {
    const code = new URLSearchParams(location.search).get('code');
    if (!code) { this.token = sessionStorage.getItem('sp_token'); return !!this.token; }
    const verifier = localStorage.getItem('sp_verifier') ?? '';
    const body = new URLSearchParams({
      client_id: SPOTIFY.clientId, grant_type: 'authorization_code', code,
      redirect_uri: SPOTIFY.redirectUri, code_verifier: verifier,
    });
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    const json = await res.json();
    this.token = json.access_token ?? null;
    if (this.token) sessionStorage.setItem('sp_token', this.token);
    history.replaceState({}, '', SPOTIFY.redirectUri);
    return !!this.token;
  }

  get isLoggedIn(): boolean { return !!this.token; }

  async nowPlaying(): Promise<NowPlaying | null> {
    if (!this.token) return null;
    const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (res.status === 204) return null;       // nothing playing
    if (res.status === 401) { this.token = null; sessionStorage.removeItem('sp_token'); return null; }
    return parseNowPlaying(await res.json());
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/spotify/SpotifyClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/spotify/SpotifyClient.ts tests/spotify/SpotifyClient.test.ts
git commit -m "feat: Spotify PKCE client + now-playing parser"
```

---

## Task 17: NowPlaying overlay + wire Spotify into main

**Files:**
- Create: `src/ui/NowPlaying.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Implement the overlay**

`src/ui/NowPlaying.ts`:
```ts
import type { NowPlaying as NP } from '../spotify/SpotifyClient';

export class NowPlaying {
  readonly el = document.createElement('div');
  constructor(private onLogin: () => void) {
    this.el.style.cssText =
      'position:fixed;right:16px;top:16px;display:flex;gap:10px;align-items:center;' +
      'background:rgba(10,12,22,.6);padding:10px 12px;border-radius:10px;font:13px ui-monospace,monospace;max-width:320px;';
    this.showLogin();
  }
  showLogin() {
    this.el.innerHTML = `<button id="sp">Connect Spotify</button>`;
    this.el.querySelector('#sp')!.addEventListener('click', () => this.onLogin());
  }
  update(np: NP | null) {
    if (!np) { this.el.innerHTML = `<span style="opacity:.6">Spotify: nothing playing</span>`; return; }
    const pct = np.durationMs ? Math.round((np.progressMs / np.durationMs) * 100) : 0;
    this.el.innerHTML = `
      ${np.albumArtUrl ? `<img src="${np.albumArtUrl}" width="44" height="44" style="border-radius:6px">` : ''}
      <div style="overflow:hidden">
        <div style="font-weight:600;white-space:nowrap;text-overflow:ellipsis;overflow:hidden">${np.title}</div>
        <div style="opacity:.7;white-space:nowrap;text-overflow:ellipsis;overflow:hidden">${np.artist}</div>
        <div style="height:3px;background:#ffffff22;border-radius:2px;margin-top:5px">
          <div style="height:100%;width:${pct}%;background:#1db954;border-radius:2px"></div>
        </div>
      </div>`;
  }
}
```

- [ ] **Step 2: Wire into `src/main.ts`**

Append to `src/main.ts`:
```ts
import { SpotifyClient } from './spotify/SpotifyClient';
import { NowPlaying } from './ui/NowPlaying';

const spotify = new SpotifyClient();
const nowPlaying = new NowPlaying(() => spotify.login());
document.getElementById('ui')!.appendChild(nowPlaying.el);

spotify.handleRedirect().then((loggedIn) => {
  if (!loggedIn) return;
  const poll = async () => { nowPlaying.update(await spotify.nowPlaying()); };
  poll();
  setInterval(poll, 4000);
});
```

- [ ] **Step 3: Verify in browser**

Pre-req: register a free app at the Spotify developer dashboard, set redirect URI to `http://localhost:5173`, put the Client ID in a `.env` file as `VITE_SPOTIFY_CLIENT_ID=…`. Add `.env` to `.gitignore`.
Run: `npm run dev`, click **Connect Spotify**, approve, play a track in Spotify → overlay shows art/title/artist/progress while the visualizer reacts to a chosen audio input.

- [ ] **Step 4: Commit**

```bash
echo ".env" >> .gitignore
git add src/ui/NowPlaying.ts src/main.ts .gitignore
git commit -m "feat: Spotify now-playing overlay (Phase 2 complete)"
```

---

## Self-Review Notes

- **Spec coverage:** blank-canvas silence (Renderer SILENT features + fade), born-from-center capped uniform core (Task 10), progressive layering (StageController T6 + gates in layers), tempo-driven motion (T5), three selectable inputs (T14), Spotify overlay (T16–17), AudioFeatures boundary (T2), testing strategy (T3–8, T16). All covered.
- **Type consistency:** `AudioFeatures`, `LayerGates`, `RenderEnv`, `ShardRequest`, `NowPlaying` used consistently across tasks. `BloomLayer.shardQueue` produced in T12, consumed in T13. `Palette.baseHue`/`hsl` defined T7, used T10–13.
- **Ordering note:** Tasks 3–5 are interdependent (FeatureExtractor imports `tempo.ts`). Implement Task 5's `tempo.ts` alongside Task 4 before running their tests, as flagged in Task 4 Step 4.
- **Caps & performance:** `CAPS` enforced in ParticleSystem (T8) and KaleidoscopeLayer (T13); DPR capped at 2 in Renderer (T9).
```
