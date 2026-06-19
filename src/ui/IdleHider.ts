/**
 * Fades a target element (and the mouse cursor) out after a stretch of no user input,
 * and reveals them instantly on any activity — so the visualizer becomes a clean light
 * show when you stop touching it. Hiding is done with a `.ui-hidden` class (see hud.css).
 */
export class IdleHider {
  private timer = 0;
  private activePointers = new Set<number>();
  private readonly events = ['mousemove', 'keydown', 'touchstart', 'click', 'wheel', 'pointermove'] as const;
  private readonly onActivity = (): void => this.reveal();
  private readonly onPointerDown = (e: PointerEvent): void => {
    this.activePointers.add(e.pointerId);
    this.reveal();
  };
  private readonly onPointerEnd = (e: PointerEvent): void => {
    this.activePointers.delete(e.pointerId);
    this.reveal();
  };

  constructor(private target: HTMLElement, private idleMs = 3000) {}

  start(): void {
    for (const e of this.events) window.addEventListener(e, this.onActivity, { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    window.addEventListener('pointerup', this.onPointerEnd, { passive: true });
    window.addEventListener('pointercancel', this.onPointerEnd, { passive: true });
    this.reveal();
  }

  stop(): void {
    for (const e of this.events) window.removeEventListener(e, this.onActivity);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerEnd);
    window.removeEventListener('pointercancel', this.onPointerEnd);
    this.activePointers.clear();
    clearTimeout(this.timer);
  }

  private reveal(): void {
    this.target.classList.remove('ui-hidden');
    document.body.style.cursor = '';
    this.scheduleHide();
  }

  private scheduleHide(): void {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.hide(), this.idleMs);
  }

  private hide(): void {
    if (this.activePointers.size > 0) {
      this.scheduleHide();
      return;
    }
    this.target.classList.add('ui-hidden');
    document.body.style.cursor = 'none';
  }
}
