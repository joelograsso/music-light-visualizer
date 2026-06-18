export interface AudioSource {
  readonly label: string;
  /** Create and return the source node connected to the given context. */
  connect(ctx: AudioContext): Promise<AudioNode>;
  stop(): void;
}
