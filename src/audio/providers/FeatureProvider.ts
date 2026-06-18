import type { AudioFeatures } from '../../types';

/**
 * Produces the per-frame AudioFeatures the renderer consumes. Two implementations exist:
 * a live one reading an analyser (mic/tab) and an analyzed one reading a precomputed
 * timeline (local files).
 */
export interface FeatureProvider {
  sample(): AudioFeatures;
  /** Live providers honor the sensitivity slider; analyzed ones apply it to stored loudness. */
  setSensitivity?(value: number): void;
}
