# Handoff — Music Light Visualizer (resume: build Stage B structural segmentation)

## Goal
Browser music visualizer (Vite + TS + Canvas 2D, Vitest). The offline file-analysis arc is shipped; **next is Stage B — structural segmentation**: detect section boundaries + per-section intensity tiers and drive scene changes on real musical boundaries + a gentle section-intensity effect multiplier. Spec + plan are written and committed; **implementation has NOT started.**

## Do this next
Execute the **Stage B plan**: `docs/superpowers/plans/2026-06-18-structural-segmentation.md` (9 TDD tasks). Use `superpowers:subagent-driven-development` (the user's standing choice — but they paused at the execution-mode prompt, so confirm "subagent-driven or inline?" then go). Start at **Task 1** (section types + `SEGMENT` config + neutral `AudioFeatures` defaults). The plan has complete code/tests per task; give each task's full text to a fresh implementer subagent, then run spec + code-quality reviewer subagents, re-loop on issues, mark complete, continue. Final task = browser smoke verification (drive that yourself via Playwright, not a subagent).

## Decisions locked in (Stage B)
- **Boundaries + intensity tiers, NOT named sections** — auto-labeling intro/verse/chorus is unreliable; user chose boundaries + tiers (calm/building/intense/peak).
- **Detection = beat-synchronous MFCC → self-similarity matrix → checkerboard novelty → peak-pick** (proper MIR). Tiers from RELATIVE loudness per segment.
- `detectSections(beatFeatures, beats, loudness, frameRate)` is **pure + feature-agnostic** (unit-tested): essentia path feeds per-beat MFCC; pure-DSP fallback feeds per-beat bands → both produce sections. Lives inside the shared `assembleTrack` (optional `beatFeatures`).
- `AnalyzedTrack` gains `sections: Section[]`; `AudioFeatures` gains `sectionActive`/`sectionBoundary`/`sectionIntensity` (neutral on live: false/0/1).
- **Scenes change on section boundaries** (drops stop rotating the scene but still fire the explosion); live capture unchanged (drop+timer fallback). Gentle section-intensity multiplier on effect strength (floor 0.6) — preserves the user's absolute-loudness preference for per-frame intensity.
- **essentia MFCC confirmed** (Node probe): `essentia.MFCC(spectrum)` → `{bands, mfcc}`, 13 coeffs; **skip coeff 0** (energy), use 1..12; free both vectors per frame. No spike task needed.

## Current state
- **Branch `feature/structural-segmentation`** (off `main`), HEAD `4e9d439`. Only the Stage B **spec + plan are committed** (2 commits ahead of main). No Stage B source yet.
- **`main` (`00c4661`)** has the whole shipped arc: Stage A offline analysis + file transport/waveform + per-band-normalized stacked waveform + essentia.js engine (RhythmExtractor2013 + MelBands, pure-DSP fallback).
- **137 tests pass, `tsc` clean, `npm run build` succeeds** (worker chunk ~2.5 MB — essentia WASM inlined). Working tree clean except untracked `docs/handoffs/`.
- A dev server may be running in the background on **http://127.0.0.1:5173** (use 127.0.0.1, NOT localhost). Synthetic test audio for browser smoke: `/tmp/multiband.wav` (kick+stab+hat, 100 BPM) and `/tmp/smoke-track.wav`.

## Key files & pointers
- Stage B spec: `docs/superpowers/specs/2026-06-18-structural-segmentation-design.md`
- Stage B plan (execute this): `docs/superpowers/plans/2026-06-18-structural-segmentation.md`
- Offline analysis: `src/audio/offline/` — `analyzeTrack.ts` (pure), `essentiaAnalyze.ts` (WASM), `assembleTrack.ts` (shared assembly), `essentia.ts` (`getEssentia()`), `worker.ts`, `analyzeWithFallback.ts`, `types.ts` (`AnalyzedTrack`).
- essentia API gotchas (confirmed): `docs/superpowers/notes/essentia-api.md` (FrequencyBands broken→MelBands; FrameGenerator unreliable→manual framing; MFCC usage).
- Providers: `src/audio/providers/AnalyzedFeatureProvider.ts` (timeline→AudioFeatures), `FeatureProvider.ts`, `LiveFeatureProvider.ts`. `src/types.ts` = `AudioFeatures`. `src/config.ts` = tuning (OFFLINE, ENERGY, WAVEFORM, ESSENTIA; add `SEGMENT`).
- Visuals: `src/visual/SceneController.ts` (scene rotation — Stage B changes `update` signature to take features), `src/visual/Renderer.ts` (frame loop; add section-intensity multiplier), `src/visual/Palette.ts`.
- Memory dir `~/.claude/projects/-Users-joelograsso-dev-music-light-visualizer/memory/`: `offline-file-analysis-feature.md` (already updated: shipped + essentia + AGPL; Stage B pending), `MEMORY.md`, `user-prefers-absolute-loudness-reactivity.md`, `user-likes-maximalist-visualizer-aesthetic.md`.

## Open questions / risks
- Segmentation is the least-reliable piece by design — `SEGMENT.minSectionBars`/`peakThreshold`/`kernelBeats` are tunable; verify boundary count/positions on a real track in-browser (Task 9). Degrades gracefully (few/no boundaries → scenes lean on the maxSeconds fallback).
- `SceneController.update` signature changes from `(dt, drop)` to `(dt, features)` — update its existing test + the Renderer call site together (Task 8) to keep tsc/tests green.
- After Stage B: finish via `superpowers:finishing-a-development-branch` (user has chosen "merge to main now" before; confirm). No git remote exists yet — backup/open-source-home is a known future TODO.

## How we work
- Per feature: `superpowers:brainstorming` → `superpowers:writing-plans` → `superpowers:subagent-driven-development` (fresh implementer per task + spec-then-quality reviewer subagents, re-loop) → `superpowers:finishing-a-development-branch`. New branch off main per feature.
- TDD: test → see it fail → implement → pass → commit. Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Model picks: haiku for mechanical pure tasks, sonnet for integration/refactor + reviews.
- **CRITICAL git rule:** subagents must NEVER run `git checkout <sha>` or `git reset` (a prior subagent committed in detached HEAD and orphaned two commits — recovered, but put this warning in every implementer prompt). Only `git add`/`git commit` on the branch.
- Commands: `npm test`, `npx tsc --noEmit`, `npm run build`. Browser smoke: Playwright MCP — navigate 127.0.0.1:5173, patch `window.AudioContext` to capture instances, `setInputFiles` a /tmp WAV, read canvas pixels / worker console. The HUD idle-hides after 3s (remove `.ui-hidden` for screenshots).
- User: prefers ABSOLUTE loudness (not auto-gain) for main visuals; maximalist but SMOOTH/intentional motion; open-sourcing under AGPL (why essentia.js AGPL is OK). There's a `/handoff` skill for future handoffs.
