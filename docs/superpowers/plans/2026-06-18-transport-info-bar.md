# Transport Info Bar + Play/Pause Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the play/pause button being swallowed when the HUD is idle-faded, add jump-to-start/end buttons, and add a live info cluster (BPM + beat pulse, bar #, current section index/tier/color, real-time energy meter) plus a band color legend to the file-mode transport bar.

**Architecture:** Pure, unit-tested helpers (`barNumber`, `currentSection`, `tierColor`) live in `src/ui/waveform.ts`; the DOM panel `src/ui/WaveformPanel.ts` renders the controls + info cluster and updates them each frame from the live `AudioFeatures` (already passed to `Hud.update`). The play/pause fix is a one-line CSS override. File-only; the live mic/tab path and the visualizer are untouched.

**Tech Stack:** TypeScript, Vite, Vitest (jsdom, globals), Canvas 2D, plain DOM + CSS.

**Conventions:** tests in `tests/` mirroring `src/`; `import { describe, it, expect } from 'vitest'`. Single file: `npx vitest run <path>`. Full: `npm test`. Typecheck: `npx tsc --noEmit`. Build: `npm run build`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Stay on `feature/transport-info-bar`; only `git add`/`git commit` (never `git checkout <sha>`/`git reset`).

**Spec:** `docs/superpowers/specs/2026-06-18-transport-info-bar-design.md`.

---

## File Structure

**Modified:**
- `src/config.ts` — add `TIER_COLORS` map (+ `SectionTier` type import).
- `src/ui/waveform.ts` — add pure helpers `barNumber`, `currentSection`, `tierColor`.
- `src/ui/hud.css` — play/pause pointer-events fix; info-cluster + legend styles.
- `src/ui/WaveformPanel.ts` — start/end buttons; info cluster; `frame(features)`; band legend.
- `src/ui/Hud.ts` — pass `features` into `waveform.frame(features)`.
- `tests/ui/waveform.test.ts` — tests for the new pure helpers.
- `tests/ui/WaveformPanel.test.ts` — tests for start/end seek + info cluster; update the existing `frame()` call.

---

## Task 1: `TIER_COLORS` config + pure helpers (TDD)

**Files:**
- Modify: `src/config.ts`
- Modify: `src/ui/waveform.ts`
- Test: `tests/ui/waveform.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/ui/waveform.test.ts`, extend the import on line 2 to add the new helpers, and add a `Section` type import after it:

```ts
import { bandPeaks, sampleBands, barSeconds, waveformWindow, pointerTime, formatTime, barNumber, currentSection, tierColor } from '../../src/ui/waveform';
import { analyzeTrack } from '../../src/audio/offline/analyzeTrack';
import type { AnalyzedTrack, Section } from '../../src/audio/offline/types';
```

Append these `describe` blocks at the end of the file:

```ts
describe('barNumber', () => {
  it('is 1 at the start and increments per bar', () => {
    expect(barNumber(0, 120)).toBe(1);   // barSeconds 2
    expect(barNumber(1.9, 120)).toBe(1);
    expect(barNumber(2, 120)).toBe(2);
    expect(barNumber(7, 120)).toBe(4);
  });
  it('is 1 when tempo is unknown', () => {
    expect(barNumber(50, 0)).toBe(1);
  });
});

describe('currentSection', () => {
  const secs: Section[] = [
    { start: 0, end: 10, intensity: 0.2, tier: 'calm' },
    { start: 10, end: 20, intensity: 0.9, tier: 'peak' },
  ];
  it('finds the section containing t', () => {
    expect(currentSection(secs, 5)?.index).toBe(0);
    expect(currentSection(secs, 15)?.index).toBe(1);
  });
  it('clamps to the last section past its end', () => {
    expect(currentSection(secs, 25)?.index).toBe(1);
  });
  it('returns null with no sections', () => {
    expect(currentSection([], 5)).toBe(null);
  });
});

describe('tierColor', () => {
  it('maps each tier to its configured color', () => {
    expect(tierColor('calm')).toBe('#3a8ee2');
    expect(tierColor('peak')).toBe('#e2563b');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ui/waveform.test.ts`
Expected: FAIL (`barNumber`, `currentSection`, `tierColor` not exported).

- [ ] **Step 3: Add `TIER_COLORS` to `src/config.ts`**

Add this type-only import as the FIRST line of `src/config.ts` (above `export const FFT_SIZE = 2048;`):

```ts
import type { SectionTier } from './audio/offline/types';
```

