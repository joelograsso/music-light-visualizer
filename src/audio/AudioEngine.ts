import { FFT_SIZE } from '../config';
import { FeatureExtractor } from './FeatureExtractor';
import type { AudioFeatures } from '../types';
import type { AudioSource } from './sources/AudioSource';

const SILENT: AudioFeatures = {
  loudness: 0, energy: 0, bands: { bass: 0, lowMid: 0, mid: 0, high: 0 },
  beat: 0, motionSpeed: 0.35, tempoBpm: null,
};

export class AudioEngine {
  private ctx?: AudioContext;
  private analyser?: AnalyserNode;
  private data?: Uint8Array<ArrayBuffer>;
  private extractor?: FeatureExtractor;
  private source?: AudioSource;
  private features: AudioFeatures = SILENT;
  private lastTime = 0;

  async use(source: AudioSource): Promise<void> {
    await this.teardown();
    this.ctx = new AudioContext();
    const node = await source.connect(this.ctx);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = 0.6;
    node.connect(this.analyser);
    this.data = new Uint8Array(this.analyser.frequencyBinCount);
    this.extractor = new FeatureExtractor(this.ctx.sampleRate, FFT_SIZE);
    this.source = source;
    this.lastTime = performance.now();
  }

  /** Pull the latest features; call once per render frame. */
  sample(): AudioFeatures {
    if (!this.analyser || !this.data || !this.extractor) return this.features;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.analyser.getByteFrequencyData(this.data);
    this.features = this.extractor.process(this.data, dt);
    return this.features;
  }

  async teardown(): Promise<void> {
    this.source?.stop();
    await this.ctx?.close();
    this.ctx = undefined; this.analyser = undefined; this.features = SILENT;
  }
}
