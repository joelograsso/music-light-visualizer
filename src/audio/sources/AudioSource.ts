import type { FeatureProvider } from '../providers/FeatureProvider';

export interface AudioSource {
  readonly label: string;
  /** Create and return the source node connected to the given context. */
  connect(ctx: AudioContext): Promise<AudioNode>;
  stop(): void;
  /**
   * Optional: sources that precompute their own features (analyzed files) supply a
   * provider here. Sources without it get a live analyser-based provider from the engine.
   */
  createProvider?(ctx: AudioContext): FeatureProvider | Promise<FeatureProvider>;
}
