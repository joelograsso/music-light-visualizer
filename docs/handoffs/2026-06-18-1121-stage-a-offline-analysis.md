# Handoff — Music Light Visualizer (resume: plan Stage A)

> Archived copy of the handoff written to `.remember/remember.md` on 2026-06-18 11:21.

## Goal
Browser music visualizer (Vite + TypeScript + Canvas 2D, Vitest). Next feature: **Stage A — offline look-ahead analysis of local audio files**, so the **File** source decodes the whole track, analyzes it *before* playback, and locks visuals to a precomputed timeline → exact + anticipatory sync and smoother motion.

## Do this next
Resume the **paused Stage A brainstorm**. The decomposition and mode are already agreed (below), so pick up at proposing Stage A architecture/approaches → design → `superpowers:writing-plans` → `superpowers:subagent-driven-development`. Full feature context lives in memory: read `offline-file-analysis-feature.md` (and `MEMORY.md`) in the memory dir. Use `superpowers:brainstorming` to re-enter cleanly if needed.

## Decisions locked in
- **Two stages.** Stage A (analysis engine + synced playback — timing + smoothness) NOW. **Stage B (structural segmentation: intro/verse/chorus/drop → scene/section-aware effects) is a FOLLOW-UP**, do after A.
- Only the **File** source becomes the "analyzed track" mode: decode → analyze → play locked to the timeline, **paused until analysis is ready**. Live capture (mic/tab) stays real-time and untouched (it already looks good).
- **Stage A scope:** decode whole buffer; onset envelope; global tempo; dynamic-programming beat + downbeat grid; drop timestamps; a dense **two-pass-smoothed** feature timeline; play locked to playback position; fire drops at exact precomputed times; **anticipate** build-ups (glow several bars before a known drop). The two-pass smoothing + continuous interpolation between known frames fixes the "stop-and-start" jitter the user dislikes.
- **No Spotify/YouTube audio ripping** (DRM + copyright/ToS — ruled out and declined). Engine is source-agnostic, fed by files the user legally owns.
- User priorities: #1 anticipatory timing (main pain — drops "lack" today), #2 structural awareness (Stage B), #3 cleaner per-moment data (falls out of A's offline pass).

## Current state
- Branch **`main`**, clean tree. Last commit `6df0005`. **67 tests pass**; `tsc` + `npm run build` clean.
- Recently merged: fullscreen + neon HUD (in `main`). Audio analysis rebuild also already in `main`.
- **Spotify now-playing works**: `.env.local` holds the client id (gitignored), redirect `http://127.0.0.1:5173`; Vite bound to `127.0.0.1` in `vite.config.ts`. Open the app at **http://127.0.0.1:5173** (NOT `localhost`).
- Dev server is running in the background on http://127.0.0.1:5173.

## Key files & pointers
- `src/audio/AudioEngine.ts` — `sample()` called once per render frame (real-time analyser read).
- `src/audio/FeatureExtractor.ts` — real-time DSP → `AudioFeatures`. Reuse the math offline where possible.
- `src/audio/{OnsetDetector,OnsetEnvelope,TempoEstimator,BeatTracker,DropDetector}.ts` — existing causal DSP (TempoEstimator exports `autocorrelate`/`estimateTempo`).
- `src/audio/sources/FileSource.ts` — currently plays an `<audio>` element (real-time only); this is what Stage A upgrades.
- `src/types.ts` (`AudioFeatures`), `src/config.ts` (tuning constants).
- `src/visual/Renderer.ts` — consumes `engine.sample()`; has `onFrame(features, hue)` hook for the HUD.
- Specs/plans precedent: `docs/superpowers/specs/` and `docs/superpowers/plans/`.
- Memory dir: `~/.claude/projects/-Users-joelograsso-dev-music-light-visualizer/memory/` → `offline-file-analysis-feature.md`, `MEMORY.md`, `user-prefers-absolute-loudness-reactivity.md`, `user-likes-maximalist-visualizer-aesthetic.md`.

## Open questions / risks (resolve in Stage A design)
- **Offline FFT:** project has zero runtime deps. Decide: small hand-rolled STFT/FFT vs. `OfflineAudioContext` + capture. Determinism/testability favors a manual STFT.
- **decodeAudioData** format coverage: mp3/wav/m4a/ogg fine; flac varies by browser.
- **Sync clock:** use `<audio>.currentTime` (+ small output-latency offset) as the master; look up the precomputed timeline by position each frame.
- Keep new units small/focused and unit-testable (pure DSP over synthetic signals).

## How we work
- Process per feature: `superpowers:brainstorming` → `superpowers:writing-plans` → `superpowers:subagent-driven-development` (fresh subagent per task + 2-stage spec/quality review) → `superpowers:finishing-a-development-branch`. New branch off `main` per feature.
- Commands: `npm test` (vitest), `npx tsc --noEmit`, `npm run build`. Commit messages end with the Claude co-author trailer.
- User: prefers ABSOLUTE loudness (not auto-gain); maximalist effects but SMOOTH/intentional motion (dislikes jitter); tests live at 127.0.0.1:5173. There's a `/handoff` skill (`~/.claude/skills/handoff/`) for future context handoffs.
