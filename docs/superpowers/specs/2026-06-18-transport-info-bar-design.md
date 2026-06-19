# Transport Info Bar + Play/Pause Fix — Design Spec

**Date:** 2026-06-18
**Status:** Approved (pending spec review)

## Goal

Improve the file-mode transport bar (`WaveformPanel`) with: (1) a fix for the play/pause button being swallowed when the UI is idle-hidden, (2) jump-to-start / jump-to-end buttons, and (3) a live info cluster on the same row showing tempo/BPM (with a beat pulse), current bar number, current section (index + tier + tier color), a real-time energy meter, and a band color legend. File-only; the live mic/tab path and the visualizer itself are unchanged.

## Background / Current State

- `src/ui/WaveformPanel.ts` renders the bottom panel: a transport row (`.hud-wave-row`) with back-1-bar / play-pause / forward-1-bar buttons, a `0:00 / 0:00` time label, a spacer, and an eye toggle — above a scrolling band-colored waveform canvas.
- `WaveformPanel.frame()` is called once per render frame from `Hud.update(features, hue)` (which already has the live `AudioFeatures`). Today `frame()` takes no args.
- `Transport` (`src/audio/Transport.ts`) exposes `play()`, `pause()`, `seek(sec)`, `position()`, `isPlaying`, `duration`. `PlayClock` is its pure position tracker.
- `AnalyzedTrack` provides `tempoBpm`, `downbeats`, `duration`, and `sections` (`{start, end, intensity, tier}`, tier ∈ `calm|building|intense|peak`).
- `AudioFeatures` provides per-frame `beat` (0..1 onset pulse), `energy` (0..1), and `sectionActive/sectionBoundary/sectionIntensity`.
- Band colors live in `WAVEFORM` config: `lowColor #e23b3b` (red, lows), `midColor #46c93a` (green, mids), `highColor #3a8ee2` (blue, highs).

## Root Cause: Play/Pause "Not Working"

`IdleHider` adds `.ui-hidden` to `#ui` after 3s of no input. The CSS rule `#ui.ui-hidden > * { pointer-events: none }` disables the whole HUD. When the cursor is already resting over the transport bar (common after loading a track and watching), the **first** click hit-tests to the full-screen `#stage` canvas instead of the button — it only triggers `IdleHider.reveal()` via the window-level `click` listener; the button's own handler never fires. The user must click a second time. Verified: when the UI is visible the button is correctly topmost (`pointer-events: auto`, `elementFromPoint` returns the button); when idle-hidden, `elementFromPoint` over the button returns the canvas.

**Fix (user-chosen "stays clickable, still fades"):** keep the transport bar interactive even while the UI is idle-faded, so the first click always lands. Add a CSS override:

```css
#ui.ui-hidden > .hud-wave { pointer-events: auto; }
```

`.hud-wave` adds class specificity over the `> *` rule, so it wins; buttons inside inherit `pointer-events: auto`. The bar still fades to `opacity: 0` (opacity-0 elements remain hit-testable), and any mouse activity still reveals it instantly. This fixes the stationary-first-click swallow without changing the clean-show fade. No JS change needed for the fix itself.

## Components / Units

### 1. Pure helpers (in `src/ui/waveform.ts`, unit-tested)

Keep DOM rendering out of these so they can be tested deterministically.

