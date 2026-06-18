import { FFT_SIZE, ENERGY } from '../config';
import type { AudioFeatures } from '../types';
import type { AudioSource } from './sources/AudioSource';
import type { FeatureProvider } from './providers/FeatureProvider';
import { LiveFeatureProvider } from './providers/LiveFeatureProvider';

const SILENT: AudioFeatures = {
  loudness: 0, energy: 0, bands: { bass: 0, lowMid: 0, mid: 0, high: 0 },
  beat: 0, motionSpeed: 0.35, tempoBpm: null, presence: 0, drop: 0,
  beatPhase: 0, beatConfidence: 0, anticipation: 0,
  sectionActive: false, sectionBoundary: 0, sectionIntensity: 1,
};

export class AudioEngine {
  private ctx?: AudioContext;
  private source?: AudioSource;
  private provider?: FeatureProvider;
  private sensitivity = ENERGY.defaultSensitivity;

  /** Set the loudness sensitivity (gain). Persists across source switches. */
  setSensitivity(value: number): void {
    this.sensitivity = value;
    this.provider?.setSensitivity?.(value);
  }

  async use(source: AudioSource): Promise<void> {
    await this.teardown();
    const ctx = new AudioContext();
    let provider: FeatureProvider;
    try {
      const node = await source.connect(ctx);
      if (source.createProvider) {
        provider = await source.createProvider(ctx);
      } else {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.6;
        node.connect(analyser);
        provider = new LiveFeatureProvider(analyser, ctx.sampleRate, FFT_SIZE, this.sensitivity);
      }
    } catch (err) {
      source.stop();
      await ctx.close();
      throw err;
    }
    this.ctx = ctx;
    this.source = source;
    this.provider = provider;
    this.provider.setSensitivity?.(this.sensitivity);
  }

  /** Pull the latest features; call once per render frame. */
  sample(): AudioFeatures {
    return this.provider ? this.provider.sample() : SILENT;
  }

  async teardown(): Promise<void> {
    this.source?.stop();
    await this.ctx?.close();
    this.ctx = undefined;
    this.source = undefined;
    this.provider = undefined;
  }
}
