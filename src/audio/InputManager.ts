import { AudioEngine } from './AudioEngine';
import { MicSource } from './sources/MicSource';
import { DisplaySource } from './sources/DisplaySource';
import { FileSource } from './sources/FileSource';

export type SourceKind = 'mic' | 'display' | 'file';

export class InputManager {
  constructor(private engine: AudioEngine) {}

  async select(kind: SourceKind, file?: File): Promise<void> {
    switch (kind) {
      case 'mic': return this.engine.use(new MicSource());
      case 'display': return this.engine.use(new DisplaySource());
      case 'file':
        if (!file) throw new Error('No file provided');
        return this.engine.use(new FileSource(file));
    }
  }
}
