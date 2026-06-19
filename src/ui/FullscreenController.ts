type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

/**
 * Thin wrapper over the browser Fullscreen API with a webkit fallback. A rejected
 * request (e.g. not triggered by a user gesture) is swallowed so we just stay windowed.
 */
export class FullscreenController {
  constructor(private el: HTMLElement = document.documentElement) {}

  get isActive(): boolean {
    const d = document as FsDocument;
    return !!(document.fullscreenElement || d.webkitFullscreenElement);
  }

  toggle(): void {
    if (this.isActive) this.exit();
    else this.request();
  }

  onChange(cb: (active: boolean) => void): () => void {
    const handler = (): void => cb(this.isActive);
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
    };
  }

  private request(): void {
    const el = this.el as FsElement;
    const fn = el.requestFullscreen ?? el.webkitRequestFullscreen;
    if (!fn) return;
    Promise.resolve(fn.call(el)).catch(() => { /* blocked → stay windowed */ });
  }

  private exit(): void {
    const d = document as FsDocument;
    const fn = document.exitFullscreen ?? d.webkitExitFullscreen;
    if (!fn) return;
    Promise.resolve(fn.call(document)).catch(() => { /* ignore */ });
  }
}