- `barNumber(pos: number, tempoBpm: number): number` — `1`-based current bar: `floor(pos / barSeconds(tempoBpm)) + 1`, min `1`; returns `1` when `tempoBpm <= 0`.
- `currentSection(sections: Section[], t: number): { index: number; section: Section } | null` — the section containing `t` (`start <= t < end`), clamped to the last section when `t >= last.end`; `null` when no sections or `t` before the first start. (Mirrors the provider's lookup but as a pure, exported helper.)
- `tierColor(tier: SectionTier): string` — returns the configured hex for the tier.

### 2. Config additions (`src/config.ts`)

Add a tier→color map (cool→hot ramp) co-located with the other transport display config:

```ts
export const TIER_COLORS: Record<SectionTier, string> = {
  calm: '#3a8ee2',     // blue
  building: '#46c93a', // green
  intense: '#e2a83b',  // amber
  peak: '#e2563b',     // red
};
```

(Import `SectionTier` type. If a circular-import risk appears, fall back to a plain `Record<string,string>` keyed by the tier strings.)

### 3. `WaveformPanel` changes (`src/ui/WaveformPanel.ts`)

- **Markup:** extend `.hud-wave-row` with two new buttons — `start` (jump to 0:00) before `back`, and `end` (jump to track end) after `fwd` — using skip-style icons distinct from the chevron-style ±1-bar buttons. Add an info cluster (right of the time label, before the eye toggle): BPM + beat-pulse dot, bar number, section chip, live energy meter. Add a thin band legend sub-line between the row and the waveform canvas: `● lows ● mids ● highs` using the `WAVEFORM` band colors.
- **`frame(features: AudioFeatures)`** (signature gains `features`): in addition to the existing time + play-icon update, update per frame:
  - **Beat pulse:** scale/opacity of the BPM dot from `features.beat` (e.g. `opacity = 0.35 + 0.65 * beat`). BPM text = `Math.round(track.tempoBpm)` (static).
  - **Bar number:** `barNumber(transport.position(), track.tempoBpm)`.
  - **Section chip:** `currentSection(track.sections, transport.position())` → `§{index+1} · {tier}`, dot + subtle tint using `tierColor(tier)`. Hidden/neutral when `null` (no sections).
  - **Live energy meter:** a small horizontal bar whose fill width = `features.energy` (0..1), updated every frame (this is the real-time energy, not the static section intensity).
  - To avoid layout thrash, only write `textContent`/style when the value actually changes (track last-rendered bar #, section index, BPM).
- **Skip handlers:** `start` → `transport.seek(0)`; `end` → `transport.seek(track.duration - 0.05)` (track loops, so it plays the tail then wraps; playback state unchanged).
- `Hud.update` already passes `features` — update its `this.waveform.frame()` call to `this.waveform.frame(features)`.

### 4. CSS (`src/ui/hud.css`)

- Add the `#ui.ui-hidden > .hud-wave { pointer-events: auto; }` override (the bug fix).
- Style the two new buttons (reuse `.hud-wbtn`), the info cluster (BPM/dot/bar/section chip/energy meter), and the band legend sub-line. Dark HUD aesthetic consistent with the existing panel; legend uses the band hex colors.

## Layout

Single transport row (left → right): `⏮ ‹ ▶/⏸ › ⏭`  ·  `0:07 / 0:24`  ·  [flex spacer]  ·  `120 BPM ●`  ·  `Bar 4`  ·  `§2 · peak`  ·  energy meter  ·  [flex spacer]  ·  eye toggle. Band legend on a thin sub-line directly above the waveform. The bar is full window width, so the cluster has room on desktop; the info cluster wraps gracefully on narrow widths.

## Data Flow

`Renderer.onFrame(features, hue)` → `Hud.update(features, hue)` → `WaveformPanel.frame(features)`. The panel reads live `features` (beat, energy) and derives bar/section from `transport.position()` + the stored `AnalyzedTrack`. No new wiring through the engine; nothing touches the analyzed/live feature pipeline.

## Testing

- **Unit (Vitest):** `barNumber` (bar 1 at t=0, increments per bar, BPM≤0 guard), `currentSection` (inside/at-boundary/after-last/empty/before-first), `tierColor` (each tier maps to its configured hex). Pure, deterministic.
- **Manual / browser:** play/pause first-click works while idle-faded; jump-to-start/end seek correctly; BPM dot pulses on beats; bar # advances; section chip updates + recolors at boundaries (calm→peak on the structured test track); energy meter moves with the music; legend matches waveform colors. Live mic/tab: panel hidden, unaffected.

## Out of Scope

- Named sections (still tier-based by design).
- Changes to the visualizer, scene logic, or the analyzed/live feature pipeline.
- New transport capabilities beyond jump-to-start/end (no scrub-bar redesign, no loop toggle).
- Top-dock controls and the existing meter.
