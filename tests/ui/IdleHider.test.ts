import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IdleHider } from '../../src/ui/IdleHider';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; document.body.style.cursor = ''; });

function mount(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function pointerEvent(type: string, pointerId = 1): Event {
  const e = new Event(type);
  Object.defineProperty(e, 'pointerId', { value: pointerId });
  return e;
}

describe('IdleHider', () => {
  it('hides the target and cursor after the idle delay', () => {
    const el = mount();
    new IdleHider(el, 3000).start();
    expect(el.classList.contains('ui-hidden')).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(el.classList.contains('ui-hidden')).toBe(true);
    expect(document.body.style.cursor).toBe('none');
  });

  it('reveals on activity and restarts the timer', () => {
    const el = mount();
    new IdleHider(el, 3000).start();
    vi.advanceTimersByTime(3000);
    expect(el.classList.contains('ui-hidden')).toBe(true);

    window.dispatchEvent(new Event('mousemove'));
    expect(el.classList.contains('ui-hidden')).toBe(false);
    expect(document.body.style.cursor).toBe('');

    vi.advanceTimersByTime(2999);
    expect(el.classList.contains('ui-hidden')).toBe(false); // not yet
    vi.advanceTimersByTime(1);
    expect(el.classList.contains('ui-hidden')).toBe(true);   // re-hidden
  });

  it('stops listening and clears the timer after stop()', () => {
    const el = mount();
    const hider = new IdleHider(el, 3000);
    hider.start();
    hider.stop();
    vi.advanceTimersByTime(5000);
    expect(el.classList.contains('ui-hidden')).toBe(false); // timer was cleared
    window.dispatchEvent(new Event('mousemove'));            // no-op, no throw
    expect(el.classList.contains('ui-hidden')).toBe(false);
  });

  it('does not hide while a pointer drag is active', () => {
    const el = mount();
    new IdleHider(el, 3000).start();

    window.dispatchEvent(pointerEvent('pointerdown'));
    vi.advanceTimersByTime(6000);
    expect(el.classList.contains('ui-hidden')).toBe(false);

    window.dispatchEvent(pointerEvent('pointerup'));
    vi.advanceTimersByTime(2999);
    expect(el.classList.contains('ui-hidden')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(el.classList.contains('ui-hidden')).toBe(true);
  });
});
