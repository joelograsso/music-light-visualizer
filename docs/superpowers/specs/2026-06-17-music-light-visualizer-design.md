# Music Light Visualizer — Design Spec

**Date:** 2026-06-17
**Status:** Approved (design), pending implementation plan

## Summary

A browser-based music visualizer that renders a reactive "mini light show" on a canvas. The screen starts blank in silence and grows a layered light show out of a single point at the center as music plays. Visual energy, motion speed, color, and density all react in real time to the live audio — calm and sparse when quiet, erupting on loud/bass-heavy moments.

The app reacts to a **live audio signal** analyzed in the browser (Web Audio API / FFT). A user-selectable input provides that signal: microphone, tab/system audio capture, or an uploaded audio file. Spotify integration provides **now-playing metadata only** (title, artist, album art, progress) as a cosmetic overlay — it does **not** and cannot drive the reactivity.

## Goals

- A single, cohesive, layered visual scene (not four separate modes) that progressively builds and recedes with the music.
- Real-time reactivity: loudness, frequency content (bass/mids/highs), beats, and tempo all influence the visuals.
- Motion speed tied to the music — slow/sparse when quiet, faster/denser as energy and tempo climb.
- Blank canvas in silence; the show is "born" from the center.
- Selectable audio input (mic / tab-or-system capture / file upload).
- Spotify "now playing" metadata overlay.
- Smooth 60fps rendering on a typical laptop.

## Non-Goals

- Driving reactivity from Spotify's API (not technically possible; their audio-analysis endpoints are deprecated for new apps and never provided a real-time stream).
- Capturing full macOS system output audio without a virtual audio device — documented as a known limitation; tab-audio capture works natively.
- Saving/recording video of the show (possible Phase 2, out of scope here).
- Mobile-first layout (desktop browser is the target; should not break on mobile but not optimized).

## Visual Concept (approved via interactive previews)

One layered scene built around a **central pulsing core**, with all other effects radiating from it. Layers fade in/out progressively based on a smoothed **energy** envelope, so quiet passages are minimal and only peak moments have everything active.

1. **Core** — the heartbeat. A pulsing circle born from a single point at screen center, growing outward as energy accumulates, **capped at a maximum radius** so it never becomes sparse. Rendered as a **solid ring** plus radial spectrum spikes whose **count scales with circumference** (stays uniform — no gaps as it grows). High energy adds **fast jitter** to the outer spike tips.
2. **Aurora Ribbons** — ambient outer aura of flowing waveform bands; opacity gated by overall loudness. Carries calmer/transient moments. (Fades in first, ~mid energy.)
3. **Particle Blooms** — bursts of glowing particles erupting from the core's edge on bass onsets/beats; count and speed scale with energy. (Gates in at higher energy.)
4. **Kaleidoscope Shards** — small mirrored rotating polygons that **crystallize out of in-flight blooms** near peak energy, drifting outward and fading. (Gates in only near the peak.)

Global **motion speed** is a single multiplier (derived from energy + detected tempo) applied across all layers. A **palette** controller drifts hue/color scheme over time and across song sections so different parts of a track feel visually distinct.

### Tuning constants (initial, adjustable)
- Core max radius cap: ~132px at the preview resolution; will be expressed relative to canvas size.
- Layer energy gates (smoothed 0–1 energy): ribbons ~0.30–0.45, blooms ~0.50–0.62, kaleidoscope ~0.74–0.86. Gates use smooth ramps, not hard cutoffs.
- Particle/shard counts capped for performance.

## Architecture

One-way data flow with a single decoupling interface:

```
Audio input → AudioEngine → FeatureExtractor → [AudioFeatures] → VisualEngine → Canvas
                                                      ↑
                          SpotifyClient → now-playing metadata → UI overlay (separate path)
```

**`AudioFeatures`** is the central boundary object, emitted every frame and consumed only by the visual engine:

```ts
interface AudioFeatures {
  loudness: number;      // 0..1 instantaneous, lightly smoothed
  energy: number;        // 0..1 slow smoothed envelope → drives staged layering
  bands: { bass: number; lowMid: number; mid: number; high: number }; // 0..1 each
  beat: number;          // 0..1 onset intensity this frame (decays quickly)
  motionSpeed: number;   // global motion multiplier from tempo + energy
  tempoBpm: number | null; // current tempo estimate (null until confident)
}
```

Because the visual engine depends only on `AudioFeatures`, the visuals can be driven by **synthetic** features for testing and demos (as the brainstorming previews already proved).

## Modules

Each module is small and single-purpose, in `src/`:

### Audio
- **`audio/AudioEngine.ts`** — owns `AudioContext` + `AnalyserNode` (FFT, e.g. size 2048). Connects whichever source is active. Exposes `getFrequencyData()` / `getTimeData()` per frame and sample rate.
- **`audio/sources/AudioSource.ts`** — interface: `connect(ctx): AudioNode`, `start()`, `stop()`, optional transport (file only), `label`.
- **`audio/sources/MicSource.ts`** — `getUserMedia({audio})` → `MediaStreamAudioSourceNode`.
- **`audio/sources/DisplaySource.ts`** — `getDisplayMedia({audio:true})` for tab/system audio capture.
- **`audio/sources/FileSource.ts`** — load + decode file, `MediaElementAudioSourceNode` or buffer source, with play/pause/seek.
- **`audio/InputManager.ts`** — selects/swaps the active source, handles permission requests and teardown.
- **`audio/FeatureExtractor.ts`** — **pure logic.** Converts FFT bins → bands, smoothed loudness/energy envelope, **spectral-flux onset/beat detection**, and a **running tempo estimate** → `motionSpeed`. Produces the `AudioFeatures` object. This is the primary unit-tested component.

