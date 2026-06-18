import { FeatureExtractor } from '../FeatureExtractor';
import type { AudioFeatures } from '../../types';
import type { FeatureProvider } from './FeatureProvider';

/**
 * The real-time path, extracted verbatim from the old AudioEngine: read the analyser's
 * frequency + time data each frame, compute waveform RMS (absolute loudness), and run the
 * causal FeatureExtractor. Used for mic/tab and any source that doesn't analyze itself.
 */
export class LiveFeatureProvider implements FeatureProvider {
  private data: Uint8Array<ArrayBuffer>;
  private timeData: Uint8Array<ArrayBuffer>;
  private extractor: FeatureExtractor;
  private last = performance.now();

  constructor(private analyser: AnalyserNode, sampleRate: number, fftSize: number, sensitivity: number) {
    this.data = new Uint8Array(analyser.frequencyBinCount);
    this.timeData = new Uint8Array(analyser.fftSize);
    this.extractor = new FeatureExtractor(sampleRate, fftSize);
    this.extractor.gain = sensitivity;
  }

  setSensitivity(value: number): void {
    this.extractor.gain = value;
  }

  sample(): AudioFeatures {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.analyser.getByteFrequencyData(this.data);
    this.analyser.getByteTimeDomainData(this.timeData);
    let sumSq = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const v = (this.timeData[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / this.timeData.length);
    return this.extractor.process(this.data, rms, dt);
  }
}
