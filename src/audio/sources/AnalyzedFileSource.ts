import { FFT_SIZE, ENERGY } from '../../config';
import type { AudioSource } from './AudioSource';
import type { FeatureProvider } from '../providers/FeatureProvider';
import { AnalyzedFeatureProvider } from '../providers/AnalyzedFeatureProvider';
import { LiveFeatureProvider } from '../providers/LiveFeatureProvider';
import { FileSource } from './FileSource';
import { mixToMono } from '../offline/mixToMono';
import type { AnalyzedTrack } from '../offline/types';

export type ProgressStage = 'decoding' | 'analyzing' | 'ready';
export type ProgressFn = (stage: ProgressStage, pct: number) => void;

/**
 * The "analyzed track" mode for local files: decode the whole file, analyze it in a Web
 * Worker, then play it back via an AudioBufferSourceNode while exposing an
 * AnalyzedFeatureProvider that reads the precomputed timeline by playback position. If
 * decode or analysis fails, it falls back to the real-time FileSource path.
 */
export class AnalyzedFileSource implements AudioSource {
  readonly label = 'Audio file';
  private track?: AnalyzedTrack;
  private node?: AudioBufferSourceNode;
  private startTime = 0;
  private fallback?: FileSource;
  private fallbackNode?: AudioNode;

  constructor(private file: File, private onProgress?: ProgressFn) {}

  async connect(ctx: AudioContext): Promise<AudioNode> {
    try {
      const arr = await this.file.arrayBuffer();
      this.onProgress?.('decoding', 0);
      const buffer = await ctx.decodeAudioData(arr);
      const channels: Float32Array[] = [];
      for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
      const mono = mixToMono(channels, buffer.length);
      this.track = await this.analyze(mono, buffer.sampleRate);

      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.loop = true;
      node.connect(ctx.destination);
      node.start();
      this.startTime = ctx.currentTime;
      this.node = node;
      this.onProgress?.('ready', 1);
      return node;
    } catch {
      // Unsupported codec or analysis failure -> degrade to the real-time path.
      this.fallback = new FileSource(this.file);
      this.fallbackNode = await this.fallback.connect(ctx);
      this.onProgress?.('ready', 1);
      return this.fallbackNode;
    }
  }

  createProvider(ctx: AudioContext): FeatureProvider {
    if (this.track && this.node) {
      return new AnalyzedFeatureProvider(
        this.track,
        () => ctx.currentTime - this.startTime - (ctx.outputLatency || 0),
      );
    }
    // Fallback: a live analyser tapping the real-time node.
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.6;
    this.fallbackNode!.connect(analyser);
    return new LiveFeatureProvider(analyser, ctx.sampleRate, FFT_SIZE, ENERGY.defaultSensitivity);
  }

  private analyze(mono: Float32Array, sampleRate: number): Promise<AnalyzedTrack> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../offline/worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent) => {
        const m = e.data;
        if (m.type === 'progress') this.onProgress?.('analyzing', m.pct);
        else if (m.type === 'done') { worker.terminate(); resolve(m.track as AnalyzedTrack); }
        else if (m.type === 'error') { worker.terminate(); reject(new Error(m.message)); }
      };
      worker.onerror = () => { worker.terminate(); reject(new Error('analysis worker failed')); };
      const copy = mono.slice(); // give the worker its own transferable buffer
      worker.postMessage({ channel: copy, sampleRate }, [copy.buffer]);
    });
  }

  stop(): void {
    if (this.node) {
      try { this.node.stop(); } catch { /* already stopped */ }
    }
    this.fallback?.stop();
  }
}
