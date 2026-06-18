# essentia.js API — spike-confirmed facts (v0.1.3)

Confirmed by running essentia.js 0.1.3 in Node (CJS umd builds) and a Vite build.

## Import + init (browser / Vite worker)
```ts
import Essentia from 'essentia.js/dist/essentia.js-core.es.js';
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js';
const essentia = new Essentia(EssentiaWASM);   // SYNCHRONOUS — EssentiaWASM is a ready module object, not a factory/promise
```
- The `.es` WASM build **inlines the WASM** (base64) into the JS, so Vite bundles it into the
  worker chunk (~2.5 MB) — self-contained, offline, no separate `.wasm` asset to serve.
- Vite config that worked: `optimizeDeps: { exclude: ['essentia.js'] }`, `worker: { format: 'es' }`.
- No usable TS types for the `dist/*.es.js` paths → use `// @ts-expect-error` on the imports and
  type the instance as `any` (or a small local `declare module`).
- essentia version string: `2.1-beta6-dev`.

## Tempo + beats — WORKS WELL
```ts
const sig = essentia.arrayToVector(channelFloat32);
const r = essentia.RhythmExtractor2013(sig, 208 /*maxTempo*/, 'multifeature', 40 /*minTempo*/);
// r = { bpm:number, ticks:VectorFloat (beat times s), confidence:number, estimates, bpmIntervals }
const beats = Float32Array.from(essentia.vectorToArray(r.ticks));
r.ticks.delete(); r.estimates.delete(); r.bpmIntervals.delete(); sig.delete();
```
Verified on a 120 BPM signal: bpm ~118-120, ticks at 0.49/1.0/1.49/2.0s (≈0.5s spacing). ✓
(`confidence` can be 0 on sparse synthetic signals; fine on real music.)

## Per-frame spectral — WORKS (manual framing)
- `FrameGenerator(float32, frameSize, hopSize).size()` returns ~¼ the expected frame count
  (quirky) → **frame manually**: slice `channel.subarray(i*hop, i*hop+FFT_SIZE)`, `arrayToVector`.
- Per frame: `Windowing(frameVec) -> {frame}` (default Hann), `Spectrum(win.frame) -> {spectrum}`
  (size = FFT_SIZE/2+1 = 1025), `RMS(frameVec) -> {rms}`. All work.
- **`FrequencyBands` THROWS** a C++ exception in 0.1.3 (both JS-array and VectorFloat edges). Do NOT use.

## Bands — use MelBands (FrequencyBands is broken)
```ts
const mb = essentia.MelBands(spec.spectrum);            // default 24 bands, energy scale
const bands = essentia.vectorToArray(mb.bands);         // length 24
mb.bands.delete();
```
Empirically confirmed mel-band index → our bucket mapping (default 24 bands, 0..22050 Hz):
- **bass** (20–150 Hz)  = band index 0
- **lowMid** (150–500)  = indices 1–2
- **mid** (500–2000)    = indices 3–8
- **high** (2000–8000)  = indices 9–17
(probe: 60Hz→0, 150Hz→0, 250Hz→1, 300Hz→2, 500Hz→3, 1000Hz→5, 2000Hz→9, 6000Hz→15, 8000Hz→17.)
Map each bucket = mean of its mel-band energies. MelBands energy scale: a strong band ~1e-2..1e-1,
quiet ~1e-6 and below → dB-map `10*log10(energy)` with range about [-60, -10] dB to 0..1
(tune `ESSENTIA.bandMinDb/bandMaxDb`); the waveform's per-band normalization sits on top.

## Memory
Every `arrayToVector` input and every algorithm output vector must be `.delete()`d. In the
per-frame loop, delete the frame vector + Windowing/Spectrum/MelBands outputs each iteration so
the WASM heap stays flat on long tracks.

## Net
essentia's decisive value is `RhythmExtractor2013` (tempo+beats). Bands via MelBands work and are
perceptually spaced; loudness via RMS; onset derived from band flux. Fallback to pure DSP on any
WASM error.
