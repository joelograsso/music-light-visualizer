import { FFT_SIZE, ENERGY } from '../../config';
import type { AudioSource } from './AudioSource';
import type { FeatureProvider } from '../providers/FeatureProvider';
import { AnalyzedFeatureProvider } from '../providers/AnalyzedFeatureProvider';
import { LiveFeatureProvider } from '../providers/LiveFeatureProvider';
import { FileSource } from './FileSource';
import { mixToMono } from '../offline/mixToMono';
import { Transport } from '../Transport';
import type { AnalyzedTrack } from '../offline/types';

export type ProgressStage = 'decoding' | 'analyzing' | 'ready';
export type ProgressFn = (stage: ProgressStage, pct: number) => void;
/** Fired when an analyzed file is ready to play, or null when there's no analyzed track. */
export type ReadyFn = (track: AnalyzedTrack | null, transport: Transport | null) => void;

/**
 * The "analyzed track" mode for local files: decode the whole file, analyze it in a Web
 * Worker, then play it through a pausable/seekable Transport while exposing an
 * AnalyzedFeatureProvider that reads the precomputed timeline by playback position. When
 * ready it hands (track, transport) to the UI via onReady. If decode or analysis fails it
 * falls back to the real-time FileSource path and reports onReady(null, null).
 */
export class AnalyzedFileSource implements AudioSource {
  readonly label = 'Audio file';
  private track?: AnalyzedTrack;
  private transport?: Transport;
  private fallback?: FileSource;
  private fallbackNode?: AudioNode;

  constructor(
    private file: File,
    private onProgress?: ProgressFn,
    private onReady?: ReadyFn,
  ) {}

  async connect(ctx: AudioContext): Promise<AudioNode> {
    try {
      this.onProgress?.('decoding', 0);
      const arr = await this.file.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arr);
      const channels: Float32Array[] = [];
      for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
      const mono = mixToMono(channels, buffer.length);
      this.track = await this.analyze(mono, buffer.sampleRate);

      this.transport = new Transport(ctx, buffer);
      this.transport.play();
      this.onProgress?.('ready', 1);
      this.onReady?.(this.track, this.transport);
      return this.transport.output;
    } catch {
      // Unsupported codec or analysis failure -> degrade to the real-time path, no panel.
      this.fallback = new FileSource(this.file);
      this.fallbackNode = await this.fallback.connect(ctx);
      this.onProgress?.('ready', 1);
      this.onReady?.(null, null);
      return this.fallbackNode;
    }
  }

  createProvider(ctx: AudioContext): FeatureProvider {
    if (this.track && this.transport) {
      const transport = this.transport;
      return new AnalyzedFeatureProvider(this.track, () => transport.position());
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
      const copy = mono.slice();
      worker.postMessage({ channel: copy, sampleRate }, [copy.buffer]);
    });
  }

  stop(): void {
    this.transport?.stop();
    this.fallback?.stop();
  }
}
