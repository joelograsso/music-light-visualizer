import { PlayClock } from './PlayClock';

/**
 * Pausable / seekable playback of a decoded AudioBuffer. An AudioBufferSourceNode is
 * one-shot, so pause = stop + remember offset, and play/seek = start a fresh node from the
 * offset. `position()` is the single source of truth for "where we are": the loop-wrapped,
 * output-latency-adjusted AUDIBLE position, read by the visuals, playhead, and waveform.
 */
export class Transport {
  private clock: PlayClock;
  private node?: AudioBufferSourceNode;
  private out: GainNode;

  constructor(private ctx: AudioContext, private buffer: AudioBuffer) {
    this.clock = new PlayClock(buffer.duration, true);
    this.out = ctx.createGain();
    this.out.connect(ctx.destination);
  }

  get duration(): number { return this.buffer.duration; }
  get isPlaying(): boolean { return this.clock.isPlaying; }
  /** Stable output node (the engine ignores it for analyzed sources; routing lives here). */
  get output(): AudioNode { return this.out; }

  position(): number {
    const lat = this.ctx.outputLatency || 0;
    const d = this.buffer.duration;
    if (d <= 0) return 0;
    const p = this.clock.position(this.ctx.currentTime) - lat;
    return ((p % d) + d) % d;
  }

  play(): void {
    if (this.clock.isPlaying) return;
    this.clock.play(this.ctx.currentTime);
    this.startNode(this.clock.position(this.ctx.currentTime));
  }

  pause(): void {
    if (!this.clock.isPlaying) return;
    this.clock.pause(this.ctx.currentTime);
    this.stopNode();
  }

  seek(sec: number): void {
    this.clock.seek(sec, this.ctx.currentTime);
    if (this.clock.isPlaying) {
      this.stopNode();
      this.startNode(this.clock.position(this.ctx.currentTime));
    }
  }

  stop(): void { this.stopNode(); }

  private startNode(offset: number): void {
    const node = this.ctx.createBufferSource();
    node.buffer = this.buffer;
    node.loop = true;
    node.connect(this.out);
    node.start(0, offset % this.buffer.duration);
    this.node = node;
  }

  private stopNode(): void {
    if (!this.node) return;
    try { this.node.stop(); } catch { /* already stopped */ }
    this.node.disconnect();
    this.node = undefined;
  }
}
