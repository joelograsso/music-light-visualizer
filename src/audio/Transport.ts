import { PlayClock } from './PlayClock';

/**
 * Pausable / seekable playback of a decoded AudioBuffer. An AudioBufferSourceNode is
 * one-shot, so pause = stop + remember offset, and play/seek = start a fresh node from the
 * offset. The track plays once (no looping): when the buffer finishes it parks at the end,
 * and pressing play from there restarts from the top. `position()` is the single source of
 * truth for "where we are": the clamped, output-latency-adjusted AUDIBLE position, read by
 * the visuals, playhead, and waveform.
 */
export class Transport {
  private clock: PlayClock;
  private node?: AudioBufferSourceNode;
  private out: GainNode;

  constructor(private ctx: AudioContext, private buffer: AudioBuffer) {
    this.clock = new PlayClock(buffer.duration, false); // play once; no looping
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
    return Math.max(0, Math.min(d, p)); // clamp into [0, duration] — no wrap
  }

  play(): void {
    if (this.clock.isPlaying) return;
    // Parked at the end? Restart from the top.
    if (this.clock.position(this.ctx.currentTime) >= this.buffer.duration - 0.01) {
      this.clock.seek(0, this.ctx.currentTime);
    }
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
    node.loop = false;
    node.connect(this.out);
    // Fires when the buffer ends naturally; our own stop() clears this.node first so a
    // stop-triggered 'ended' (pause/seek) is ignored — only a real end-of-track parks.
    node.onended = () => { if (node === this.node) this.handleEnded(); };
    node.start(0, Math.min(offset, this.buffer.duration));
    this.node = node;
  }

  private stopNode(): void {
    if (!this.node) return;
    const n = this.node;
    this.node = undefined; // clear first so the 'ended' from our own stop() is a no-op
    try { n.stop(); } catch { /* already stopped */ }
    n.disconnect();
  }

  /** The buffer reached its end on its own (loop is off): pause, parked at the end. */
  private handleEnded(): void {
    this.node = undefined;
    this.clock.pause(this.ctx.currentTime);
    this.clock.seek(this.buffer.duration, this.ctx.currentTime); // park at end (clamped)
  }
}
