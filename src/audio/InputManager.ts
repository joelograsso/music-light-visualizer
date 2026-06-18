import { AudioEngine } from './AudioEngine';
import { MicSource } from './sources/MicSource';
import { DisplaySource } from './sources/DisplaySource';
import { AnalyzedFileSource } from './sources/AnalyzedFileSource';
import type { ProgressFn, ReadyFn } from './sources/AnalyzedFileSource';

export type SourceKind = 'mic' | 'display' | 'file';

export class InputManager {
  constructor(
    private engine: AudioEngine,
    private onProgress?: ProgressFn,
    private onReady?: ReadyFn,
  ) {}

  async select(kind: SourceKind, file?: File): Promise<void> {
    this.onReady?.(null, null); // hide any existing waveform until the new source is ready
    switch (kind) {
      case 'mic': return this.engine.use(new MicSource());
      case 'display': return this.engine.use(new DisplaySource());
      case 'file':
        if (!file) throw new Error('No file provided');
        return this.engine.use(new AnalyzedFileSource(file, this.onProgress, this.onReady));
    }
  }
}
