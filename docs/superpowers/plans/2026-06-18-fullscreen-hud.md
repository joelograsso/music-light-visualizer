# Fullscreen + Neon HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real fullscreen mode, idle auto-hide of the controls + cursor, and a restyled scene-tinted "Neon HUD" that reacts to the music.

**Architecture:** A few small, single-responsibility UI units (`FullscreenController`, `IdleHider`, a pure `meterLevels()`, a `Hud` facade) plus a class-based CSS rewrite of the two existing panels (`Controls`, `NowPlaying`). The `Renderer` gains one optional `onFrame(features, hue)` hook so the HUD is fed live energy + the eased scene hue each frame; the HUD sets a `--accent` CSS variable that all neon accents inherit. Audio → visual → UI stays one-directional.

**Tech Stack:** TypeScript, Vite, Canvas 2D, Vitest (jsdom), the browser Fullscreen API, CSS custom properties + `color-mix()`.

**Spec:** `docs/superpowers/specs/2026-06-18-fullscreen-hud-design.md`

**Branch:** `feature/hud-fullscreen` (already created).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/ui/meter.ts` | Pure: `AudioFeatures` → 5 meter bar heights | Create |
| `src/ui/IdleHider.ts` | Hide UI + cursor after idle; reveal on input | Create |
| `src/ui/FullscreenController.ts` | Wrap the Fullscreen API (toggle / state / change) | Create |
| `src/ui/Hud.ts` | Facade: owns `Controls` + `NowPlaying`; `update(features, hue)` | Create |
| `src/ui/hud.css` | All Neon-HUD styling, keyed off `--accent` | Create |
| `src/ui/Controls.ts` | Bottom-center dock: sources, meter, sensitivity, fullscreen btn | Rewrite |
| `src/ui/NowPlaying.ts` | Top-right neon now-playing chip | Restyle |
| `src/visual/Renderer.ts` | Add optional `onFrame(features, hue)` hook | Modify |
| `src/main.ts` | Wire `Hud`, `FullscreenController`, `IdleHider`, `F` key, css import | Modify |
| `tests/ui/meter.test.ts` | Unit tests for `meterLevels()` | Create |
| `tests/ui/IdleHider.test.ts` | Unit tests for `IdleHider` | Create |
| `tests/ui/FullscreenController.test.ts` | Unit tests for `FullscreenController` | Create |
| `tests/ui/Hud.test.ts` | Unit test: `update()` sets `--accent` + meter | Create |

Build order respects dependencies: `meter` → `IdleHider` → `FullscreenController` → `Controls`+css → `NowPlaying` → `Hud` → `Renderer` → `main` → verify.

---

### Task 1: `meterLevels()` pure mapping

**Files:**
- Create: `src/ui/meter.ts`
- Test: `tests/ui/meter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { meterLevels } from '../../src/ui/meter';
import type { AudioFeatures } from '../../src/types';

function features(p: Partial<AudioFeatures> & { bands?: Partial<AudioFeatures['bands']> } = {}): AudioFeatures {
  return {
    loudness: 0, energy: 0,
    bands: { bass: 0, lowMid: 0, mid: 0, high: 0, ...(p.bands ?? {}) },
    beat: 0, motionSpeed: 1, tempoBpm: null, presence: 0, drop: 0,
    beatPhase: 0, beatConfidence: 0,
    ...p,
  } as AudioFeatures;
}

