# File Transport + Band-Colored Waveform — Design

**Date:** 2026-06-18
**Status:** Approved (design); ready for implementation planning
**Branch:** builds on `feature/offline-analysis-stage-a` (extends Stage A)

## Goal

For **local audio files only**, add a transport (play / pause / seek) and a **scrolling
3-band frequency-colored waveform** that shows the song moving past a fixed playhead —
**4 bars behind and 4 bars ahead** — colored red (lows) / green (mids) / blue (highs),
with a line on each downbeat. The waveform is toggleable. Because Stage A already analyzed
the whole track offline, the panel can draw the *upcoming* bars (a live analyser never
could). Live capture (mic / tab) is unaffected and shows no panel.

## Background — current state (post Stage A)

Stage A added offline analysis for files: `AnalyzedFileSource` decodes the file, runs
`analyzeTrack` in a Web Worker into an `AnalyzedTrack`, plays it through a one-shot
`AudioBufferSourceNode`, and exposes an `AnalyzedFeatureProvider` whose clock is inline:
`() => ctx.currentTime - startTime - outputLatency`. The provider drives the main
visualizer via `AudioEngine.sample()` each frame.

`AnalyzedTrack` already holds, for the whole track at `frameRate` (~86 fps): `loudness`,
`presence`, `bass`, `lowMid`, `mid`, `high`, `onset`, `anticipation` channels, plus
`beats`, `downbeats`, `drops`, and `tempoBpm`. **This is exactly the data the waveform
needs** — no new analysis required.

UI: `Hud` owns the bottom-center `Controls` dock and the top-right `NowPlaying` chip, all
inside `#ui` (a fixed, full-viewport overlay that `IdleHider` fades when idle). The
`Renderer` calls `onFrame(features, hue)` once per frame, which `main.ts` routes to
`hud.update(features, hue)`.

Limitations this feature removes (for files): playback can't pause or seek (the
`AudioBufferSourceNode` is fire-and-forget), and there's no view of the track's structure.

## Architecture & data flow

### Transport (the core new capability)

A one-shot `AudioBufferSourceNode` can't pause or seek, so introduce a small **`Transport`**
that owns the file's playback position:

```ts
interface Transport {
  play(): void;
  pause(): void;
  seek(sec: number): void;       // clamped to [0, duration)
  position(): number;            // current AUDIBLE position in seconds (loop-wrapped)
  readonly duration: number;
  readonly isPlaying: boolean;
  stop(): void;                  // teardown
}
```

- `pause()` = stop the node + remember the offset; `play()` / `seek()` = start a fresh
  node from the offset (the decoded `AudioBuffer` is retained). Looping stays on.
- `position()` returns the **audible** position — it subtracts `ctx.outputLatency` once and
  wraps mod `duration` — so the main visuals, the playhead, and the audio all align. This
  is the single source of truth for "where are we."

The position bookkeeping (offset, started-at, playing, loop wrap) is extracted into a pure
**`PlayClock`** that takes an injected `now()` clock, so it's unit-testable without a real
`AudioContext`. `Transport` wires `PlayClock` to the actual node lifecycle.

`AnalyzedFeatureProvider` is **unchanged internally**; its `positionSec` callback simply
becomes `() => transport.position()` (replacing the inline `ctx.currentTime - startTime -
outputLatency`). Beats, drops, anticipation, and motion stay in sync through pauses/seeks
for free.

### Waveform data: precomputed, not a live analyser

The waveform reads the `AnalyzedTrack` band channels directly. This is the reason "4 bars
ahead" works — we know the future. (A real-time `AnalyserNode`, the alternative, can only
show the past, so it's rejected.) No new audio graph nodes are added for the waveform.

### Wiring (file-only, with fallback)

`AnalyzedFileSource` gains an `onReady(track, transport)` callback alongside the existing
`onProgress`. When analysis completes it fires `onReady(track, transport)`; on the
decode/analysis **fallback** path it fires `onReady(null)`. `InputManager` threads
`onReady` to `AnalyzedFileSource`. `main.ts` wires it to `hud.showWaveform(track,
transport)` / `hud.hideWaveform()`. Selecting mic/tab (or a fallback file) hides the panel
and behaves exactly as today.

