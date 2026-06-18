# Fullscreen + Neon HUD — Design

**Date:** 2026-06-18
**Status:** Approved (design); ready for implementation planning

## Goal

Turn the visualizer's dev-style overlay into a polished, immersive "light show" UI: a
real fullscreen mode, controls and cursor that auto-hide when idle, and a restyled
"Neon HUD" that tints itself to the active scene color and reacts to the music.

## Background — current state

The UI today is two inline-styled floating "pills" over the canvas:

- `src/ui/Controls.ts` — bottom-left dock: mic / tab-system / file buttons, a
  sensitivity slider, a status line. All styling is an inline `cssText` blob with emoji.
- `src/ui/NowPlaying.ts` — top-right Spotify card: connect button, then album art +
  title/artist + progress bar. Inline styles.
- `src/style.css` — 5 lines (reset + canvas/overlay sizing).
- `index.html` — `<canvas id="stage">` + `<div id="ui">` (the overlay container:
  `position:fixed; inset:0; pointer-events:none`, children re-enable pointer events).
- `src/main.ts` — wires `Controls` and `NowPlaying` into `#ui`; the `Renderer` runs the
  animation loop and samples `engine.sample()` each frame.

The `Renderer` owns the `Palette` and `SceneController`; `palette.baseHue` is the live,
eased scene hue, and `getFeatures()` yields the current `AudioFeatures` every frame.

## Chosen aesthetic — "Neon HUD" (mockup B)

- Dark translucent "glass" panels (`rgba(10,14,30,~0.66)` + subtle blur + 0.5px border).
- A thin accent line across the top of the dock.
- Glowing accent on the active source button; mono type for the HUD.
- A small 5-bar reactive level meter in the dock.
- The accent color follows the active scene (electric blue → violet → pink → amber →
  teal …) so the UI feels like part of the light show.

**Layout:** bottom-center **dock** (source selector + meter + sensitivity + fullscreen
button) and top-right **now-playing** chip. Matches mockup B.

## Architecture & data flow

Audio → visual → **UI** stays strictly one-directional. The `Renderer` gains ONE
optional hook so the UI can be fed live data without reaching into renderer internals:

```
new Renderer(canvas, layers, getFeatures, onFrame?)
  // each frame, after palette.update(dt, motionSpeed):
  onFrame?.(features, palette.baseHue)
```

`main.ts` passes `onFrame = (features, hue) => hud.update(features, hue)`.
`hud.update()`:

1. Sets a `--accent` CSS custom property on the `#ui` root: `hsl(hue, 90%, 62%)`.
   All HUD elements reference `--accent` in CSS, so the whole HUD re-tints for free.
2. Updates the reactive meter bar heights from `meterLevels(features)`.

`palette.baseHue` already eases between scenes, so the tint sweeps smoothly (no snapping).

## Components (files)

### New

- **`src/ui/hud.css`** — all Neon-HUD styling, keyed off `--accent` and a `--glass`
  custom property. Includes glass panels, top accent line, glow on active source,
  segmented source selector, the meter, the `.ui-hidden` fade state, and `cursor:none`
  handling. font: `ui-monospace, monospace` for the HUD.
- **`src/ui/FullscreenController.ts`** — thin wrapper over the Fullscreen API.
  - `toggle(): void` — request fullscreen on `document.documentElement` if not active,
    else exit. Uses standard API with `webkit*` fallback (Safari).
  - `get isActive(): boolean` — reflects `document.fullscreenElement` (+ webkit).
  - `onChange(cb: (active: boolean) => void)` — subscribe to `fullscreenchange`
    (+ `webkitfullscreenchange`) to sync button icon/state.
  - A rejected `requestFullscreen()` promise is caught and ignored (stay windowed).
- **`src/ui/IdleHider.ts`** — idle-timeout visibility manager.
  - Constructed with `(target: HTMLElement, idleMs = 3000)`.
  - Listens on `window` for `mousemove`, `keydown`, `touchstart`, `click`, `wheel`.
  - On activity: remove `.ui-hidden` from `target`, remove `cursor:none` from
    `document.body`, reset the timer.
  - After `idleMs` of no activity: add `.ui-hidden` to `target`, set
    `document.body.style.cursor = 'none'`.
  - `start()` / `stop()` to attach/detach listeners and clear the timer.
