import type { AudioSource } from './AudioSource';

export class MicSource implements AudioSource {
  readonly label = 'Microphone';
  private stream?: MediaStream;
  async connect(ctx: AudioContext): Promise<AudioNode> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return ctx.createMediaStreamSource(this.stream);
  }
  stop(): void { this.stream?.getTracks().forEach((t) => t.stop()); }
}