```
pick file → analyze (Stage A) → onReady(track, transport)
  → hud.showWaveform(track, transport)   // panel appears, file-only
each frame: onFrame → hud.update → waveformPanel.frame()  // redraw at transport.position()
seek/play/pause (buttons or click-drag on canvas) → transport.*  → provider + waveform follow
switch to mic/tab, or analysis failed → onReady(null) → hud.hideWaveform()
```

## The waveform rendering

A dedicated `<canvas>` in the panel, redrawn each frame from the existing per-frame hook
(no extra `requestAnimationFrame`). Per frame:

- `pos = transport.position()`. `barSec = WAVEFORM.beatsPerBar * 60 / tempoBpm` when
  `tempoBpm > 0`, else `WAVEFORM.fallbackWindowSec / (barsBehind + barsAhead)`. Window =
  `[pos - barsBehind·barSec, pos + barsAhead·barSec]`; `windowSec = (barsBehind +
  barsAhead) · barSec`.
- For each canvas column x: `t = t0 + (x / width) · windowSec`. If `t < 0` or `t >
  duration`, leave blank (start/end of track). Else sample the track at `t` and draw a
  **vertical mirrored bar** centered on the canvas midline, height = `amp · heightScale`,
  filled with the blended color.
- **Blended color** (matches the chosen reference look): from the per-frame bands,
  `mids = lowMid + mid`; normalize `(bass, mids, high)` to shares; channel =
  `colorFloor + share · colorScale` → `rgb(R, G, B)` (red lows, green mids, blue highs;
  red+green reads orange/yellow where lows+mids coincide).
- Overlay a dim line on each **downbeat** whose time falls in the window, and a bright
  fixed **center playhead** at `x = width/2`.
- **Click/drag to seek:** pointer x → `t = t0 + (x/width)·windowSec`, clamped, →
  `transport.seek(t)`.

The pure parts live in `src/ui/waveform.ts`:
- `sampleColumn(track, t): { amp, r, g, b }` — interpolate channels + map color.
- `barSeconds(tempoBpm): number` and the window helper.
- `formatTime(sec): string` → `m:ss`.

The canvas drawing (`WaveformPanel.frame()`) is the only part not unit-tested; it's
covered by the final browser smoke test and guards to a no-op when the 2D context is
unavailable (jsdom).

## Transport UI

A control row in the panel:
- **Skip back** (−`seekStepBars` bar), **Play/Pause** (icon swaps via `Transport.isPlaying`),
  **Skip forward** (+`seekStepBars` bar) — Tabler-style inline SVG icons matching `Controls`.
- A `m:ss / m:ss` time readout (`position` / `duration`).
- An **eye toggle** that collapses/expands just the waveform canvas; the control row
  (including the toggle) stays visible so the waveform can always be brought back.

## Placement & layout

A full-width panel pinned to the bottom edge of `#ui`. While it's visible, the bottom-center
`Controls` dock shifts up so the two don't overlap (a class on `#ui` / body toggles the
dock's bottom offset). The panel is inside `#ui`, so `IdleHider` **fades it with the rest
of the HUD** when idle. The eye toggle (waveform show/hide) and the idle auto-hide are
independent.

## Components (files)

### New
- **`src/audio/PlayClock.ts`** — pure position tracker: `play/pause/seek`, `position(now)`,
  loop wrap. Injected `now()`. No Web Audio.
- **`src/audio/Transport.ts`** — wraps `PlayClock` + `AudioContext` + `AudioBuffer`:
  manages the `AudioBufferSourceNode` lifecycle, subtracts `outputLatency`, implements the
  `Transport` interface.
- **`src/ui/waveform.ts`** — pure helpers: `sampleColumn`, `barSeconds`, window math,
  `formatTime`, and the color mapping.
- **`src/ui/WaveformPanel.ts`** — the panel: owns the `<canvas>` + transport control row +
  eye toggle; `frame()` redraws from `transport.position()`; handles click/drag-to-seek;
  `setVisible()` / `destroy()`.

### Modified
- **`src/audio/sources/AnalyzedFileSource.ts`** — play through `Transport` instead of an
  inline node; `createProvider` reads `transport.position()`; add `onReady(track,
  transport)` (fired on success) and `onReady(null)` on the fallback path; `stop()` tears
  down the transport.
- **`src/audio/InputManager.ts`** — accept and thread an `onReady` callback to
  `AnalyzedFileSource`.
