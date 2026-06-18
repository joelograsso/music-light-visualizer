import { FFT_SIZE, ENERGY } from '../config';
import { FeatureExtractor } from './FeatureExtractor';
import type { AudioFeatures } from '../types';
import type { AudioSource } from './sources/AudioSource';

const SILENT: AudioFeatures = {
  loudness: 0, energy: 0, bands: { bass: 0, lowMid: 0, mid: 0, high: 0 },
  beat: 0, motionSpeed: 0.35, tempoBpm: null, presence: 0, drop: 0,
};

export class AudioEngine {
  private ctx?: AudioContext;
  private analyser?: AnalyserNode;
  private data?: Uint8Array<ArrayBuffer>;
  private timeData?: Uint8Array<ArrayBuffer>;
  private extractor?: FeatureExtractor;
  private source?: AudioSource;
  private features: AudioFeatures = SILENT;
  private lastTime = 0;
  private sensitivity = ENERGY.defaultSensitivity;

  /** Set the loudness sensitivity (gain). Persists across source switches. */
  setSensitivity(value: number): void {
    this.sensitivity = value;
    if (this.extractor) this.extractor.gain = value;
  }

  async use(source: AudioSource): Promise<void> {
    await this.teardown();
    const ctx = new AudioContext();
    let node: AudioNode;
    try {
      node = await source.connect(ctx);
    } catch (err) {
      source.stop();
      await ctx.close();
      throw err;
    }
    this.ctx = ctx;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = 0.6;
    node.connect(this.analyser);
    this.data = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeData = new Uint8Array(this.analyser.fftSize);
    this.extractor = new FeatureExtractor(this.ctx.sampleRate, FFT_SIZE);
    this.extractor.gain = this.sensitivity;
    this.source = source;
    this.lastTime = performance.now();
  }

  /** Pull the latest features; call once per render frame. */
  sample(): AudioFeatures {
    if (!this.analyser || !this.data || !this.timeData || !this.extractor) return this.features;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.analyser.getByteFrequencyData(this.data);
    this.analyser.getByteTimeDomainData(this.timeData);
    // RMS of the waveform (bytes centered at 128) = absolute loudness, 0..~1.
    let sumSq = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const v = (this.timeData[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / this.timeData.length);
    this.features = this.extractor.process(this.data, rms, dt);
    return this.features;
  }

  async teardown(): Promise<void> {
    this.source?.stop();
    await this.ctx?.close();
    this.ctx = undefined; this.analyser = undefined; this.features = SILENT;
    this.source = undefined; this.extractor = undefined; this.data = undefined; this.timeData = undefined;
  }
}
