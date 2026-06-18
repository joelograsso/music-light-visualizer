# File Transport + Band-Colored Waveform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For local audio files only, add a pausable/seekable transport and a scrolling 3-band frequency-colored waveform (4 bars behind ← playhead → 4 bars ahead, red lows / green mids / blue highs, downbeat lines), toggleable, built on Stage A's precomputed `AnalyzedTrack`.

**Architecture:** A pure `PlayClock` (offset + elapsed, loop-wrapped, injected `now()`) plus a `Transport` that drives the `AudioBufferSourceNode` lifecycle and owns the single playback clock. `AnalyzedFileSource` plays through `Transport`, reads its position in the provider, and hands `(track, transport)` to the UI via a new `onReady` callback. A `WaveformPanel` redraws a `<canvas>` each frame from the precomputed band channels at `transport.position()`. Live capture and the decode/analysis fallback show no panel.

**Tech Stack:** TypeScript, Vite, Vitest (jsdom, globals), Canvas 2D, Web Audio API. No new runtime deps. Spec: `docs/superpowers/specs/2026-06-18-file-transport-waveform-design.md`. Builds on branch `feature/offline-analysis-stage-a`.

**Conventions (verified in repo):**
- Tests in `tests/` mirroring `src/`; import `{ describe, it, expect }` from `vitest` (globals are on but existing tests import them — match that).
- Deterministic synthetic data only; never `Math.random` in tests.
- Single file: `npx vitest run tests/path/x.test.ts`. Full suite: `npm test`. Typecheck: `npx tsc --noEmit`. Build: `npm run build`.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Stay on `feature/offline-analysis-stage-a`; do NOT switch branches.

---

## File Structure

**New:**
- `src/audio/PlayClock.ts` — pure playback-position tracker (`play/pause/seek/position`), injected `now()`, loop wrap.
- `src/audio/Transport.ts` — wraps `PlayClock` + `AudioContext` + `AudioBuffer`; manages the `AudioBufferSourceNode`; exposes `position()` (audible, latency-adjusted), `play/pause/seek/stop`, `duration`, `isPlaying`, `output`.
- `src/ui/waveform.ts` — pure helpers: `sampleColumn`, `barSeconds`, `waveformWindow`, `pointerTime`, `formatTime`.
- `src/ui/WaveformPanel.ts` — the bottom panel: `<canvas>` + transport control row + eye toggle; `frame()` redraws; click/drag-to-seek.

**Modified:**
- `src/config.ts` — append a `WAVEFORM` block.
- `src/audio/sources/AnalyzedFileSource.ts` — play through `Transport`; add `ReadyFn`/`onReady`; provider reads `transport.position()`; `onReady(null, null)` on fallback.
- `src/audio/InputManager.ts` — accept + thread `onReady`; hide the panel at the start of every `select`.
- `src/ui/Hud.ts` — own a `WaveformPanel`; `showWaveform`/`hideWaveform`; drive `waveform.frame()` from `update()`.
- `src/main.ts` — wire `onReady` to the HUD.
- `src/ui/hud.css` — append waveform panel + dock-shift styles.

---

## Task 1: `WAVEFORM` config block

**Files:**
- Modify: `src/config.ts` (append at end of file)

- [ ] **Step 1: Append the block**

Add to the end of `src/config.ts`:

```ts
/**
 * File transport + band-colored waveform (local files only). A scrolling window shows the
 * track around the playhead, colored by band energy. See
 * docs/superpowers/specs/2026-06-18-file-transport-waveform-design.md
 */
export const WAVEFORM = {
  barsBehind: 4,
  barsAhead: 4,
  beatsPerBar: 4,
  fallbackWindowSec: 8,   // window length when tempo is unknown (tempoBpm === 0)
  heightScale: 0.9,       // fraction of half-canvas-height at full loudness
  ampFullScale: 0.3,      // loudness mapped to full bar height
  colorFloor: 60,         // min RGB channel so quiet slices aren't pure black
  colorScale: 195,        // channel = colorFloor + share * colorScale (floor+scale = 255)
  seekStepBars: 1,        // skip-back / skip-forward step, in bars
};
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat(waveform): WAVEFORM config block" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `PlayClock` — pure playback clock

**Files:**
- Create: `src/audio/PlayClock.ts`
- Test: `tests/audio/PlayClock.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { PlayClock } from '../../src/audio/PlayClock';

