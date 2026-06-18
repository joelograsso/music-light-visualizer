import type { AudioSource } from './AudioSource';

export class FileSource implements AudioSource {
  readonly label = 'Audio file';
  readonly audio = new Audio();
  private objectUrl: string;
  constructor(file: File) {
    this.objectUrl = URL.createObjectURL(file);
    this.audio.src = this.objectUrl;
    this.audio.loop = true;
    this.audio.crossOrigin = 'anonymous';
  }
  async connect(ctx: AudioContext): Promise<AudioNode> {
    const node = ctx.createMediaElementSource(this.audio);
    node.connect(ctx.destination); // so the file is also audible
    await this.audio.play();
    return node;
  }
  stop(): void {
    this.audio.pause();
    URL.revokeObjectURL(this.objectUrl);
  }
}