- **`src/ui/Hud.ts`** — small facade owning the two panels.
  - Constructs `Controls` and `NowPlaying`, appends both to `#ui`.
  - `update(features: AudioFeatures, hue: number)` — set `--accent` on the root, call
    `controls.setMeter(meterLevels(features))`.
  - Exposes `nowPlaying` so `main.ts` can push Spotify updates.
- **`src/ui/meter.ts`** — pure, DOM-free.
  - `meterLevels(f: AudioFeatures): number[]` — returns 5 normalized (0..1) bar heights
    derived from `bass, lowMid, mid, high` and `energy`. No randomness; deterministic so
    it's unit-testable.

### Rewritten / restyled

- **`src/ui/Controls.ts`** — the bottom-center dock, now class-based markup (no inline
  blob). Constructor signature gains a fullscreen callback:
  `new Controls(onSelect, onSensitivity, onToggleFullscreen)`.
  - Source selector: icon buttons (mic / tab-system / file) with active glow.
  - Sensitivity slider (unchanged range from `ENERGY.minSensitivity..maxSensitivity`).
  - 5-bar reactive meter element; `setMeter(levels: number[])` sets bar heights.
  - Fullscreen button; `setFullscreen(active: boolean)` swaps the maximize/minimize icon.
  - Status text retained (compact).
- **`src/ui/NowPlaying.ts`** — same API (`showLogin()`, `update(np)`), restyled to the
  neon chip with an accent-tinted border (via `--accent`).

### Modified

- **`src/visual/Renderer.ts`** — add optional `onFrame?: (f: AudioFeatures, hue: number)
  => void` constructor param; invoke it at the end of `frame()` after `palette.update`.
- **`src/main.ts`** — construct `Hud`, `FullscreenController`, `IdleHider`; wire
  `onFrame`; bind the `F` key to `fullscreen.toggle()`; connect the fullscreen button and
  `onChange` to `controls.setFullscreen`.
- **`index.html`** — link `hud.css` (or import it from `main.ts`).

## Behavior details

- **Fullscreen:** dock button and the `F` key both call `FullscreenController.toggle()`.
  `Esc` exits via the browser default. The button icon swaps maximize↔minimize on
  `fullscreenchange`. `requestFullscreen` must come from a user gesture — both a button
  click and a keydown qualify. A rejected/blocked request is caught and ignored.
- **Auto-hide:** always on (windowed AND fullscreen). After 3s idle, the `#ui` overlay
  fades to opacity 0 and the cursor hides. While hidden, the overlay also gets
  `pointer-events:none` so invisible buttons aren't clickable. Any mouse/key/touch/wheel
  input reveals everything instantly and restarts the timer.
- **Scene-tint:** `--accent = hsl(baseHue, 90%, 62%)`, updated each frame. Used by all
  HUD accents (borders, top line, active-source glow, meter bars, now-playing border).
- **Reactive meter:** 5 bars from `meterLevels(features)` — a live mini-spectrum so the
  HUD visibly breathes with the music.

## Error handling / edge cases

- Fullscreen API rejection (no user gesture, browser policy): caught, ignored.
- Safari/older prefixes: feature-detect `requestFullscreen` vs `webkitRequestFullscreen`
  and `fullscreenElement` vs `webkitFullscreenElement`.
- Idle-hide must not fight an in-progress slider drag: dragging emits `mousemove`, which
  counts as activity, so the UI stays visible while you adjust sensitivity.
- The native file picker is a brief OS modal; on return, the next mouse move reveals the
  UI. Acceptable.
- `IdleHider` clears its timer and removes listeners on `stop()` to avoid leaks.

## Testing

- **`IdleHider`** (vitest + jsdom, fake timers): hides after `idleMs`; an activity event
  reveals and resets; re-hides after another `idleMs`; `stop()` detaches.
- **`FullscreenController`** (mock the Fullscreen API jsdom lacks): `toggle()` calls
  `requestFullscreen` when inactive and `exitFullscreen` when active; `onChange` fires
  with the new state on a simulated `fullscreenchange`; a rejected request does not throw.
- **`meterLevels()`** (pure unit tests): silence → all bars ~0; loud full-spectrum →
  tall bars; each band maps to the expected bar(s); output length is 5 and clamped 0..1.
- **Browser (Playwright):** verify the neon look, scene-tint changing with scenes, the
  meter reacting, and the idle fade (controls + cursor) after 3s. Real fullscreen can't
  run headless — verified manually with the user.

## Out of scope (YAGNI)

- Presets / saving favorite looks.
- Persisting settings across reloads.
- A generic, reusable overlay/component framework.
- Any change to audio analysis or the visual layers themselves.