describe('PlayClock', () => {
  it('advances while playing and freezes when paused', () => {
    const c = new PlayClock(10);
    c.play(0);
    expect(c.position(0)).toBeCloseTo(0, 5);
    expect(c.position(3)).toBeCloseTo(3, 5);
    c.pause(5);
    expect(c.isPlaying).toBe(false);
    expect(c.position(100)).toBeCloseTo(5, 5);
  });

  it('resumes from the paused offset', () => {
    const c = new PlayClock(10);
    c.play(0); c.pause(4); c.play(100);
    expect(c.position(102)).toBeCloseTo(6, 5);
  });

  it('seeks to an absolute position', () => {
    const c = new PlayClock(10);
    c.play(0); c.seek(8, 2);
    expect(c.position(2)).toBeCloseTo(8, 5);
    expect(c.position(3)).toBeCloseTo(9, 5);
  });

  it('wraps position for looping', () => {
    const c = new PlayClock(10);
    c.play(0);
    expect(c.position(12)).toBeCloseTo(2, 5);
    expect(c.position(25)).toBeCloseTo(5, 5);
  });

  it('clamps seeks into range', () => {
    const c = new PlayClock(10);
    c.seek(999, 0);
    expect(c.position(0)).toBeLessThan(10);
    c.seek(-5, 0);
    expect(c.position(0)).toBeCloseTo(0, 5);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/audio/PlayClock.test.ts`
Expected: FAIL (import unresolved).

- [ ] **Step 3: Implement**

```ts
/**
 * Pure playback-position tracker. `now` is an injected monotonic clock (seconds) so this
 * is unit-testable without a real AudioContext. Position loops (wraps mod duration).
 */
export class PlayClock {
  private offset = 0;     // position (s) captured at the last play/seek
  private startedAt = 0;  // now() when the current play began
  private playing = false;

  constructor(private duration: number, private loop = true) {}

  get isPlaying(): boolean { return this.playing; }

  play(now: number): void {
    if (this.playing) return;
    this.startedAt = now;
    this.playing = true;
  }

  pause(now: number): void {
    if (!this.playing) return;
    this.offset = this.raw(now);
    this.playing = false;
  }

  seek(sec: number, now: number): void {
    this.offset = this.clamp(sec);
    if (this.playing) this.startedAt = now;
  }

  position(now: number): number {
    return this.wrap(this.raw(now));
  }

  private raw(now: number): number {
    return this.playing ? this.offset + (now - this.startedAt) : this.offset;
  }

  private wrap(t: number): number {
    const d = this.duration;
    if (d <= 0) return 0;
    if (!this.loop) return Math.max(0, Math.min(d, t));
    return ((t % d) + d) % d;
  }

  private clamp(t: number): number {
    const d = this.duration;
    if (d <= 0) return 0;
    return Math.max(0, Math.min(d - 1e-3, t));
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio/PlayClock.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/PlayClock.ts tests/audio/PlayClock.test.ts
git commit -m "feat(audio): pure PlayClock (pausable/seekable, loop-wrapped position)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `Transport` — node lifecycle over `PlayClock`

**Files:**
- Create: `src/audio/Transport.ts`
- Test: `tests/audio/Transport.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Transport } from '../../src/audio/Transport';

function fakeCtx() {
  const created: any[] = [];
  return {
    currentTime: 0,
    outputLatency: 0,
    destination: {},
    createGain() { return { connect() {}, disconnect() {} }; },
    createBufferSource() {
      const n: any = {
        buffer: null, loop: false, started: -1, stopped: false,
        connect() {}, disconnect() {},
        start(_when: number, off: number) { n.started = off ?? 0; },
        stop() { n.stopped = true; },
      };
      created.push(n); return n;
    },
    _created: created,
  } as any;
}

describe('Transport', () => {
  it('plays, advances, pauses (freezing position), seeks, and resumes from a new node', () => {
    const ctx = fakeCtx();
    const tr = new Transport(ctx, { duration: 10 } as AudioBuffer);
    expect(tr.duration).toBe(10);
    expect(tr.isPlaying).toBe(false);

    tr.play();
    expect(tr.isPlaying).toBe(true);
    expect(ctx._created.length).toBe(1);
    expect(ctx._created[0].started).toBeCloseTo(0, 5);

    ctx.currentTime = 3;
    expect(tr.position()).toBeCloseTo(3, 5);

    tr.pause();
    expect(tr.isPlaying).toBe(false);
    expect(ctx._created[0].stopped).toBe(true);
    ctx.currentTime = 50;
    expect(tr.position()).toBeCloseTo(3, 5);

    tr.seek(8);
    expect(tr.position()).toBeCloseTo(8, 5);
    expect(ctx._created.length).toBe(1);

    tr.play();
    expect(ctx._created.length).toBe(2);
    expect(ctx._created[1].started).toBeCloseTo(8, 5);
  });

  it('subtracts output latency from the audible position', () => {
    const ctx = fakeCtx();
    ctx.outputLatency = 0.5;
    const tr = new Transport(ctx, { duration: 10 } as AudioBuffer);
    tr.play();
    ctx.currentTime = 4;
    expect(tr.position()).toBeCloseTo(3.5, 5);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/audio/Transport.test.ts`
Expected: FAIL (import unresolved).

- [ ] **Step 3: Implement**

```ts
import { PlayClock } from './PlayClock';

/**
 * Pausable / seekable playback of a decoded AudioBuffer. An AudioBufferSourceNode is
 * one-shot, so pause = stop + remember offset, and play/seek = start a fresh node from the
 * offset. `position()` is the single source of truth for "where we are": the loop-wrapped,
 * output-latency-adjusted AUDIBLE position, read by the visuals, playhead, and waveform.
 */
export class Transport {
  private clock: PlayClock;
  private node?: AudioBufferSourceNode;
  private out: GainNode;

  constructor(private ctx: AudioContext, private buffer: AudioBuffer) {
    this.clock = new PlayClock(buffer.duration, true);
    this.out = ctx.createGain();
    this.out.connect(ctx.destination);
  }

  get duration(): number { return this.buffer.duration; }
  get isPlaying(): boolean { return this.clock.isPlaying; }
  /** Stable output node (the engine ignores it for analyzed sources; routing lives here). */
  get output(): AudioNode { return this.out; }

  position(): number {
    const lat = this.ctx.outputLatency || 0;
    const d = this.buffer.duration;
    if (d <= 0) return 0;
    const p = this.clock.position(this.ctx.currentTime) - lat;
    return ((p % d) + d) % d;
  }

  play(): void {
    if (this.clock.isPlaying) return;
    this.clock.play(this.ctx.currentTime);
    this.startNode(this.clock.position(this.ctx.currentTime));
  }

  pause(): void {
    if (!this.clock.isPlaying) return;
    this.clock.pause(this.ctx.currentTime);
    this.stopNode();
  }

  seek(sec: number): void {
    this.clock.seek(sec, this.ctx.currentTime);
    if (this.clock.isPlaying) {
      this.stopNode();
      this.startNode(this.clock.position(this.ctx.currentTime));
    }
  }

  stop(): void { this.stopNode(); }

  private startNode(offset: number): void {
    const node = this.ctx.createBufferSource();
    node.buffer = this.buffer;
    node.loop = true;
    node.connect(this.out);
    node.start(0, offset % this.buffer.duration);
    this.node = node;
  }

  private stopNode(): void {
    if (!this.node) return;
    try { this.node.stop(); } catch { /* already stopped */ }
    this.node.disconnect();
    this.node = undefined;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio/Transport.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/Transport.ts tests/audio/Transport.test.ts
git commit -m "feat(audio): Transport — pausable/seekable AudioBufferSource playback" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Refactor `AnalyzedFileSource` to use `Transport` + `onReady`; wire `InputManager`

**Files:**
- Modify: `src/audio/sources/AnalyzedFileSource.ts` (full replace)
- Modify: `src/audio/InputManager.ts` (full replace)

No unit test (needs `AudioContext`/DOM); verified by the full suite staying green + `tsc` + `build`. `PlayClock`/`Transport` carry the unit coverage.

- [ ] **Step 1: Replace `src/audio/sources/AnalyzedFileSource.ts`**

```ts
import { FFT_SIZE, ENERGY } from '../../config';
import type { AudioSource } from './AudioSource';
import type { FeatureProvider } from '../providers/FeatureProvider';
import { AnalyzedFeatureProvider } from '../providers/AnalyzedFeatureProvider';
import { LiveFeatureProvider } from '../providers/LiveFeatureProvider';
import { FileSource } from './FileSource';
import { mixToMono } from '../offline/mixToMono';
import { Transport } from '../Transport';
import type { AnalyzedTrack } from '../offline/types';

export type ProgressStage = 'decoding' | 'analyzing' | 'ready';
export type ProgressFn = (stage: ProgressStage, pct: number) => void;
/** Fired when an analyzed file is ready to play, or null when there's no analyzed track. */
export type ReadyFn = (track: AnalyzedTrack | null, transport: Transport | null) => void;

/**
 * The "analyzed track" mode for local files: decode the whole file, analyze it in a Web
 * Worker, then play it through a pausable/seekable Transport while exposing an
 * AnalyzedFeatureProvider that reads the precomputed timeline by playback position. When
 * ready it hands (track, transport) to the UI via onReady. If decode or analysis fails it
 * falls back to the real-time FileSource path and reports onReady(null, null).
 */
export class AnalyzedFileSource implements AudioSource {
  readonly label = 'Audio file';
  private track?: AnalyzedTrack;
  private transport?: Transport;
  private fallback?: FileSource;
  private fallbackNode?: AudioNode;

  constructor(
    private file: File,
    private onProgress?: ProgressFn,
    private onReady?: ReadyFn,
  ) {}

  async connect(ctx: AudioContext): Promise<AudioNode> {
    try {
      this.onProgress?.('decoding', 0);
      const arr = await this.file.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arr);
      const channels: Float32Array[] = [];
      for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
      const mono = mixToMono(channels, buffer.length);
      this.track = await this.analyze(mono, buffer.sampleRate);

      this.transport = new Transport(ctx, buffer);
      this.transport.play();
      this.onProgress?.('ready', 1);
      this.onReady?.(this.track, this.transport);
      return this.transport.output;
    } catch {
      // Unsupported codec or analysis failure -> degrade to the real-time path, no panel.
      this.fallback = new FileSource(this.file);
      this.fallbackNode = await this.fallback.connect(ctx);
      this.onProgress?.('ready', 1);
      this.onReady?.(null, null);
      return this.fallbackNode;
    }
  }

  createProvider(ctx: AudioContext): FeatureProvider {
    if (this.track && this.transport) {
      const transport = this.transport;
      return new AnalyzedFeatureProvider(this.track, () => transport.position());
    }
    // Fallback: a live analyser tapping the real-time node.
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.6;
    this.fallbackNode!.connect(analyser);
    return new LiveFeatureProvider(analyser, ctx.sampleRate, FFT_SIZE, ENERGY.defaultSensitivity);
  }

  private analyze(mono: Float32Array, sampleRate: number): Promise<AnalyzedTrack> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../offline/worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent) => {
        const m = e.data;
        if (m.type === 'progress') this.onProgress?.('analyzing', m.pct);
        else if (m.type === 'done') { worker.terminate(); resolve(m.track as AnalyzedTrack); }
        else if (m.type === 'error') { worker.terminate(); reject(new Error(m.message)); }
      };
      worker.onerror = () => { worker.terminate(); reject(new Error('analysis worker failed')); };
      const copy = mono.slice();
      worker.postMessage({ channel: copy, sampleRate }, [copy.buffer]);
    });
  }

  stop(): void {
    this.transport?.stop();
    this.fallback?.stop();
  }
}
```

- [ ] **Step 2: Replace `src/audio/InputManager.ts`**

```ts
import { AudioEngine } from './AudioEngine';
import { MicSource } from './sources/MicSource';
import { DisplaySource } from './sources/DisplaySource';
import { AnalyzedFileSource } from './sources/AnalyzedFileSource';
import type { ProgressFn, ReadyFn } from './sources/AnalyzedFileSource';

export type SourceKind = 'mic' | 'display' | 'file';

export class InputManager {
  constructor(
    private engine: AudioEngine,
    private onProgress?: ProgressFn,
    private onReady?: ReadyFn,
  ) {}

  async select(kind: SourceKind, file?: File): Promise<void> {
    this.onReady?.(null, null); // hide any existing waveform until the new source is ready
    switch (kind) {
      case 'mic': return this.engine.use(new MicSource());
      case 'display': return this.engine.use(new DisplaySource());
      case 'file':
        if (!file) throw new Error('No file provided');
        return this.engine.use(new AnalyzedFileSource(file, this.onProgress, this.onReady));
    }
  }
}
```

- [ ] **Step 3: Verify suite + typecheck + build**

Run: `npm test`
Expected: all tests PASS (no test imports `AnalyzedFileSource`/`InputManager` directly; provider/live tests unaffected).

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: succeeds (worker chunk still emitted).

- [ ] **Step 4: Commit**

```bash
git add src/audio/sources/AnalyzedFileSource.ts src/audio/InputManager.ts
git commit -m "feat(audio): play analyzed files through Transport; onReady wiring for the UI" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `waveform.ts` — pure sampling/window/format helpers

**Files:**
- Create: `src/ui/waveform.ts`
- Test: `tests/ui/waveform.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { sampleColumn, barSeconds, waveformWindow, pointerTime, formatTime } from '../../src/ui/waveform';
import type { AnalyzedTrack } from '../../src/audio/offline/types';

function track(over: Partial<AnalyzedTrack> = {}): AnalyzedTrack {
  const z = (v: number[]) => Float32Array.from(v);
  return {
    duration: 4, sampleRate: 44100, frameRate: 1, tempoBpm: 120,
    loudness: z([0, 1, 0]), presence: z([1, 1, 1]),
    bass: z([0, 0, 0]), lowMid: z([0, 0, 0]), mid: z([0, 0, 0]), high: z([0, 0, 0]),
    onset: z([0, 0, 0]), anticipation: z([0, 0, 0]),
    beats: z([]), downbeats: z([]), drops: [],
    ...over,
  };
}

describe('sampleColumn', () => {
  it('colors a bass-dominant slice red', () => {
    const s = sampleColumn(track({ bass: Float32Array.from([0, 1, 0]) }), 1);
    expect(s.r).toBeGreaterThan(s.g);
    expect(s.r).toBeGreaterThan(s.b);
    expect(s.amp).toBeCloseTo(1, 5);
  });
  it('colors a mid-dominant slice green', () => {
    const s = sampleColumn(track({ lowMid: Float32Array.from([0, 1, 0]) }), 1);
    expect(s.g).toBeGreaterThan(s.r);
    expect(s.g).toBeGreaterThan(s.b);
  });
  it('colors a high-dominant slice blue', () => {
    const s = sampleColumn(track({ high: Float32Array.from([0, 1, 0]) }), 1);
    expect(s.b).toBeGreaterThan(s.r);
    expect(s.b).toBeGreaterThan(s.g);
  });
  it('interpolates amplitude between frames', () => {
    const s = sampleColumn(track({ loudness: Float32Array.from([0, 1]) }), 0.5);
    expect(s.amp).toBeCloseTo(0.5, 5);
  });
});

describe('barSeconds / waveformWindow / pointerTime', () => {
  it('computes seconds per bar', () => {
    expect(barSeconds(120)).toBeCloseTo(2, 5);
    expect(barSeconds(0)).toBe(0);
  });
  it('centers the window on the playhead', () => {
    const w = waveformWindow(10, 120);
    expect(w.windowSec).toBeCloseTo(16, 5);
    expect(w.t0).toBeCloseTo(2, 5);
  });
  it('uses the fallback window when tempo is unknown', () => {
    const w = waveformWindow(10, 0);
    expect(w.windowSec).toBeCloseTo(8, 5);
    expect(w.t0).toBeCloseTo(6, 5);
  });
  it('maps a pointer fraction to a time in the window', () => {
    expect(pointerTime(0.5, 10, 120)).toBeCloseTo(10, 5);
    expect(pointerTime(0, 10, 120)).toBeCloseTo(2, 5);
  });
});

describe('formatTime', () => {
  it('formats m:ss', () => {
    expect(formatTime(72)).toBe('1:12');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(0)).toBe('0:00');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ui/waveform.test.ts`
Expected: FAIL (import unresolved).

- [ ] **Step 3: Implement**

```ts
import { WAVEFORM } from '../config';
import type { AnalyzedTrack } from '../audio/offline/types';

export interface Slice { amp: number; r: number; g: number; b: number; }

function interp(ch: Float32Array, f: number): number {
  if (ch.length === 0) return 0;
  if (f <= 0) return ch[0];
  if (f >= ch.length - 1) return ch[ch.length - 1];
  const i = Math.floor(f);
  return ch[i] + (ch[i + 1] - ch[i]) * (f - i);
}

/** Sample the track at time t (seconds) -> amplitude + blended RGB (red lows / green mids / blue highs). */
export function sampleColumn(track: AnalyzedTrack, t: number): Slice {
  const f = t * track.frameRate;
  const amp = interp(track.loudness, f);
  const bass = interp(track.bass, f);
  const mids = interp(track.lowMid, f) + interp(track.mid, f);
  const high = interp(track.high, f);
  const total = bass + mids + high + 1e-6;
  const ch = (band: number) => Math.round(WAVEFORM.colorFloor + (band / total) * WAVEFORM.colorScale);
  return { amp, r: ch(bass), g: ch(mids), b: ch(high) };
}

/** Seconds per bar at the given tempo; 0 if tempo is unknown. */
export function barSeconds(tempoBpm: number): number {
  return tempoBpm > 0 ? (WAVEFORM.beatsPerBar * 60) / tempoBpm : 0;
}

/** The visible window [t0, t0 + windowSec] centered on the playhead position `pos`. */
export function waveformWindow(pos: number, tempoBpm: number): { t0: number; windowSec: number } {
  const bs = barSeconds(tempoBpm);
  const windowSec = bs > 0 ? bs * (WAVEFORM.barsBehind + WAVEFORM.barsAhead) : WAVEFORM.fallbackWindowSec;
  const behind = bs > 0 ? bs * WAVEFORM.barsBehind : windowSec / 2;
  return { t0: pos - behind, windowSec };
}

/** Map a 0..1 horizontal fraction of the canvas to a time in the window. */
export function pointerTime(fracX: number, pos: number, tempoBpm: number): number {
  const { t0, windowSec } = waveformWindow(pos, tempoBpm);
  return t0 + fracX * windowSec;
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/ui/waveform.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/waveform.ts tests/ui/waveform.test.ts
git commit -m "feat(waveform): pure sampling, window, pointer, and time helpers" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `WaveformPanel` + styles

**Files:**
- Create: `src/ui/WaveformPanel.ts`
- Test: `tests/ui/WaveformPanel.test.ts`
- Modify: `src/ui/hud.css` (append)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { WaveformPanel } from '../../src/ui/WaveformPanel';
import type { AnalyzedTrack } from '../../src/audio/offline/types';

function track(over: Partial<AnalyzedTrack> = {}): AnalyzedTrack {
  const z = (v: number[]) => Float32Array.from(v);
  return {
    duration: 100, sampleRate: 44100, frameRate: 1, tempoBpm: 120,
    loudness: z([0, 1, 0]), presence: z([1, 1, 1]),
    bass: z([0, 0, 0]), lowMid: z([0, 0, 0]), mid: z([0, 0, 0]), high: z([0, 0, 0]),
    onset: z([0, 0, 0]), anticipation: z([0, 0, 0]),
    beats: z([]), downbeats: z([]), drops: [],
    ...over,
  };
}

function fakeTransport() {
  return {
    isPlaying: false,
    duration: 100,
    calls: [] as any[],
    position() { return 10; },
    play() { this.isPlaying = true; this.calls.push('play'); },
    pause() { this.isPlaying = false; this.calls.push('pause'); },
    seek(s: number) { this.calls.push(['seek', s]); },
    stop() {},
    get output() { return {} as any; },
  };
}

describe('WaveformPanel', () => {
  let root: HTMLElement;
  beforeEach(() => { root = document.createElement('div'); document.body.appendChild(root); });

  it('the eye toggle hides and shows the canvas', () => {
    const p = new WaveformPanel(); root.appendChild(p.el);
    p.show(track(), fakeTransport() as any);
    const wrap = p.el.querySelector('.hud-wave-canvas-wrap') as HTMLElement;
    const toggle = p.el.querySelector('[data-a="toggle"]') as HTMLButtonElement;
    expect(wrap.classList.contains('hidden')).toBe(false);
    toggle.click();
    expect(wrap.classList.contains('hidden')).toBe(true);
    toggle.click();
    expect(wrap.classList.contains('hidden')).toBe(false);
  });

  it('play/pause calls the transport and updates the icon', () => {
    const p = new WaveformPanel(); root.appendChild(p.el);
    const tr = fakeTransport();
    p.show(track(), tr as any);
    const play = p.el.querySelector('[data-a="play"]') as HTMLButtonElement;
    play.click();
    expect(tr.calls).toContain('play');
    play.click();
    expect(tr.calls).toContain('pause');
  });

  it('skip buttons seek by one bar', () => {
    const p = new WaveformPanel(); root.appendChild(p.el);
    const tr = fakeTransport();
    p.show(track(), tr as any); // tempoBpm 120 -> barSec 2, position 10
    (p.el.querySelector('[data-a="back"]') as HTMLButtonElement).click();
    (p.el.querySelector('[data-a="fwd"]') as HTMLButtonElement).click();
    expect(tr.calls).toContainEqual(['seek', 8]);
    expect(tr.calls).toContainEqual(['seek', 12]);
  });

  it('click on the canvas seeks to the pointed time', () => {
    const p = new WaveformPanel(); root.appendChild(p.el);
    const tr = fakeTransport();
    p.show(track(), tr as any);
    const canvas = p.el.querySelector('canvas') as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 110, right: 100, bottom: 110, x: 0, y: 0, toJSON() {} });
    canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 50, bubbles: true }));
    expect(tr.calls).toContainEqual(['seek', 10]); // frac .5 -> t0 2 + .5*16
  });

  it('frame() updates the time readout and does not throw without a 2D context', () => {
    const p = new WaveformPanel(); root.appendChild(p.el);
    p.show(track(), fakeTransport() as any);
    expect(() => p.frame()).not.toThrow();
    expect((p.el.querySelector('.hud-wtime') as HTMLElement).textContent).toBe('0:10 / 1:40');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ui/WaveformPanel.test.ts`
Expected: FAIL (import unresolved).

- [ ] **Step 3: Implement `src/ui/WaveformPanel.ts`**

```ts
import { WAVEFORM } from '../config';
import type { AnalyzedTrack } from '../audio/offline/types';
import type { Transport } from '../audio/Transport';
import { sampleColumn, waveformWindow, barSeconds, pointerTime, formatTime } from './waveform';

const ICON = {
  back: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3v10H3.5V3z"/><path d="M13 3l-7 5 7 5z"/></svg>',
  fwd: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 3l7 5-7 5z"/><path d="M11 3v10h1.5V3z"/></svg>',
  play: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3l8 5-8 5z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="3" height="10"/><rect x="9" y="3" width="3" height="10"/></svg>',
  eye: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z"/><circle cx="8" cy="8" r="2"/></svg>',
  eyeoff: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1 8s2.5-4.5 7-4.5c1 0 1.9.2 2.7.5M15 8s-2.5 4.5-7 4.5c-1 0-1.9-.2-2.7-.5"/><path d="M2 2l12 12"/></svg>',
};

/** Bottom panel (file-only): transport controls + a scrolling band-colored waveform. */
export class WaveformPanel {
  readonly el = document.createElement('div');
  private canvas = document.createElement('canvas');
  private cctx: CanvasRenderingContext2D | null = null;
  private wrap: HTMLElement;
  private playBtn: HTMLButtonElement;
  private toggleBtn: HTMLButtonElement;
  private timeEl: HTMLElement;
  private track?: AnalyzedTrack;
  private transport?: Transport;
  private showWave = true;
  private dragging = false;

  constructor() {
    this.el.className = 'hud-wave hidden';
    this.el.innerHTML = `
      <div class="hud-wave-row">
        <button class="hud-wbtn" data-a="back" title="Back one bar" aria-label="Seek back one bar">${ICON.back}</button>
        <button class="hud-wbtn main" data-a="play" title="Play / pause" aria-label="Play or pause">${ICON.play}</button>
        <button class="hud-wbtn" data-a="fwd" title="Forward one bar" aria-label="Seek forward one bar">${ICON.fwd}</button>
        <span class="hud-wtime">0:00 / 0:00</span>
        <span class="hud-wspacer"></span>
        <button class="hud-wbtn" data-a="toggle" title="Toggle waveform" aria-label="Toggle waveform">${ICON.eye}</button>
      </div>
      <div class="hud-wave-canvas-wrap"></div>`;

    this.wrap = this.el.querySelector('.hud-wave-canvas-wrap') as HTMLElement;
    this.wrap.appendChild(this.canvas);
    this.playBtn = this.el.querySelector('[data-a="play"]') as HTMLButtonElement;
    this.toggleBtn = this.el.querySelector('[data-a="toggle"]') as HTMLButtonElement;
    this.timeEl = this.el.querySelector('.hud-wtime') as HTMLElement;
    try { this.cctx = this.canvas.getContext('2d'); } catch { this.cctx = null; }

    this.el.querySelector('[data-a="back"]')!.addEventListener('click', () => this.skip(-1));
    this.el.querySelector('[data-a="fwd"]')!.addEventListener('click', () => this.skip(1));
    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.toggleBtn.addEventListener('click', () => this.toggleWave());

    this.canvas.addEventListener('pointerdown', (e) => { this.dragging = true; this.seekTo(e); });
    this.canvas.addEventListener('pointermove', (e) => { if (this.dragging) this.seekTo(e); });
    window.addEventListener('pointerup', () => { this.dragging = false; });
  }

  show(track: AnalyzedTrack, transport: Transport): void {
    this.track = track;
    this.transport = transport;
    this.showWave = true;
    this.wrap.classList.remove('hidden');
    this.toggleBtn.innerHTML = ICON.eye;
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.el.classList.add('hidden');
    this.track = undefined;
    this.transport = undefined;
  }

  /** Called once per render frame. */
  frame(): void {
    if (this.el.classList.contains('hidden') || !this.transport || !this.track) return;
    this.timeEl.textContent = `${formatTime(this.transport.position())} / ${formatTime(this.track.duration)}`;
    this.playBtn.innerHTML = this.transport.isPlaying ? ICON.pause : ICON.play;
    if (this.showWave) this.draw();
  }

  private togglePlay(): void {
    if (!this.transport) return;
    if (this.transport.isPlaying) this.transport.pause();
    else this.transport.play();
    this.playBtn.innerHTML = this.transport.isPlaying ? ICON.pause : ICON.play;
  }

  private toggleWave(): void {
    this.showWave = !this.showWave;
    this.wrap.classList.toggle('hidden', !this.showWave);
    this.toggleBtn.innerHTML = this.showWave ? ICON.eye : ICON.eyeoff;
  }

  private step(): number {
    if (!this.track) return 5;
    const bs = barSeconds(this.track.tempoBpm) * WAVEFORM.seekStepBars;
    return bs > 0 ? bs : 5;
  }

  private skip(dir: number): void {
    if (!this.transport) return;
    this.transport.seek(this.transport.position() + dir * this.step());
  }

  private seekTo(e: PointerEvent): void {
    if (!this.transport || !this.track) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0) return;
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    this.transport.seek(pointerTime(frac, this.transport.position(), this.track.tempoBpm));
  }

  private draw(): void {
    const ctx = this.cctx;
    if (!ctx || !this.transport || !this.track) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr; this.canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pos = this.transport.position();
    const dur = this.track.duration;
    const { t0, windowSec } = waveformWindow(pos, this.track.tempoBpm);
    const mid = h / 2;
    const maxHalf = mid * WAVEFORM.heightScale;

    for (let x = 0; x < w; x++) {
      const t = t0 + (x / w) * windowSec;
      if (t < 0 || t > dur) continue;
      const s = sampleColumn(this.track, t);
      const half = Math.min(1, s.amp / WAVEFORM.ampFullScale) * maxHalf;
      ctx.fillStyle = `rgb(${s.r},${s.g},${s.b})`;
      ctx.fillRect(x, mid - half, 1, half * 2);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (const dt of this.track.downbeats) {
      if (dt < t0 || dt > t0 + windowSec) continue;
      const x = ((dt - t0) / windowSec) * w;
      ctx.fillRect(x, 0, 1, h);
    }

    ctx.fillStyle = '#fff';
    ctx.fillRect(w / 2 - 1, 0, 2, h);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/ui/WaveformPanel.test.ts`
Expected: PASS (5 tests). (jsdom prints a "getContext not implemented" notice — harmless; `cctx` is null so `draw()` no-ops.)

- [ ] **Step 5: Append styles to `src/ui/hud.css`**

Add at the end of `src/ui/hud.css`:

```css
/* File transport + band-colored waveform (file source only) */
.hud-wave {
  position: fixed; left: 0; right: 0; bottom: 0;
  display: flex; flex-direction: column;
  background: rgba(10, 14, 30, .72);
  border-top: .5px solid color-mix(in srgb, var(--accent) 55%, transparent);
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  font: 12px ui-monospace, monospace; color: #e6f0ff;
}
.hud-wave.hidden { display: none; }
.hud-wave-row { display: flex; align-items: center; gap: 10px; padding: 6px 12px; }
.hud-wbtn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; padding: 0; border-radius: 50%;
  border: .5px solid color-mix(in srgb, var(--accent) 45%, transparent);
  background: transparent; color: #e6f0ff; cursor: pointer;
}
.hud-wbtn:hover { background: rgba(255, 255, 255, .06); }
.hud-wbtn.main { background: color-mix(in srgb, var(--accent) 85%, transparent); border-color: var(--accent); color: #06101f; }
.hud-wbtn svg { width: 16px; height: 16px; }
.hud-wtime { color: #aebbd6; }
.hud-wspacer { flex: 1; }
.hud-wave-canvas-wrap { height: 110px; }
.hud-wave-canvas-wrap.hidden { display: none; }
.hud-wave-canvas-wrap canvas { display: block; width: 100%; height: 100%; }
/* lift the dock above the waveform panel while it's visible */
#ui.has-waveform .hud-dock { bottom: 168px; }
```

- [ ] **Step 6: Verify suite + typecheck**

Run: `npx vitest run tests/ui/WaveformPanel.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/ui/WaveformPanel.ts tests/ui/WaveformPanel.test.ts src/ui/hud.css
git commit -m "feat(ui): WaveformPanel — transport controls + scrolling band-colored waveform" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Wire the panel into `Hud` and `main.ts`

**Files:**
- Modify: `src/ui/Hud.ts` (full replace)
- Modify: `src/main.ts` (two edits)

- [ ] **Step 1: Replace `src/ui/Hud.ts`**

```ts
import type { AudioFeatures } from '../types';
import type { SourceKind } from '../audio/InputManager';
import type { AnalyzedTrack } from '../audio/offline/types';
import type { Transport } from '../audio/Transport';
import { Controls } from './Controls';
import { NowPlaying } from './NowPlaying';
import { WaveformPanel } from './WaveformPanel';
import { meterLevels } from './meter';

export interface HudCallbacks {
  onSelect: (kind: SourceKind, file?: File) => void | Promise<void>;
  onSensitivity: (value: number) => void;
  onToggleFullscreen: () => void;
  onLogin: () => void;
}

/** Owns the HUD panels and routes per-frame data (scene tint + meter + waveform) to them. */
export class Hud {
  readonly controls: Controls;
  readonly nowPlaying: NowPlaying;
  readonly waveform: WaveformPanel;

  constructor(private mount: HTMLElement, cb: HudCallbacks) {
    this.controls = new Controls(cb.onSelect, cb.onSensitivity, cb.onToggleFullscreen);
    this.nowPlaying = new NowPlaying(cb.onLogin);
    this.waveform = new WaveformPanel();
    mount.appendChild(this.controls.el);
    mount.appendChild(this.nowPlaying.el);
    mount.appendChild(this.waveform.el);
  }

  /** Show the file transport + waveform panel and lift the dock above it. */
  showWaveform(track: AnalyzedTrack, transport: Transport): void {
    this.waveform.show(track, transport);
    this.mount.classList.add('has-waveform');
  }

  /** Hide the panel (non-file sources, or analysis fallback). */
  hideWaveform(): void {
    this.waveform.hide();
    this.mount.classList.remove('has-waveform');
  }

  /** Called each frame: tint the HUD, update the meter, and redraw the waveform. */
  update(features: AudioFeatures, hue: number): void {
    const h = Math.round(((hue % 360) + 360) % 360);
    this.mount.style.setProperty('--accent', `hsl(${h}, 90%, 62%)`);
    this.controls.setMeter(meterLevels(features));
    this.waveform.frame();
  }
}
```

- [ ] **Step 2: Edit `src/main.ts` — add the `onReady` wiring**

Replace this block (currently around lines 20-23):

```ts
const engine = new AudioEngine();
const ui = document.getElementById('ui')!;
const analysisOverlay = new AnalysisOverlay(ui);
const input = new InputManager(engine, (stage, pct) => analysisOverlay.update(stage, pct));
```

with:

```ts
const engine = new AudioEngine();
const ui = document.getElementById('ui')!;
const analysisOverlay = new AnalysisOverlay(ui);
let hud: Hud;
const input = new InputManager(
  engine,
  (stage, pct) => analysisOverlay.update(stage, pct),
  (track, transport) => {
    if (track && transport) hud.showWaveform(track, transport);
    else hud.hideWaveform();
  },
);
```

- [ ] **Step 3: Edit `src/main.ts` — assign (don't redeclare) `hud`**

Change the HUD construction line (currently `const hud = new Hud(ui, {`) to assign the existing `let`:

```ts
hud = new Hud(ui, {
```

(Leave the rest of the `Hud(...)` call and all later `hud.*` usages unchanged. `hud` is assigned before any of the callbacks above can fire — they only run on a later source selection — and before the render loop's `hud.update` runs.)

- [ ] **Step 4: Verify suite + typecheck + build**

Run: `npm test`
Expected: all tests PASS.

Run: `npx tsc --noEmit`
Expected: no errors (in particular, no "used before declaration" for `hud` — the `let` declaration precedes its use in the closures).

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/ui/Hud.ts src/main.ts
git commit -m "feat(ui): wire the waveform panel into the HUD (file-only show/hide)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: all tests PASS — the prior suite plus the new `PlayClock`, `Transport`, `waveform`, and `WaveformPanel` tests.

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed; the analysis worker chunk is still emitted.

- [ ] **Step 3: Browser smoke test**

Dev server at `http://127.0.0.1:5173` (NOT `localhost`); start with `npm run dev` if needed. Load a local audio file and verify:
- The bottom **waveform panel appears** once analysis finishes; the colored waveform **scrolls** past a fixed center playhead with **bar (downbeat) lines**; upcoming bars are visible (look-ahead).
- **Play/pause** toggles playback and the icon; **skip back/forward** jump by one bar; **click/drag** on the waveform seeks; the main visuals, drops, and beats stay in sync through seeks.
- The **eye toggle** collapses/restores the waveform (transport row stays).
- The panel **auto-hides with the HUD** after idle and reappears on activity.
- Switching to **mic/tab** hides the panel; a file the browser can't decode falls back to plain playback with **no panel**.

- [ ] **Step 4: Confirm with the user** before finishing the branch.

---

## Self-Review

**Spec coverage:**
- `Transport`/`PlayClock` (pausable/seekable, single audible clock) → Tasks 2-3; provider reads `transport.position()` → Task 4.
- Precomputed scrolling waveform, 4 bars behind/ahead, blended color, downbeat lines, center playhead, click/drag seek → Tasks 5-6.
- Transport UI (play/pause, ±1 bar, time readout, eye toggle) → Task 6.
- File-only show/hide + fallback hides panel + `onReady` wiring → Tasks 4, 7.
- Placement (bottom, dock-shift) + auto-hide via existing IdleHider → Task 6 CSS + Task 7.
- `WAVEFORM` config → Task 1. Testing bullets → per-task tests + Task 8 smoke test.

**Placeholder scan:** none — every code/test step is complete.

**Type consistency:** `ReadyFn(track, transport)` defined in Task 4, consumed by `InputManager` (Task 4) and `main.ts` (Task 7); `Transport` public surface (`position/play/pause/seek/stop/duration/isPlaying/output`) is used consistently by Tasks 4, 6, 7 and the fake in Task 6's test; `Slice`/`sampleColumn`/`barSeconds`/`waveformWindow`/`pointerTime`/`formatTime` from Task 5 are used exactly by Task 6; `WAVEFORM` field names match across Tasks 1, 5, 6.

**Out of scope (per spec):** toggle/setting persistence, zoom/pan, waveform for live capture or the fallback path, beat-level marker density, changes to the main visualizer layers or Stage A analysis.