- **`src/ui/Hud.ts`** — own a `WaveformPanel`; add `showWaveform(track, transport)` /
  `hideWaveform()`; call `waveform.frame()` from `update()` each frame; toggle the dock-shift
  class.
- **`src/main.ts`** — wire `onReady` → `hud.showWaveform` / `hud.hideWaveform`.
- **`src/ui/hud.css`** — append waveform panel + transport row + dock-shift styles.
- **`src/config.ts`** — append a `WAVEFORM` block.

### Config (`WAVEFORM`)
```ts
export const WAVEFORM = {
  barsBehind: 4,
  barsAhead: 4,
  beatsPerBar: 4,
  fallbackWindowSec: 8,   // window length when tempo is unknown (tempoBpm === 0)
  heightScale: 0.9,       // fraction of half-canvas-height at full loudness
  ampFullScale: 0.3,      // loudness mapped to full bar height
  colorFloor: 60,         // min RGB channel so quiet slices aren't pure black
  colorScale: 195,        // channel = colorFloor + share * colorScale
  seekStepBars: 1,        // skip-back / skip-forward step, in bars
};
```

## Behavior details

- **File-only.** The panel exists only for an analyzed file. Mic/tab and the fallback path
  show nothing new and behave as today.
- **Sync.** `transport.position()` is the single clock for audio, main visuals, playhead,
  and waveform, so seeking/pausing keeps everything aligned.
- **Look-ahead.** The right half of the window shows the upcoming 4 bars from precomputed
  data; near the track's end it blanks past `duration` rather than wrapping mid-view.
- **Looping.** Playback still loops; `position()` wraps mod `duration`. The window blanks
  beyond `[0, duration]` rather than stitching across the loop seam.
- **Seek.** Buttons jump ±`seekStepBars` bars; click/drag on the canvas seeks to the
  pointed time. Seeking while paused updates the offset and the view without starting audio.
- **Toggle.** The eye button collapses/expands the waveform canvas; the transport row stays.
- **Auto-hide.** The whole panel fades with the HUD after idle (existing `IdleHider`).

## Error handling / edge cases

- **Fallback (decode/analysis failed):** `onReady(null)` → no panel; existing real-time
  looping playback only. No transport/seek (out of scope for the fallback path).
- **Unknown tempo (`tempoBpm === 0`):** use `fallbackWindowSec`; draw no downbeat lines
  (the `downbeats` array is empty), just the colored waveform + playhead.
- **Position past `duration` / before 0 in the window:** columns outside `[0, duration]`
  draw blank.
- **`outputLatency` undefined (older browsers):** treat as 0 inside `Transport`.
- **jsdom canvas:** `WaveformPanel.frame()` no-ops if `getContext('2d')` returns null, so
  unit tests of the panel's controls don't require canvas rendering.
- **Rapid seeking:** each seek stops the current node and starts a new one; guard double
  `stop()` (wrap in try/catch as the existing source does).

## Testing

- **`PlayClock`** (pure, injected `now()`): `play()` advances position with the clock;
  `pause()` freezes it; `seek()` jumps; resuming continues from the offset; position wraps
  mod `duration` (loop).
- **`waveform.ts`** (pure): `sampleColumn` — a bass-dominant frame → red dominant, mids →
  green, highs → blue; amplitude interpolates between frames and clamps at the ends.
  `barSeconds(120)` → 2.0; `barSeconds(0)`-style fallback handled by the window helper.
  `formatTime(72)` → `"1:12"`.
- **`WaveformPanel`** (vitest + jsdom): the eye toggle hides/shows the canvas; play/pause
  calls `transport.play()` then `transport.pause()` and swaps the icon; skip buttons call
  `transport.seek(pos ± barSec)`; a click at a known x calls `transport.seek` with the
  expected time (mock `Transport` exposing `position`/`duration`); `frame()` no-ops with a
  stubbed 2D context.
- **Browser smoke test (Playwright, as in Stage A):** load a file → the waveform scrolls
  with bar lines and a center playhead; play/pause; skip ±1 bar; click-to-seek; the eye
  toggle collapses/restores the waveform; mic/tab show no panel.

## Out of scope (YAGNI)

- Persisting the toggle (or any setting) across reloads.
- Zoom / pan of the waveform window.
- A waveform or transport for live capture or the fallback path.
- Beat-level marker density (downbeats only) and cue points.
- Any change to the main visualizer layers or to Stage A's analysis.