describe('meterLevels', () => {
  it('returns 5 bars, all within 0..1', () => {
    const out = meterLevels(features({ energy: 1, bands: { bass: 1, lowMid: 1, mid: 1, high: 1 } }));
    expect(out).toHaveLength(5);
    for (const v of out) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });

  it('is ~flat-zero in silence', () => {
    const out = meterLevels(features());
    for (const v of out) expect(v).toBeLessThan(0.01);
  });

  it('rises with a full-spectrum loud signal', () => {
    const quiet = meterLevels(features({ energy: 0.1, bands: { bass: 0.2, lowMid: 0.2, mid: 0.2, high: 0.2 } }));
    const loud = meterLevels(features({ energy: 1, bands: { bass: 1, lowMid: 1, mid: 1, high: 1 } }));
    expect(loud.reduce((a, b) => a + b, 0)).toBeGreaterThan(quiet.reduce((a, b) => a + b, 0));
  });

  it('maps bass to the low bars and high to the top bar', () => {
    const out = meterLevels(features({ energy: 1, bands: { bass: 1, lowMid: 0, mid: 0, high: 0 } }));
    expect(out[0]).toBeGreaterThan(out[4]); // bass bar taller than treble bar
  });

  it('clamps defensively against out-of-range input', () => {
    const out = meterLevels(features({ energy: 1, bands: { bass: -1, lowMid: 5, mid: 0, high: 0 } }));
    for (const v of out) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ui/meter.test.ts`
Expected: FAIL — cannot find module `../../src/ui/meter`.

- [ ] **Step 3: Implement `meterLevels`**

```typescript
import type { AudioFeatures } from '../types';

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Five reactive meter bar heights (0..1), low → high frequency, derived from the
 * frequency bands and gated by overall energy so the meter sinks in quiet passages
 * (the dB-scaled bands can read high even when the music is faint). Deterministic.
 */
export function meterLevels(f: AudioFeatures): number[] {
  const { bass, lowMid, mid, high } = f.bands;
  const raw = [bass, (bass + lowMid) / 2, lowMid, mid, high];
  const gain = 0.25 + 0.75 * clamp01(f.energy);
  return raw.map((v) => clamp01(v) * gain);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/ui/meter.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/meter.ts tests/ui/meter.test.ts
git commit -m "feat(ui): meterLevels() — band+energy mapping for the reactive meter"
```

---

### Task 2: `IdleHider`

**Files:**
- Create: `src/ui/IdleHider.ts`
- Test: `tests/ui/IdleHider.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IdleHider } from '../../src/ui/IdleHider';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; document.body.style.cursor = ''; });

function mount(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('IdleHider', () => {
  it('hides the target and cursor after the idle delay', () => {
    const el = mount();
    new IdleHider(el, 3000).start();
    expect(el.classList.contains('ui-hidden')).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(el.classList.contains('ui-hidden')).toBe(true);
    expect(document.body.style.cursor).toBe('none');
  });

  it('reveals on activity and restarts the timer', () => {
    const el = mount();
    new IdleHider(el, 3000).start();
    vi.advanceTimersByTime(3000);
    expect(el.classList.contains('ui-hidden')).toBe(true);

    window.dispatchEvent(new Event('mousemove'));
    expect(el.classList.contains('ui-hidden')).toBe(false);
    expect(document.body.style.cursor).toBe('');

    vi.advanceTimersByTime(2999);
    expect(el.classList.contains('ui-hidden')).toBe(false); // not yet
    vi.advanceTimersByTime(1);
    expect(el.classList.contains('ui-hidden')).toBe(true);   // re-hidden
  });

  it('stops listening and clears the timer after stop()', () => {
    const el = mount();
    const hider = new IdleHider(el, 3000);
    hider.start();
    hider.stop();
    vi.advanceTimersByTime(5000);
    expect(el.classList.contains('ui-hidden')).toBe(false); // timer was cleared
    window.dispatchEvent(new Event('mousemove'));            // no-op, no throw
    expect(el.classList.contains('ui-hidden')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ui/IdleHider.test.ts`
Expected: FAIL — cannot find module `../../src/ui/IdleHider`.

- [ ] **Step 3: Implement `IdleHider`**

```typescript
/**
 * Fades a target element (and the mouse cursor) out after a stretch of no user input,
 * and reveals them instantly on any activity — so the visualizer becomes a clean light
 * show when you stop touching it. Hiding is done with a `.ui-hidden` class (see hud.css).
 */
export class IdleHider {
  private timer = 0;
  private readonly events = ['mousemove', 'keydown', 'touchstart', 'click', 'wheel'] as const;
  private readonly onActivity = (): void => this.reveal();

  constructor(private target: HTMLElement, private idleMs = 3000) {}

  start(): void {
    for (const e of this.events) window.addEventListener(e, this.onActivity, { passive: true });
    this.reveal();
  }

  stop(): void {
    for (const e of this.events) window.removeEventListener(e, this.onActivity);
    clearTimeout(this.timer);
  }

  private reveal(): void {
    this.target.classList.remove('ui-hidden');
    document.body.style.cursor = '';
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.hide(), this.idleMs);
  }

  private hide(): void {
    this.target.classList.add('ui-hidden');
    document.body.style.cursor = 'none';
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/ui/IdleHider.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/IdleHider.ts tests/ui/IdleHider.test.ts
git commit -m "feat(ui): IdleHider — auto-hide controls + cursor when idle"
```

---

### Task 3: `FullscreenController`

**Files:**
- Create: `src/ui/FullscreenController.ts`
- Test: `tests/ui/FullscreenController.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FullscreenController } from '../../src/ui/FullscreenController';

function setFsElement(el: Element | null): void {
  Object.defineProperty(document, 'fullscreenElement', { value: el, configurable: true });
}

afterEach(() => {
  setFsElement(null);
  delete (document as unknown as Record<string, unknown>).exitFullscreen;
});

describe('FullscreenController', () => {
  it('requests fullscreen when inactive', () => {
    const req = vi.fn(() => Promise.resolve());
    const el = document.createElement('div');
    (el as unknown as Record<string, unknown>).requestFullscreen = req;
    setFsElement(null);
    new FullscreenController(el).toggle();
    expect(req).toHaveBeenCalledTimes(1);
  });

  it('exits fullscreen when active', () => {
    const exit = vi.fn(() => Promise.resolve());
    (document as unknown as Record<string, unknown>).exitFullscreen = exit;
    setFsElement(document.body);
    new FullscreenController(document.createElement('div')).toggle();
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('reports state to onChange on fullscreenchange', () => {
    setFsElement(null);
    const fc = new FullscreenController();
    const cb = vi.fn();
    fc.onChange(cb);
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(cb).toHaveBeenCalledWith(false);
  });

  it('does not throw when the API is unavailable', () => {
    setFsElement(null);
    const el = document.createElement('div'); // no requestFullscreen
    expect(() => new FullscreenController(el).toggle()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ui/FullscreenController.test.ts`
Expected: FAIL — cannot find module `../../src/ui/FullscreenController`.

- [ ] **Step 3: Implement `FullscreenController`**

```typescript
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

/**
 * Thin wrapper over the browser Fullscreen API with a webkit fallback. A rejected
 * request (e.g. not triggered by a user gesture) is swallowed so we just stay windowed.
 */
export class FullscreenController {
  constructor(private el: HTMLElement = document.documentElement) {}

  get isActive(): boolean {
    const d = document as FsDocument;
    return !!(document.fullscreenElement || d.webkitFullscreenElement);
  }

  toggle(): void {
    if (this.isActive) this.exit();
    else this.request();
  }

  onChange(cb: (active: boolean) => void): void {
    const handler = (): void => cb(this.isActive);
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
  }

  private request(): void {
    const el = this.el as FsElement;
    const fn = el.requestFullscreen ?? el.webkitRequestFullscreen;
    if (!fn) return;
    Promise.resolve(fn.call(el)).catch(() => { /* blocked → stay windowed */ });
  }

  private exit(): void {
    const d = document as FsDocument;
    const fn = document.exitFullscreen ?? d.webkitExitFullscreen;
    if (!fn) return;
    Promise.resolve(fn.call(document)).catch(() => { /* ignore */ });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/ui/FullscreenController.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/FullscreenController.ts tests/ui/FullscreenController.test.ts
git commit -m "feat(ui): FullscreenController — Fullscreen API wrapper with webkit fallback"
```

---

### Task 4: Neon HUD styles + `Controls` rewrite (the dock)

No unit test (DOM/visual) — verified in the browser at the end. `Controls`'s meter wiring is covered by the `Hud` test in Task 6.

**Files:**
- Create: `src/ui/hud.css`
- Rewrite: `src/ui/Controls.ts`

- [ ] **Step 1: Create `src/ui/hud.css`**

```css
/* Neon HUD overlay — every accent keys off --accent, set per-frame from the scene hue. */
#ui { --accent: hsl(205, 90%, 62%); transition: opacity .35s ease; }
#ui.ui-hidden { opacity: 0; }
#ui.ui-hidden > * { pointer-events: none; }

.hud-dock {
  position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 14px;
  padding: 9px 14px 8px; border-radius: 12px;
  background: rgba(10, 14, 30, .66);
  border: .5px solid color-mix(in srgb, var(--accent) 55%, transparent);
  box-shadow: 0 0 18px color-mix(in srgb, var(--accent) 28%, transparent);
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  font: 12px ui-monospace, monospace; color: #dfe6ff;
}
.hud-accent-line { position: absolute; left: 14px; right: 14px; top: 0; height: 2px; background: var(--accent); border-radius: 2px; }

.hud-sources { display: flex; gap: 4px; }
.hud-src {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 28px; padding: 0; border: none; border-radius: 7px;
  background: transparent; color: rgba(220, 228, 255, .7); cursor: pointer;
}
.hud-src svg { width: 16px; height: 16px; }
.hud-src:hover { color: #fff; background: rgba(255, 255, 255, .06); }
.hud-src.is-active {
  color: #eaf2ff;
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 55%, transparent);
}

.hud-meter { display: flex; align-items: flex-end; gap: 2px; height: 18px; padding: 0 2px; }
.hud-meter-bar { width: 3px; height: 0%; background: var(--accent); border-radius: 1px; transition: height .08s linear; }

.hud-sens { display: flex; align-items: center; gap: 7px; color: rgba(220, 228, 255, .65); }
.hud-sens input { width: 72px; accent-color: var(--accent); }

.hud-status { opacity: .55; max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.hud-fs {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; padding: 0; border: none; border-radius: 7px;
  background: transparent; color: rgba(220, 228, 255, .82); cursor: pointer;
}
.hud-fs svg { width: 16px; height: 16px; }
.hud-fs:hover { color: #fff; background: rgba(255, 255, 255, .06); }

.hud-np {
  position: fixed; right: 18px; top: 18px;
  display: flex; align-items: center; gap: 10px; max-width: 320px;
  padding: 9px 11px; border-radius: 11px;
  background: rgba(10, 14, 30, .62);
  border: .5px solid color-mix(in srgb, var(--accent) 50%, transparent);
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  font: 12px ui-monospace, monospace; color: #eaf0ff;
}
.hud-np-login { background: transparent; color: #eaf0ff; border: .5px solid color-mix(in srgb, var(--accent) 60%, transparent); border-radius: 8px; padding: 6px 10px; cursor: pointer; font: inherit; }
.hud-np-login:hover { background: rgba(255, 255, 255, .06); }
.hud-np-empty { opacity: .6; }
.hud-np-art { border-radius: 6px; display: block; }
.hud-np-meta { overflow: hidden; }
.hud-np-title { font-weight: 600; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
.hud-np-artist { opacity: .7; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
.hud-np-progress { height: 3px; background: rgba(255, 255, 255, .18); border-radius: 2px; margin-top: 5px; }
.hud-np-fill { height: 100%; background: #1db954; border-radius: 2px; }

button:focus-visible, input:focus-visible { outline: 1px solid var(--accent); outline-offset: 1px; }
```

- [ ] **Step 2: Rewrite `src/ui/Controls.ts`**

```typescript
import type { SourceKind } from '../audio/InputManager';
import { ENERGY } from '../config';

const ICON: Record<string, string> = {
  mic: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="6" y="2" width="4" height="7" rx="2"/><path d="M4 8a4 4 0 0 0 8 0M8 12v2"/></svg>',
  display: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="3" width="12" height="8" rx="1"/><path d="M6 14h4M8 11v3"/></svg>',
  file: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3"/><circle cx="7" cy="10.5" r="1.3"/><path d="M8.3 10.5V7l2 .6"/></svg>',
  maximize: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3"/></svg>',
  minimize: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M6 3v3H3M10 3v3h3M6 13v-3H3M10 13v-3h3"/></svg>',
};

/** Bottom-center dock: source selector, reactive meter, sensitivity, fullscreen button. */
export class Controls {
  readonly el = document.createElement('div');
  private bars: HTMLElement[] = [];
  private fsBtn: HTMLButtonElement;

  constructor(
    private onSelect: (kind: SourceKind, file?: File) => void | Promise<void>,
    private onSensitivity: (value: number) => void,
    private onToggleFullscreen: () => void,
  ) {
    this.el.className = 'hud-dock';
    this.el.innerHTML = `
      <div class="hud-accent-line"></div>
      <div class="hud-sources">
        <button class="hud-src is-active" data-k="mic" title="Microphone" aria-label="Microphone">${ICON.mic}</button>
        <button class="hud-src" data-k="display" title="Tab / system audio" aria-label="Tab or system audio">${ICON.display}</button>
        <label class="hud-src" data-k="file" title="Audio file" aria-label="Audio file">${ICON.file}<input type="file" accept="audio/*" hidden></label>
      </div>
      <div class="hud-meter">${'<span class="hud-meter-bar"></span>'.repeat(5)}</div>
      <label class="hud-sens" title="Sensitivity — lower if it maxes out, raise if it stays dim">sens
        <input id="sens" type="range" min="${ENERGY.minSensitivity}" max="${ENERGY.maxSensitivity}" step="0.05" value="${ENERGY.defaultSensitivity}">
      </label>
      <span class="hud-status"></span>
      <button class="hud-fs" title="Fullscreen (F)" aria-label="Toggle fullscreen">${ICON.maximize}</button>`;

    this.bars = Array.from(this.el.querySelectorAll('.hud-meter-bar'));

    // Source buttons trigger immediately; the file <label> opens its hidden input natively
    // (no preventDefault) and reports via the input's change event.
    this.el.querySelectorAll('[data-k]').forEach((b) =>
      b.addEventListener('click', () => {
        const kind = b.getAttribute('data-k') as SourceKind;
        if (kind !== 'file') this.pick(kind);
      }));
    const fileInput = this.el.querySelector('input[type=file]') as HTMLInputElement;
    fileInput.addEventListener('change', () => {
      if (fileInput.files?.[0]) this.pick('file', fileInput.files[0]);
    });

    const sens = this.el.querySelector('#sens') as HTMLInputElement;
    sens.addEventListener('input', () => this.onSensitivity(parseFloat(sens.value)));

    this.fsBtn = this.el.querySelector('.hud-fs') as HTMLButtonElement;
    this.fsBtn.addEventListener('click', () => this.onToggleFullscreen());
  }

  /** Set the 5 meter bar heights from 0..1 levels. */
  setMeter(levels: number[]): void {
    for (let i = 0; i < this.bars.length; i++) {
      const v = Math.max(0, Math.min(1, levels[i] ?? 0));
      this.bars[i].style.height = `${Math.round(v * 100)}%`;
    }
  }

  /** Swap the fullscreen button icon to reflect the current state. */
  setFullscreen(active: boolean): void {
    this.fsBtn.innerHTML = active ? ICON.minimize : ICON.maximize;
  }

  setStatus(s: string): void {
    (this.el.querySelector('.hud-status') as HTMLElement).textContent = s;
  }

  private setActive(kind: SourceKind): void {
    this.el.querySelectorAll('.hud-src').forEach((b) =>
      b.classList.toggle('is-active', b.getAttribute('data-k') === kind));
  }

  private async pick(kind: SourceKind, file?: File): Promise<void> {
    this.setActive(kind);
    this.setStatus('starting ' + kind + '…');
    try { await this.onSelect(kind, file); this.setStatus('listening: ' + kind); }
    catch (e) { this.setStatus('error: ' + (e as Error).message); }
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`Controls` is not yet imported anywhere new; `main.ts` still references the old 2-arg constructor — that will error until Task 8. To check this task in isolation, expect ONLY errors in `src/main.ts` about `Controls`/`NowPlaying` arguments; no errors inside `Controls.ts` itself.)

- [ ] **Step 4: Commit**

```bash
git add src/ui/hud.css src/ui/Controls.ts
git commit -m "feat(ui): neon HUD styles + Controls dock (sources, meter, sensitivity, fullscreen)"
```

---

### Task 5: `NowPlaying` restyle

**Files:**
- Restyle: `src/ui/NowPlaying.ts`

- [ ] **Step 1: Rewrite `src/ui/NowPlaying.ts` to class-based markup**

```typescript
import type { NowPlaying as NP } from '../spotify/SpotifyClient';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Top-right neon chip: Spotify connect, then album art + title/artist + progress. */
export class NowPlaying {
  readonly el = document.createElement('div');

  constructor(private onLogin: () => void) {
    this.el.className = 'hud-np';
    this.showLogin();
  }

  showLogin(): void {
    this.el.innerHTML = `<button class="hud-np-login">Connect Spotify</button>`;
    this.el.querySelector('.hud-np-login')!.addEventListener('click', () => this.onLogin());
  }

  update(np: NP | null): void {
    if (!np) { this.el.innerHTML = `<span class="hud-np-empty">Spotify: nothing playing</span>`; return; }
    const pct = np.durationMs ? Math.round((np.progressMs / np.durationMs) * 100) : 0;
    this.el.innerHTML = `
      ${np.albumArtUrl ? `<img class="hud-np-art" src="${esc(np.albumArtUrl)}" width="44" height="44">` : ''}
      <div class="hud-np-meta">
        <div class="hud-np-title">${esc(np.title)}</div>
        <div class="hud-np-artist">${esc(np.artist)}</div>
        <div class="hud-np-progress"><div class="hud-np-fill" style="width:${pct}%"></div></div>
      </div>`;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors inside `NowPlaying.ts` (the only remaining errors are the `main.ts` wiring ones from Task 4, resolved in Task 8).

- [ ] **Step 3: Commit**

```bash
git add src/ui/NowPlaying.ts
git commit -m "feat(ui): restyle NowPlaying as the neon chip"
```

---

### Task 6: `Hud` facade

**Files:**
- Create: `src/ui/Hud.ts`
- Test: `tests/ui/Hud.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { Hud } from '../../src/ui/Hud';
import type { AudioFeatures } from '../../src/types';

function features(p: Partial<AudioFeatures> & { bands?: Partial<AudioFeatures['bands']> } = {}): AudioFeatures {
  return {
    loudness: 0, energy: 0,
    bands: { bass: 0, lowMid: 0, mid: 0, high: 0, ...(p.bands ?? {}) },
    beat: 0, motionSpeed: 1, tempoBpm: null, presence: 0, drop: 0,
    beatPhase: 0, beatConfidence: 0, ...p,
  } as AudioFeatures;
}

const noopCallbacks = {
  onSelect: () => {}, onSensitivity: () => {}, onToggleFullscreen: () => {}, onLogin: () => {},
};

describe('Hud', () => {
  it('mounts the controls dock and now-playing chip', () => {
    const mount = document.createElement('div');
    new Hud(mount, noopCallbacks);
    expect(mount.querySelector('.hud-dock')).not.toBeNull();
    expect(mount.querySelector('.hud-np')).not.toBeNull();
  });

  it('update() sets the --accent variable from the hue', () => {
    const mount = document.createElement('div');
    const hud = new Hud(mount, noopCallbacks);
    hud.update(features(), 280);
    expect(mount.style.getPropertyValue('--accent')).toBe('hsl(280, 90%, 62%)');
  });

  it('update() drives the meter bars from the features', () => {
    const mount = document.createElement('div');
    const hud = new Hud(mount, noopCallbacks);
    hud.update(features({ energy: 1, bands: { bass: 1, lowMid: 1, mid: 1, high: 1 } }), 200);
    const bars = mount.querySelectorAll<HTMLElement>('.hud-meter-bar');
    expect(bars).toHaveLength(5);
    expect(parseInt(bars[0].style.height)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ui/Hud.test.ts`
Expected: FAIL — cannot find module `../../src/ui/Hud`.

- [ ] **Step 3: Implement `Hud`**

```typescript
import type { AudioFeatures } from '../types';
import type { SourceKind } from '../audio/InputManager';
import { Controls } from './Controls';
import { NowPlaying } from './NowPlaying';
import { meterLevels } from './meter';

export interface HudCallbacks {
  onSelect: (kind: SourceKind, file?: File) => void | Promise<void>;
  onSensitivity: (value: number) => void;
  onToggleFullscreen: () => void;
  onLogin: () => void;
}

/** Owns the two HUD panels and routes per-frame data (scene tint + meter) to them. */
export class Hud {
  readonly controls: Controls;
  readonly nowPlaying: NowPlaying;

  constructor(private mount: HTMLElement, cb: HudCallbacks) {
    this.controls = new Controls(cb.onSelect, cb.onSensitivity, cb.onToggleFullscreen);
    this.nowPlaying = new NowPlaying(cb.onLogin);
    mount.appendChild(this.controls.el);
    mount.appendChild(this.nowPlaying.el);
  }

  /** Called each frame: tint the HUD to the scene hue and update the reactive meter. */
  update(features: AudioFeatures, hue: number): void {
    const h = Math.round(((hue % 360) + 360) % 360);
    this.mount.style.setProperty('--accent', `hsl(${h}, 90%, 62%)`);
    this.controls.setMeter(meterLevels(features));
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/ui/Hud.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/Hud.ts tests/ui/Hud.test.ts
git commit -m "feat(ui): Hud facade — owns the panels, routes scene tint + meter"
```

---

### Task 7: `Renderer` `onFrame` hook

**Files:**
- Modify: `src/visual/Renderer.ts`

- [ ] **Step 1: Add the optional constructor parameter**

In `src/visual/Renderer.ts`, change the constructor signature (currently ends at the `getFeatures` param):

```typescript
  constructor(private canvas: HTMLCanvasElement, private layers: Layer[],
              private getFeatures: () => AudioFeatures,
              private onFrame?: (features: AudioFeatures, hue: number) => void) {
```

- [ ] **Step 2: Invoke the hook at the end of each frame**

At the very end of the `frame(dt: number)` method (after the kaleidoscope composite block, just before the method's closing brace), add:

```typescript
    // Hand the current features + eased scene hue to any UI overlay.
    this.onFrame?.(features, this.palette.baseHue);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors from `Renderer.ts`. (The `main.ts` wiring errors from Tasks 4–5 remain until Task 8.)

- [ ] **Step 4: Commit**

```bash
git add src/visual/Renderer.ts
git commit -m "feat(visual): optional onFrame(features, hue) hook for UI overlays"
```

---

### Task 8: Wire it together in `main.ts`

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Replace `src/main.ts` with the wired-up version**

```typescript
import './style.css';
import './ui/hud.css';
import { AudioEngine } from './audio/AudioEngine';
import { InputManager } from './audio/InputManager';
import { Renderer } from './visual/Renderer';
import { CoreLayer } from './visual/layers/CoreLayer';
import { RibbonLayer } from './visual/layers/RibbonLayer';
import { BloomLayer } from './visual/layers/BloomLayer';
import { KaleidoscopeLayer } from './visual/layers/KaleidoscopeLayer';
import { StarfieldLayer } from './visual/layers/StarfieldLayer';
import { LightningLayer } from './visual/layers/LightningLayer';
import { ExplosionLayer } from './visual/layers/ExplosionLayer';
import { Hud } from './ui/Hud';
import { FullscreenController } from './ui/FullscreenController';
import { IdleHider } from './ui/IdleHider';
import { SpotifyClient } from './spotify/SpotifyClient';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const engine = new AudioEngine();
const input = new InputManager(engine);

const blooms = new BloomLayer();
const layers = [
  new StarfieldLayer(),       // warp background, behind everything
  new RibbonLayer(),
  new CoreLayer(),
  blooms,
  new KaleidoscopeLayer(blooms),
  new LightningLayer(),        // electric arcs over the core
  new ExplosionLayer(),        // drop payoff, on top
];

const ui = document.getElementById('ui')!;
const spotify = new SpotifyClient();
const fullscreen = new FullscreenController();

const hud = new Hud(ui, {
  onSelect: (kind, file) => input.select(kind, file),
  onSensitivity: (sensitivity) => engine.setSensitivity(sensitivity),
  onToggleFullscreen: () => fullscreen.toggle(),
  onLogin: () => spotify.login(),
});

fullscreen.onChange((active) => hud.controls.setFullscreen(active));
window.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') fullscreen.toggle();
});

const renderer = new Renderer(
  canvas, layers, () => engine.sample(),
  (features, hue) => hud.update(features, hue),
);
renderer.start();

const idle = new IdleHider(ui);
idle.start();

spotify.handleRedirect().then((loggedIn) => {
  if (!loggedIn) return;
  const poll = async () => {
    try { hud.nowPlaying.update(await spotify.nowPlaying()); }
    catch { /* Spotify temporarily unavailable; chip stays as-is */ }
  };
  poll();
  setInterval(poll, 4000);
}).catch(() => { /* Spotify login/token exchange failed; visualizer unaffected */ });
```

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(ui): wire Hud, fullscreen (F key + button), and idle auto-hide"
```

---

### Task 9: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — all prior tests plus the new `tests/ui/*` (meter 5, IdleHider 3, FullscreenController 4, Hud 3). 52 + 15 = 67 tests.

- [ ] **Step 2: Typecheck + production build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 3: Browser smoke test (dev server at http://localhost:5173)**

Using Playwright MCP, load the page and verify the HUD is present and reactive:

```js
// the dock, now-playing chip, and 5 meter bars exist
({
  dock: !!document.querySelector('.hud-dock'),
  np: !!document.querySelector('.hud-np'),
  bars: document.querySelectorAll('.hud-meter-bar').length,
  accent: getComputedStyle(document.getElementById('ui')).getPropertyValue('--accent'),
})
```
Expected: `{ dock: true, np: true, bars: 5, accent: "hsl(... )" }`.

- [ ] **Step 4: Verify idle auto-hide**

Wait ~3.5s without moving the mouse, then check the overlay hid:

```js
document.getElementById('ui').classList.contains('ui-hidden') // expect true after idle
```
Then dispatch a `mousemove` and confirm it reveals (`ui-hidden` removed). Take a screenshot of the HUD over the running visualizer for a visual check of the neon styling.

- [ ] **Step 5: Manual fullscreen check (with the user)**

Fullscreen requires a real user gesture and can't be driven headless. Ask the user to click the dock's fullscreen button (and press `F`) and confirm: the page fills the monitor, the button icon flips to "minimize", `Esc` exits, and the icon flips back.

- [ ] **Step 6: Final commit (only if any tuning tweaks were made during verification)**

```bash
git add -A
git commit -m "chore(ui): verification tweaks for the neon HUD"
```

---

## Notes for the implementer

- **`color-mix()` and `accent-color`** are used for the neon tints and the native slider thumb. Both are well-supported in current Chrome (the target browser). No fallback needed.
- **Ancestor opacity fades fixed children:** the dock and chip are `position: fixed` but remain DOM children of `#ui`, so the `#ui.ui-hidden { opacity: 0 }` fade applies to them. They inherit `--accent` the same way.
- **Don't reintroduce inline styles** in `Controls`/`NowPlaying` — all styling lives in `hud.css` now.
- **Keep the data flow one-directional:** the HUD only ever *reads* features + hue via `onFrame`; it must never call back into the renderer or audio engine except through the provided callbacks.