### Visual
- **`visual/Renderer.ts`** — `requestAnimationFrame` loop, canvas sizing/DPR, additive glow blending (`globalCompositeOperation = 'lighter'`), trail fade. Calls each layer's `update`/`render`.
- **`visual/StageController.ts`** — maps `energy` → per-layer opacity gates (smooth ramps) and produces the global motion-speed multiplier. **Pure logic, unit-tested.**
- **`visual/Layer.ts`** — interface: `update(features: AudioFeatures, dt: number)`, `render(ctx, env)` where `env` carries motion speed, palette, canvas dims, gate opacity.
- **`visual/layers/CoreLayer.ts`** — uniform capped pulsing ring + circumference-scaled spectrum spikes + high-energy jitter.
- **`visual/layers/RibbonLayer.ts`** — aurora ribbons, loudness-gated.
- **`visual/layers/BloomLayer.ts`** — bass-onset particle bursts (uses ParticleSystem).
- **`visual/layers/KaleidoscopeLayer.ts`** — shards crystallized from blooms near peak energy.
- **`visual/ParticleSystem.ts`** — reusable particle pool (spawn, integrate, fade), shared by blooms/shards; count-capped.
- **`visual/Palette.ts`** — hue/color-scheme drift over time and across sections.

### Spotify
- **`spotify/SpotifyClient.ts`** — Authorization Code with **PKCE** (no backend server). Polls `GET /me/player/currently-playing`, exposes `{title, artist, albumArtUrl, progressMs, durationMs, isPlaying}`. Silent token refresh.
- Requires a free Spotify developer app **Client ID** (config value) and redirect URI. Scope: `user-read-currently-playing` / `user-read-playback-state`.

### UI
- **`ui/Controls.ts`** — source selector (mic/capture/file), start/stop, fullscreen, sensitivity sliders (e.g. gain/smoothing).
- **`ui/NowPlaying.ts`** — Spotify login button + metadata overlay (album art, title, artist, progress bar).
- **`main.ts`** — wires it all together.

### Shared
- **`types.ts`** — `AudioFeatures` and shared interfaces.
- **`config.ts`** — tuning constants, Spotify client ID / redirect URI.

## Data Flow (per frame)

1. `Renderer` rAF tick computes `dt`.
2. `AudioEngine` pulls FFT data from the active source.
3. `FeatureExtractor` produces `AudioFeatures` (bands, energy, beat, motionSpeed, tempo).
4. `StageController` derives layer gate opacities + global motion speed from `energy`.
5. Each active `Layer.update(features, dt)` then `render(ctx, env)`, composited with additive glow.
6. Separately/asynchronously, `SpotifyClient` polls now-playing (~every few seconds) and `NowPlaying` updates the overlay.

## Error Handling

- **Permission denied (mic/capture):** non-blocking message with retry / switch-source option; visuals stay on blank canvas.
- **No audio / silence:** intended state — calm blank canvas. Energy decays to 0, layers fade out, core shrinks to a point.
- **Spotify token expiry:** silent refresh via PKCE refresh token.
- **Spotify login/api failure:** overlay simply hides; visualizer unaffected.
- **macOS full-system audio:** documented limitation; UI hints that tab capture or mic works without extra setup, and mentions a virtual audio device (e.g. BlackHole) for full-system capture.

## Performance

- Single canvas, `globalCompositeOperation='lighter'` for glow, trail fade via translucent fill.
- Particle/shard pools with hard caps; counts scale with energy but never exceed caps.
- Target 60fps on a typical laptop; degrade gracefully by reducing particle caps if frame time rises (optional adaptive cap).

## Testing Strategy

- **Unit (TDD):** `FeatureExtractor` (bands, loudness/energy smoothing, onset detection, tempo) and `StageController` (gate ramps, motion-speed mapping) tested with synthetic FFT / energy inputs — deterministic and fast.
- **Onset/tempo:** verified against canned signals with known beats.
- **Visual layers:** verified in-browser against live and synthetic audio (the interactive review loop used during design).
- **Spotify:** auth flow tested manually; client logic (response parsing, refresh) unit-tested with mocked responses.

## Build & Run

- **Vite + TypeScript**, Canvas 2D, no heavy dependencies.
- `npm run dev` → local hot-reload server. `npm run build` → static files deployable to any static host.
- Spotify Client ID + redirect URI provided via config / env.

## Phased Delivery

1. **Phase 1 (core of this spec):** Vite/TS scaffold, AudioEngine + three sources + InputManager, FeatureExtractor, Renderer + StageController + four layers + ParticleSystem + Palette, basic UI controls. The full reactive light show.
2. **Phase 2:** Spotify PKCE now-playing overlay, sensitivity tuning UI, polish. *(Spotify chosen to be included from the start, so it follows immediately after the visual engine is working end-to-end.)*

## Known Limitations

- Spotify provides metadata only; reactivity always comes from captured audio.
- Full macOS system-audio capture needs a virtual audio device; tab capture and mic work natively.
- Desktop-browser focused.
