# Graph Report - music-light-visualizer  (2026-06-19)

## Corpus Check
- 161 files · ~103,490 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 963 nodes · 1496 edges · 71 communities (52 shown, 19 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `255dfd36`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]

## God Nodes (most connected - your core abstractions)
1. `RenderEnv` - 26 edges
2. `AudioFeatures` - 25 edges
3. `WaveformPanel` - 23 edges
4. `Transport` - 22 edges
5. `Offline Audio Analysis — Stage A — Implementation Plan` - 22 edges
6. `compilerOptions` - 21 edges
7. `AnalyzedTrack` - 20 edges
8. `Music Light Visualizer Implementation Plan` - 20 edges
9. `Layer` - 17 edges
10. `Music Light Visualizer — Design Spec` - 14 edges

## Surprising Connections (you probably didn't know these)
- `sampleBands()` --calls--> `clamp01()`  [INFERRED]
  src/ui/waveform.ts → src/ui/meter.ts
- `waveformColumn` --calls--> `clamp01()`  [INFERRED]
  src/ui/waveform.ts → src/ui/meter.ts
- `FeatureExtractor` --references--> `FrequencyBands`  [EXTRACTED]
  src/audio/FeatureExtractor.ts → src/types.ts
- `LiveFeatureProvider` --references--> `FeatureExtractor`  [EXTRACTED]
  src/audio/providers/LiveFeatureProvider.ts → src/audio/FeatureExtractor.ts
- `HudCallbacks` --references--> `SourceKind`  [EXTRACTED]
  src/ui/Hud.ts → src/audio/InputManager.ts

## Import Cycles
- None detected.

