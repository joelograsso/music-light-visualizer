import type { AudioSource } from './AudioSource';

export class DisplaySource implements AudioSource {
  readonly label = 'Tab / System audio';
  private stream?: MediaStream;
  async connect(ctx: AudioContext): Promise<AudioNode> {
    // Must request video too; many browsers won't share audio-only.
    this.stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const tracks = this.stream.getAudioTracks();
    if (tracks.length === 0) throw new Error('No audio track shared. Tick "Share tab audio".');
    return ctx.createMediaStreamSource(this.stream);
  }
  stop(): void { this.stream?.getTracks().forEach((t) => t.stop()); }
}