Add this block immediately AFTER the `WAVEFORM` block (after its closing `};`):

```ts
/** Section-tier colors for the transport info chip (cool -> hot energy ramp). */
export const TIER_COLORS: Record<SectionTier, string> = {
  calm: '#3a8ee2',     // blue
  building: '#46c93a', // green
  intense: '#e2a83b',  // amber
  peak: '#e2563b',     // red
};
```

- [ ] **Step 4: Add the helpers to `src/ui/waveform.ts`**

Change the imports at the top (lines 1-2) to:

```ts
import { WAVEFORM, TIER_COLORS } from '../config';
import type { AnalyzedTrack, Section, SectionTier } from '../audio/offline/types';
```

Append these exports at the end of the file:

```ts
/** 1-based bar number at playhead position `pos`; 1 when tempo is unknown. */
export function barNumber(pos: number, tempoBpm: number): number {
  const bs = barSeconds(tempoBpm);
  if (bs <= 0) return 1;
  return Math.floor(Math.max(0, pos) / bs) + 1;
}

/** The section containing time `t` (clamped to the last section once past its end), or null. */
export function currentSection(sections: Section[], t: number): { index: number; section: Section } | null {
  for (let i = 0; i < sections.length; i++) {
    if (t >= sections[i].start && t < sections[i].end) return { index: i, section: sections[i] };
  }
  if (sections.length > 0 && t >= sections[sections.length - 1].end) {
    const i = sections.length - 1;
    return { index: i, section: sections[i] };
  }
  return null;
}

/** The display color for a section tier. */
export function tierColor(tier: SectionTier): string {
  return TIER_COLORS[tier];
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/ui/waveform.test.ts`
Expected: PASS (existing tests + the 6 new ones).
Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/ui/waveform.ts tests/ui/waveform.test.ts
git commit -m "feat(transport): tier colors + barNumber/currentSection/tierColor helpers" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Play/pause pointer-events fix (CSS)

**Files:**
- Modify: `src/ui/hud.css`

No unit test (CSS-only; verified by build + browser in Task 6). This is the headline bug fix.

- [ ] **Step 1: Add the override**

In `src/ui/hud.css`, the existing lines 3-4 are:

```css
#ui.ui-hidden { opacity: 0; }
#ui.ui-hidden > * { pointer-events: none; }
```

Add a third line immediately after them:

```css
/* Keep the file transport bar clickable even while the HUD is idle-faded, so the first
   click on play/pause always lands (otherwise it falls through to the #stage canvas). */
#ui.ui-hidden > .hud-wave { pointer-events: auto; }
```