## Communities (71 total, 19 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.23
Nodes (9): DropDetector, BAND_EDGES, CORE, DROP, ENERGY, SMOOTHING, TIER_COLORS, FrequencyBands (+1 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (15): AudioEngine, SILENT, InputManager, mixToMono(), FeatureProvider, LiveFeatureProvider, AnalyzedFileSource, ProgressFn (+7 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (34): analyzeTrack(), assembleTrack(), RawTrack, trackBeats(), findDownbeats(), findDrops(), maxRise(), medianInterval() (+26 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (39): analyzeWithFallback(), EssentiaFn, ProgressCb, PureFn, AnalyzedTrack, Section, WAVEFORM, bandPeaks (+31 more)

### Community 4 - "Community 4"
Cohesion: 0.15
Nodes (8): bandAvg(), binForFreq(), computeBands(), FeatureExtractor, OnsetDetector, OnsetResult, silent, ONSET

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (20): SourceKind, GATES, KALEIDO, SCENE_SWITCH, SCENES, AudioFeatures, LayerGates, Controls (+12 more)

### Community 6 - "Community 6"
Cohesion: 0.23
Nodes (7): clamp(), computeMotionSpeed(), SectionTier, AnalyzedFeatureProvider, beatAt(), dropAt(), interp()

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (30): 1. STFT front-end, 2. Per-frame continuous channels (length = frameCount), 3. Global tempo, 4. Beat grid (dynamic programming), 5. Downbeats, 6. Zero-phase smoothing, 7. Drops + anticipation, Analysis execution: Web Worker + progress (+22 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (23): For /graphify add and --watch, For /graphify query, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files, Part B - Semantic extraction (parallel subagents) (+15 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (23): For /graphify add and --watch, For /graphify query, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files, Part B - Semantic extraction (parallel subagents) (+15 more)

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (22): File Structure, Offline Audio Analysis — Stage A — Implementation Plan, Self-Review, Task 10: `drops.ts` — look-ahead drops + anticipation, Task 11: `analyzeTrack.ts` — pipeline orchestrator, Task 12: `FeatureProvider` interface + `AudioSource.createProvider?`, Task 13: `LiveFeatureProvider` + refactor `AudioEngine` to delegate, Task 14: `AnalyzedFeatureProvider` — timeline → AudioFeatures (+14 more)

### Community 12 - "Community 12"
Cohesion: 0.10
Nodes (20): File Structure, Music Light Visualizer Implementation Plan, Self-Review Notes, Task 10: CoreLayer (uniform capped pulsing ring), Task 11: RibbonLayer (aurora aura), Task 12: BloomLayer (bass-onset particle bursts), Task 13: KaleidoscopeLayer (shards from blooms), Task 14: AudioEngine + sources + InputManager (+12 more)

### Community 13 - "Community 13"
Cohesion: 0.10
Nodes (20): Architecture, Audio, Build & Run, Data Flow (per frame), Error Handling, Goals, Known Limitations, Modules (+12 more)

### Community 14 - "Community 14"
Cohesion: 0.10
Nodes (19): 03:24 | unknown, 03:33 | main, 04:29 | feature/visualizer-impl, 04:48-05:07 | feature/visualizer-impl, 05:30 | feature/visualizer-impl, 05:38-06:03 | feature/visualizer-impl→main, 06:14-06:32 | feature/drop-and-kaleidoscope, 06:41 | feature/scenes-starfield-lightning (+11 more)

### Community 15 - "Community 15"
Cohesion: 0.11
Nodes (18): Architecture & data flow, Background — current state (post Stage A), Behavior details, Components (files), Config (`WAVEFORM`), Error handling / edge cases, File Transport + Band-Colored Waveform — Design, Goal (+10 more)

### Community 16 - "Community 16"
Cohesion: 0.09
Nodes (22): dependencies, essentia.js, next, react, react-dom, devDependencies, jsdom, @types/node (+14 more)

### Community 17 - "Community 17"
Cohesion: 0.12
Nodes (16): Architecture & data flow, Background — current state, Behavior details, Components (files), Distribution, Error handling / edge cases, essentia.js Audio Analysis (tempo + beats + bands) — Design, Goal (+8 more)

### Community 18 - "Community 18"
Cohesion: 0.08
Nodes (23): compilerOptions, allowJs, allowSyntheticDefaultImports, esModuleInterop, incremental, isolatedModules, jsx, lib (+15 more)

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (14): Architecture & data flow, Background — current state, Behavior details, Config (`SEGMENT`), Data, Detection (offline, beat-synchronous self-similarity → novelty), Error handling / edge cases, Goal (+6 more)

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (13): Architecture & data flow, Background — current state, Behavior details, Chosen aesthetic — "Neon HUD" (mockup B), Components (files), Error handling / edge cases, Fullscreen + Neon HUD — Design, Goal (+5 more)

### Community 21 - "Community 21"
Cohesion: 0.14
Nodes (13): 1. Pure helpers (in `src/ui/waveform.ts`, unit-tested), 2. Config additions (`src/config.ts`), 3. `WaveformPanel` changes (`src/ui/WaveformPanel.ts`), 4. CSS (`src/ui/hud.css`), Background / Current State, Components / Units, Data Flow, Goal (+5 more)

### Community 22 - "Community 22"
Cohesion: 0.15
Nodes (12): File Structure, Fullscreen + Neon HUD Implementation Plan, Notes for the implementer, Task 1: `meterLevels()` pure mapping, Task 2: `IdleHider`, Task 3: `FullscreenController`, Task 4: Neon HUD styles + `Controls` rewrite (the dock), Task 5: `NowPlaying` restyle (+4 more)

### Community 23 - "Community 23"
Cohesion: 0.15
Nodes (12): File Structure, Self-Review, Structural Segmentation (Stage B) Implementation Plan, Task 1: Types, config, and neutral `AudioFeatures` defaults, Task 2: `segmentation.ts` — SSM / novelty / peaks / beat-sync (TDD), Task 3: `detectSections` (TDD), Task 4: `assembleTrack` computes sections from optional beat features, Task 5: `essentiaAnalyze` computes per-beat MFCC features (+4 more)

### Community 24 - "Community 24"
Cohesion: 0.17
Nodes (11): essentia.js Audio Analysis (tempo + beats + bands) Implementation Plan, File Structure, Self-Review, Task 1: Spike — essentia.js builds and runs in the worker, Task 2: `ESSENTIA` config block, Task 3: `assembleTrack` — shared pure assembly (TDD), Task 4: Refactor `analyzeTrack` to use `assembleTrack`, Task 5: `analyzeWithFallback` — pure dispatch (TDD) (+3 more)

### Community 25 - "Community 25"
Cohesion: 0.17
Nodes (11): File Structure, File Transport + Band-Colored Waveform Implementation Plan, Self-Review, Task 1: `WAVEFORM` config block, Task 2: `PlayClock` — pure playback clock, Task 3: `Transport` — node lifecycle over `PlayClock`, Task 4: Refactor `AnalyzedFileSource` to use `Transport` + `onReady`; wire `InputManager`, Task 5: `waveform.ts` — pure sampling/window/format helpers (+3 more)

### Community 26 - "Community 26"
Cohesion: 0.21
Nodes (3): FsDocument, FsElement, FullscreenController

### Community 27 - "Community 27"
Cohesion: 0.20
Nodes (9): File Structure, Self-Review, Task 1: `TIER_COLORS` config + pure helpers (TDD), Task 2: Play/pause pointer-events fix (CSS), Task 3: Jump-to-start / jump-to-end buttons (TDD), Task 4: Info cluster + `frame(features)` + Hud wiring (TDD), Task 5: Band color legend (TDD), Task 6: Final verification + browser smoke (+1 more)

### Community 29 - "Community 29"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 30 - "Community 30"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 31 - "Community 31"
Cohesion: 0.22
Nodes (8): Current state, Decisions locked in, Do this next, Goal, Handoff — Music Light Visualizer (resume: plan Stage A), How we work, Key files & pointers, Open questions / risks (resolve in Stage A design)

### Community 32 - "Community 32"
Cohesion: 0.22
Nodes (8): Current state, Decisions locked in (Stage B), Do this next, Goal, Handoff — Music Light Visualizer (resume: build Stage B structural segmentation), How we work, Key files & pointers, Open questions / risks

### Community 33 - "Community 33"
Cohesion: 0.25
Nodes (7): Bands — use MelBands (FrequencyBands is broken), essentia.js API — spike-confirmed facts (v0.1.3), Import + init (browser / Vite worker), Memory, Net, Per-frame spectral — WORKS (manual framing), Tempo + beats — WORKS WELL

### Community 34 - "Community 34"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 35 - "Community 35"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 36 - "Community 36"
Cohesion: 0.40
Nodes (4): 03:13 | feature/structural-segmentation, 03:23 | main, 03:26 | main, 03:48 | feature/transport-info-bar

### Community 37 - "Community 37"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 38 - "Community 38"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 39 - "Community 39"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 40 - "Community 40"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 41 - "Community 41"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 42 - "Community 42"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 57 - "Community 57"
Cohesion: 0.29
Nodes (5): autocorrelate(), estimateTempo(), TempoResult, globalTempo(), TEMPO

### Community 61 - "Community 61"
Cohesion: 0.16
Nodes (8): NowPlaying, parseNowPlaying(), randomString(), sha256(), SpotifyClient, SPOTIFY, esc(), NowPlaying

### Community 62 - "Community 62"
Cohesion: 0.05
Nodes (32): BloomLayer, ShardRequest, CoreLayer, ExplosionLayer, jaggedLine(), lerp(), polyArea(), Pt (+24 more)

### Community 66 - "Community 66"
Cohesion: 0.29
Nodes (6): Next.js Conversion Implementation Plan, Task 1: Define The Migration Contract, Task 2: Add The Next Shell, Task 3: Refactor Browser Bootstrap, Task 4: Replace Vite Tooling With Next.js, Task 5: Verify The Conversion

## Knowledge Gaps
- **399 isolated node(s):** `metadata`, `nextConfig`, `name`, `private`, `version` (+394 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AudioFeatures` connect `Community 5` to `Community 0`, `Community 1`, `Community 3`, `Community 4`, `Community 6`, `Community 62`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `Transport` connect `Community 8` to `Community 1`, `Community 3`, `Community 5`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `AnalyzedTrack` connect `Community 3` to `Community 1`, `Community 2`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `metadata`, `nextConfig`, `name` to the rest of the system?**
  _399 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.0784313725490196 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06394230769230769 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.05741626794258373 - nodes in this community are weakly interconnected._