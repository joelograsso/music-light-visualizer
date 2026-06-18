import { analyzeTrack } from './analyzeTrack';
import { analyzeTrackEssentia } from './essentiaAnalyze';
import { analyzeWithFallback } from './analyzeWithFallback';

/**
 * Thin Web Worker entry. Tries the essentia.js analyzer; on any failure (WASM load/throw)
 * falls back to the pure-DSP analyzeTrack. Posts progress then the finished AnalyzedTrack.
 */
self.onmessage = async (e: MessageEvent) => {
  const { channel, sampleRate } = e.data as { channel: Float32Array; sampleRate: number };
  try {
    const track = await analyzeWithFallback(
      channel, sampleRate, analyzeTrackEssentia, analyzeTrack,
      (pct) => (self as unknown as Worker).postMessage({ type: 'progress', pct }),
    );
    (self as unknown as Worker).postMessage({ type: 'done', track });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
