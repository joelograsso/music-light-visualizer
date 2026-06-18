/**
 * Fades a target element (and the mouse cursor) out after a stretch of no user input,
 * and reveals them instantly on any activity — so the visualizer becomes a clean light
 * show when you stop touching it. Hiding is done with a `.ui-hidden` class (see hud.css).
 */
export class IdleHider {
  private timer = 0;
  private readonly events = ['mousemove', 'keydown', 'touchstart', 'click', 'wheel'] as const;
  private readonly onActivity = (): void => this.reveal();

  constructor(private target: HTMLElement, private idleMs = 3000) {}

  start(): void {
    for (const e of this.events) window.addEventListener(e, this.onActivity, { passive: true });
    this.reveal();
  }

  stop(): void {
    for (const e of this.events) window.removeEventListener(e, this.onActivity);
    clearTimeout(this.timer);
  }

  private reveal(): void {
    this.target.classList.remove('ui-hidden');
    document.body.style.cursor = '';
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.hide(), this.idleMs);
  }

  private hide(): void {
    this.target.classList.add('ui-hidden');
    document.body.style.cursor = 'none';
  }
}
