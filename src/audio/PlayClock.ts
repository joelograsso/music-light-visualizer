/**
 * Pure playback-position tracker. `now` is an injected monotonic clock (seconds) so this
 * is unit-testable without a real AudioContext. Position loops (wraps mod duration).
 */
export class PlayClock {
  private offset = 0;     // position (s) captured at the last play/seek
  private startedAt = 0;  // now() when the current play began
  private playing = false;

  constructor(private duration: number, private loop = true) {}

  get isPlaying(): boolean { return this.playing; }

  play(now: number): void {
    if (this.playing) return;
    this.startedAt = now;
    this.playing = true;
  }

  pause(now: number): void {
    if (!this.playing) return;
    this.offset = this.raw(now);
    this.playing = false;
  }

  seek(sec: number, now: number): void {
    this.offset = this.clamp(sec);
    if (this.playing) this.startedAt = now;
  }

  position(now: number): number {
    return this.wrap(this.raw(now));
  }

  private raw(now: number): number {
    return this.playing ? this.offset + (now - this.startedAt) : this.offset;
  }

  private wrap(t: number): number {
    const d = this.duration;
    if (d <= 0) return 0;
    if (!this.loop) return Math.max(0, Math.min(d, t));
    return ((t % d) + d) % d;
  }

  private clamp(t: number): number {
    const d = this.duration;
    if (d <= 0) return 0;
    return Math.max(0, Math.min(d - 1e-3, t));
  }
}