(`.hud-wave` adds class specificity over the `> *` selector, so it wins; buttons inside inherit `pointer-events: auto`. The bar still fades visually, and opacity-0 elements remain hit-testable.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` (clean — no TS affected)
Run: `npm run build` (succeeds)

- [ ] **Step 3: Commit**

```bash
git add src/ui/hud.css
git commit -m "fix(transport): keep transport bar clickable while HUD is idle-faded" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Jump-to-start / jump-to-end buttons (TDD)

**Files:**
- Modify: `src/ui/WaveformPanel.ts`
- Test: `tests/ui/WaveformPanel.test.ts`

The existing back/fwd buttons become the ±1-bar step (re-iconed as chevrons); two new buttons jump to the track ends.

- [ ] **Step 1: Write the failing test**

In `tests/ui/WaveformPanel.test.ts`, add this test inside the `describe('WaveformPanel', ...)` block:

```ts
  it('jump-to-start/end seek to the track ends', () => {
    const p = new WaveformPanel(); root.appendChild(p.el);
    const tr = fakeTransport(); // duration 100
    p.show(track(), tr as any);
    (p.el.querySelector('[data-a="start"]') as HTMLButtonElement).click();
    (p.el.querySelector('[data-a="end"]') as HTMLButtonElement).click();
    expect(tr.calls).toContainEqual(['seek', 0]);
    expect(tr.calls).toContainEqual(['seek', 99.95]); // duration 100 - 0.05
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ui/WaveformPanel.test.ts`
Expected: FAIL (`[data-a="start"]`/`[data-a="end"]` are null → `.click` throws / not found).

- [ ] **Step 3: Implement in `src/ui/WaveformPanel.ts`**

(a) Replace the `ICON` object (lines 7-14) with this (re-icons back/fwd as chevrons, adds start/end skip icons; play/pause/eye unchanged):

```ts
const ICON = {
  start: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="1.7" height="10"/><path d="M13 3.2v9.6L6 8z"/></svg>',
  end: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 3.2v9.6L10 8z"/><rect x="11.3" y="3" width="1.7" height="10"/></svg>',
  back: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 5 8l5 5"/></svg>',
  fwd: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>',
  play: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3l8 5-8 5z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="3" height="10"/><rect x="9" y="3" width="3" height="10"/></svg>',
  eye: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z"/><circle cx="8" cy="8" r="2"/></svg>',
  eyeoff: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1 8s2.5-4.5 7-4.5c1 0 1.9.2 2.7.5M15 8s-2.5 4.5-7 4.5c-1 0-1.9-.2-2.7-.5"/><path d="M2 2l12 12"/></svg>',
};
```

(b) In the `this.el.innerHTML` template (the `.hud-wave-row`), add a `start` button before the `back` button and an `end` button after the `fwd` button. The transport-button portion of the row becomes:

```html
        <button class="hud-wbtn" data-a="start" title="Jump to start" aria-label="Jump to start">${ICON.start}</button>
        <button class="hud-wbtn" data-a="back" title="Back one bar" aria-label="Seek back one bar">${ICON.back}</button>
        <button class="hud-wbtn main" data-a="play" title="Play / pause" aria-label="Play or pause">${ICON.play}</button>
        <button class="hud-wbtn" data-a="fwd" title="Forward one bar" aria-label="Seek forward one bar">${ICON.fwd}</button>
        <button class="hud-wbtn" data-a="end" title="Jump to end" aria-label="Jump to end">${ICON.end}</button>
```

(c) In the constructor, after the existing `this.el.querySelector('[data-a="fwd"]')!...` listener wiring, add:

```ts
    this.el.querySelector('[data-a="start"]')!.addEventListener('click', () => this.seekToStart());
    this.el.querySelector('[data-a="end"]')!.addEventListener('click', () => this.seekToEnd());
```

(d) Add these two private methods (next to `skip`):

```ts
  private seekToStart(): void {
    this.transport?.seek(0);
  }

  private seekToEnd(): void {
    if (this.transport && this.track) this.transport.seek(Math.max(0, this.track.duration - 0.05));
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/ui/WaveformPanel.test.ts`
Expected: PASS (existing tests + the new start/end test).
Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/WaveformPanel.ts tests/ui/WaveformPanel.test.ts
git commit -m "feat(transport): jump-to-start/end buttons; chevron icons for ±1-bar" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Info cluster + `frame(features)` + Hud wiring (TDD)

**Files:**
- Modify: `src/ui/WaveformPanel.ts`
- Modify: `src/ui/Hud.ts`
- Modify: `src/ui/hud.css`
- Test: `tests/ui/WaveformPanel.test.ts`

Adds the BPM (+ beat-pulse dot), bar number, current-section chip, and live energy meter; `frame()` gains the live `AudioFeatures` arg.

- [ ] **Step 1: Update + add tests**

In `tests/ui/WaveformPanel.test.ts`:

(a) Add an `AudioFeatures` import after the existing imports (top of file):

```ts
import type { AudioFeatures } from '../../src/types';
```

(b) Add a minimal features factory at module scope, just below the imports (above `describe`). It only needs the fields `frame()` reads:

```ts
const F = (over: Partial<AudioFeatures> = {}): AudioFeatures =>
  ({ beat: 0, energy: 0, ...over } as AudioFeatures);
```

(c) Update the EXISTING test `frame() updates the time readout and does not throw without a 2D context` — change the `p.frame()` call to pass features:

```ts
    expect(() => p.frame(F())).not.toThrow();
```

(d) Add two new tests inside the `describe` block:

```ts
  it('frame() shows BPM, bar number, and the current section', () => {
    const p = new WaveformPanel(); root.appendChild(p.el);
    const secs = [
      { start: 0, end: 50, intensity: 0.2, tier: 'calm' as const },
      { start: 50, end: 100, intensity: 0.9, tier: 'peak' as const },
    ];
    p.show(track({ tempoBpm: 120, sections: secs }), fakeTransport() as any); // position 10, barSec 2
    p.frame(F({ beat: 1, energy: 0.5 }));
    expect((p.el.querySelector('.hud-wbpm b') as HTMLElement).textContent).toBe('120');
    expect((p.el.querySelector('.hud-wbar b') as HTMLElement).textContent).toBe('6'); // floor(10/2)+1
    const section = p.el.querySelector('.hud-wsection') as HTMLElement;
    expect(section.classList.contains('hidden')).toBe(false);
    expect((section.querySelector('b') as HTMLElement).textContent).toBe('§1 · calm'); // pos 10 -> section 0
    expect((p.el.querySelector('.hud-wenergy i') as HTMLElement).style.width).toBe('50%');
  });

  it('frame() hides the section chip when the track has no sections', () => {
    const p = new WaveformPanel(); root.appendChild(p.el);
    p.show(track({ sections: [] }), fakeTransport() as any);
    p.frame(F());
    expect((p.el.querySelector('.hud-wsection') as HTMLElement).classList.contains('hidden')).toBe(true);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ui/WaveformPanel.test.ts`
Expected: FAIL (`frame` takes no args / `.hud-wbpm` etc. don't exist).

- [ ] **Step 3: Implement in `src/ui/WaveformPanel.ts`**

(a) Add the `AudioFeatures` type import near the other imports at the top:

```ts
import type { AudioFeatures } from '../types';
```

(b) Extend the `./waveform` import (the line that imports `bandPeaks, sampleBands, ...`) to also import the helpers:

```ts
import { bandPeaks, sampleBands, waveformWindow, barSeconds, pointerTime, formatTime, barNumber, currentSection, tierColor } from './waveform';
```

(c) Add these private fields to the class (next to `private timeEl: HTMLElement;`):

```ts
  private bpmEl!: HTMLElement;
  private bpmDot!: HTMLElement;
  private barEl!: HTMLElement;
  private sectionEl!: HTMLElement;
  private sectionDot!: HTMLElement;
  private sectionLabel!: HTMLElement;
  private energyFill!: HTMLElement;
  private lastBpm = -1;
  private lastBar = -1;
  private lastSectionIdx = -1;
```

(d) In the `this.el.innerHTML` template, replace the time/spacer/toggle tail of `.hud-wave-row` (the `<span class="hud-wtime">…</span>`, `<span class="hud-wspacer">`, and the toggle button) with:

```html
        <span class="hud-wtime">0:00 / 0:00</span>
        <span class="hud-wspacer"></span>
        <div class="hud-winfo">
          <span class="hud-wbpm"><i class="hud-wbpm-dot"></i><b>0</b> BPM</span>
          <span class="hud-wbar">Bar <b>1</b></span>
          <span class="hud-wsection hidden"><i class="hud-wsection-dot"></i><b></b></span>
          <span class="hud-wenergy" title="energy"><i></i></span>
        </div>
        <span class="hud-wspacer"></span>
        <button class="hud-wbtn" data-a="toggle" title="Toggle waveform" aria-label="Toggle waveform">${ICON.eye}</button>
```

(e) In the constructor, after `this.timeEl = this.el.querySelector('.hud-wtime') as HTMLElement;`, query the new elements:

```ts
    this.bpmEl = this.el.querySelector('.hud-wbpm b') as HTMLElement;
    this.bpmDot = this.el.querySelector('.hud-wbpm-dot') as HTMLElement;
    this.barEl = this.el.querySelector('.hud-wbar b') as HTMLElement;
    this.sectionEl = this.el.querySelector('.hud-wsection') as HTMLElement;
    this.sectionDot = this.el.querySelector('.hud-wsection-dot') as HTMLElement;
    this.sectionLabel = this.el.querySelector('.hud-wsection b') as HTMLElement;
    this.energyFill = this.el.querySelector('.hud-wenergy i') as HTMLElement;
```

(f) Reset the cached values in `show()` so a newly-loaded track repaints (add inside `show()`, e.g. after `this.peaks = bandPeaks(track);`):

```ts
    this.lastBpm = -1; this.lastBar = -1; this.lastSectionIdx = -1;
```

(g) Replace the `frame()` method with this (gains `features`, computes `pos` once, updates info before drawing):

```ts
  /** Called once per render frame with the current live features. */
  frame(features: AudioFeatures): void {
    if (this.el.classList.contains('hidden') || !this.transport || !this.track) return;
    const pos = this.transport.position();
    this.timeEl.textContent = `${formatTime(pos)} / ${formatTime(this.track.duration)}`;
    this.playBtn.innerHTML = this.transport.isPlaying ? ICON.pause : ICON.play;
    this.updateInfo(features, pos);
    if (this.showWave) this.draw();
  }

  /** Update the BPM/beat-pulse, bar number, section chip, and live energy meter. */
  private updateInfo(features: AudioFeatures, pos: number): void {
    if (!this.track) return;

    const bpm = Math.round(this.track.tempoBpm);
    if (bpm !== this.lastBpm) { this.bpmEl.textContent = String(bpm); this.lastBpm = bpm; }
    this.bpmDot.style.opacity = (0.3 + 0.7 * features.beat).toFixed(3);
    this.bpmDot.style.transform = `scale(${(0.8 + 0.6 * features.beat).toFixed(3)})`;

    const bar = barNumber(pos, this.track.tempoBpm);
    if (bar !== this.lastBar) { this.barEl.textContent = String(bar); this.lastBar = bar; }

    const cur = currentSection(this.track.sections, pos);
    if (cur) {
      if (cur.index !== this.lastSectionIdx) {
        const col = tierColor(cur.section.tier);
        this.sectionEl.classList.remove('hidden');
        this.sectionLabel.textContent = `§${cur.index + 1} · ${cur.section.tier}`;
        this.sectionDot.style.background = col;
        this.sectionEl.style.borderColor = col;
        this.lastSectionIdx = cur.index;
      }
    } else if (this.lastSectionIdx !== -1) {
      this.sectionEl.classList.add('hidden');
      this.lastSectionIdx = -1;
    }

    this.energyFill.style.width = `${Math.round(features.energy * 100)}%`;
  }
```

(Note: the section chip starts with the `hidden` class in the markup, and `lastSectionIdx` starts at `-1`, so the "no sections" case leaves it hidden.)

- [ ] **Step 4: Wire `Hud.ts`**

In `src/ui/Hud.ts`, in `update(features, hue)`, change the last line from `this.waveform.frame();` to:

```ts
    this.waveform.frame(features);
```

- [ ] **Step 5: Add the info-cluster CSS**

In `src/ui/hud.css`, after the `.hud-wspacer { flex: 1; }` rule, add:

```css
.hud-winfo { display: flex; align-items: center; gap: 14px; color: #aebbd6; }
.hud-winfo b { color: #e6f0ff; font-weight: 600; }
.hud-wbpm, .hud-wbar, .hud-wsection { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.hud-wbpm-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
.hud-wsection { padding: 3px 8px; border: .5px solid transparent; border-radius: 8px; }
.hud-wsection.hidden { display: none; }
.hud-wsection-dot { width: 8px; height: 8px; border-radius: 50%; }
.hud-wenergy { width: 54px; height: 6px; border-radius: 3px; background: rgba(255, 255, 255, .12); overflow: hidden; }
.hud-wenergy i { display: block; height: 100%; width: 0; background: var(--accent); }
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run tests/ui/WaveformPanel.test.ts` (PASS — existing + 2 new)
Run: `npm test` (all pass), `npx tsc --noEmit` (clean), `npm run build` (succeeds).

- [ ] **Step 7: Commit**

```bash
git add src/ui/WaveformPanel.ts src/ui/Hud.ts src/ui/hud.css tests/ui/WaveformPanel.test.ts
git commit -m "feat(transport): live info cluster — BPM+beat pulse, bar, section, energy meter" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Band color legend (TDD)

**Files:**
- Modify: `src/ui/WaveformPanel.ts`
- Modify: `src/ui/hud.css`
- Test: `tests/ui/WaveformPanel.test.ts`

A thin `● lows ● mids ● highs` legend between the controls row and the waveform; it hides with the waveform via the eye toggle.

- [ ] **Step 1: Write the failing test**

Add inside the `describe('WaveformPanel', ...)` block in `tests/ui/WaveformPanel.test.ts`:

```ts
  it('renders a 3-band color legend that hides with the waveform', () => {
    const p = new WaveformPanel(); root.appendChild(p.el);
    p.show(track(), fakeTransport() as any);
    expect(p.el.querySelectorAll('.hud-wleg').length).toBe(3);
    const legend = p.el.querySelector('.hud-wlegend') as HTMLElement;
    expect(legend.classList.contains('hidden')).toBe(false);
    (p.el.querySelector('[data-a="toggle"]') as HTMLButtonElement).click();
    expect(legend.classList.contains('hidden')).toBe(true);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ui/WaveformPanel.test.ts`
Expected: FAIL (`.hud-wlegend`/`.hud-wleg` don't exist).

- [ ] **Step 3: Implement in `src/ui/WaveformPanel.ts`**

(a) Confirm `WAVEFORM` is imported (it is — `import { WAVEFORM } from '../config';` at the top).

(b) In the `this.el.innerHTML` template, between the closing `</div>` of `.hud-wave-row` and the `<div class="hud-wave-canvas-wrap"></div>`, insert the legend:

```html
      <div class="hud-wlegend">
        <span class="hud-wleg-label">bands</span>
        <span class="hud-wleg"><i style="background:${WAVEFORM.lowColor}"></i>lows</span>
        <span class="hud-wleg"><i style="background:${WAVEFORM.midColor}"></i>mids</span>
        <span class="hud-wleg"><i style="background:${WAVEFORM.highColor}"></i>highs</span>
      </div>
```

(c) Add a `private legendEl!: HTMLElement;` field (next to the other element fields), and query it in the constructor after `this.energyFill = ...`:

```ts
    this.legendEl = this.el.querySelector('.hud-wlegend') as HTMLElement;
```

(d) In `toggleWave()`, after the existing `this.wrap.classList.toggle('hidden', !this.showWave);`, also toggle the legend:

```ts
    this.legendEl.classList.toggle('hidden', !this.showWave);
```

- [ ] **Step 4: Add the legend CSS**

In `src/ui/hud.css`, after the `.hud-wave-row { … }` rule, add:

```css
.hud-wlegend { display: flex; align-items: center; gap: 12px; padding: 0 12px 6px; font-size: 11px; color: #8b94a4; }
.hud-wlegend.hidden { display: none; }
.hud-wleg-label { color: #6b7280; }
.hud-wleg { display: inline-flex; align-items: center; gap: 5px; }
.hud-wleg i { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/ui/WaveformPanel.test.ts` (PASS)
Run: `npm test` (all pass), `npx tsc --noEmit` (clean), `npm run build` (succeeds).

- [ ] **Step 6: Commit**

```bash
git add src/ui/WaveformPanel.ts src/ui/hud.css tests/ui/WaveformPanel.test.ts
git commit -m "feat(transport): band color legend above the waveform" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Final verification + browser smoke

**Files:** none (verification only)

- [ ] **Step 1: Full suite + typecheck + build**

Run: `npm test` (all pass — waveform helpers, WaveformPanel, plus the prior suite).
Run: `npx tsc --noEmit && npm run build` (both succeed).

- [ ] **Step 2: Browser verification**

Dev server at `http://127.0.0.1:5173` (NOT localhost). Load a real, structured track and confirm:
- **Play/pause first click works** even after the HUD has idle-faded with the cursor resting on the bar (no more "dead first click").
- **⏮ / ⏭** jump to the very start / very end.
- **BPM dot pulses** on the beat; the BPM number is correct.
- **Bar #** advances as the song plays.
- **Section chip** appears, shows `§N · tier`, and recolors at section boundaries (calm→peak on a structured track); hidden for mic/tab (no sections).
- **Energy meter** moves with the music in real time.
- **Band legend** colors match the waveform (red lows / green mids / blue highs); both hide together via the eye toggle.
- Switch to **mic/tab**: the panel is hidden; live path unaffected.

- [ ] **Step 3: Confirm with the user** before finishing the branch.

---

## Self-Review

**Spec coverage:** Play/pause fix → Task 2. Jump-to-start/end → Task 3. BPM + beat pulse, bar #, section chip (index+tier+color), live energy meter → Task 4. Band legend → Task 5. `TIER_COLORS` + pure helpers (`barNumber`/`currentSection`/`tierColor`) → Task 1. `frame(features)` + Hud wiring → Task 4. Testing + browser → all tasks + Task 6.

**Placeholder scan:** none — every code/test step has complete content.

**Type consistency:** `SectionTier`/`Section` (offline/types) used by `TIER_COLORS` (Task 1), the helpers (Task 1), and the panel (Task 4). `barNumber`/`currentSection`/`tierColor` (Task 1) consumed by `WaveformPanel.updateInfo` (Task 4). `frame(features: AudioFeatures)` (Task 4) matches `Hud.update`'s `features` (Task 4) and the test factory `F` (Task 4). Element selectors (`.hud-wbpm b`, `.hud-wbar b`, `.hud-wsection`, `.hud-wenergy i`, `.hud-wleg`) are consistent between markup (Tasks 4-5), CSS (Tasks 4-5), and tests (Tasks 4-5). Button `data-a` values (`start`/`back`/`play`/`fwd`/`end`/`toggle`) consistent between markup + handlers (Task 3) and tests (Task 3).

**Out of scope (per spec):** named sections, visualizer/scene/feature-pipeline changes, scrub-bar redesign or loop toggle, top-dock controls.
