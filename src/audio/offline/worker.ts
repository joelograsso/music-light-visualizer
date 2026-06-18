import { analyzeTrack } from './analyzeTrack';

/**
 * Thin Web Worker entry. Receives a mono channel + sampleRate, runs analyzeTrack, and
 * posts progress then the finished AnalyzedTrack (or an error). All real logic lives in
 * analyzeTrack so it stays unit-testable on the main thread.
 */
self.onmessage = (e: MessageEvent) => {
  const { channel, sampleRate } = e.data as { channel: Float32Array; sampleRate: number };
  try {
    const track = analyzeTrack(channel, sampleRate, (pct) =>
      (self as unknown as Worker).postMessage({ type: 'progress', pct }),
    );
    (self as unknown as Worker).postMessage({ type: 'done', track });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
