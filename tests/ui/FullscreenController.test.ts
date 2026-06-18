import { describe, it, expect, vi, afterEach } from 'vitest';
import { FullscreenController } from '../../src/ui/FullscreenController';

function setFsElement(el: Element | null): void {
  Object.defineProperty(document, 'fullscreenElement', { value: el, configurable: true });
}

afterEach(() => {
  setFsElement(null);
  delete (document as unknown as Record<string, unknown>).exitFullscreen;
});

describe('FullscreenController', () => {
  it('requests fullscreen when inactive', () => {
    const req = vi.fn(() => Promise.resolve());
    const el = document.createElement('div');
    (el as unknown as Record<string, unknown>).requestFullscreen = req;
    setFsElement(null);
    new FullscreenController(el).toggle();
    expect(req).toHaveBeenCalledTimes(1);
  });

  it('exits fullscreen when active', () => {
    const exit = vi.fn(() => Promise.resolve());
    (document as unknown as Record<string, unknown>).exitFullscreen = exit;
    setFsElement(document.body);
    new FullscreenController(document.createElement('div')).toggle();
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('reports state to onChange on fullscreenchange', () => {
    setFsElement(null);
    const fc = new FullscreenController();
    const cb = vi.fn();
    fc.onChange(cb);
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(cb).toHaveBeenCalledWith(false);
  });

  it('does not throw when the API is unavailable', () => {
    setFsElement(null);
    const el = document.createElement('div'); // no requestFullscreen
    expect(() => new FullscreenController(el).toggle()).not.toThrow();
  });
});
