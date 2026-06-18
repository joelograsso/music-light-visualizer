import { describe, it, expect, beforeEach } from 'vitest';
import { AnalysisOverlay } from '../../src/ui/AnalysisOverlay';

describe('AnalysisOverlay', () => {
  let root: HTMLElement;
  beforeEach(() => { root = document.createElement('div'); document.body.appendChild(root); });

  it('shows analyzing progress as a percentage and bar width', () => {
    const o = new AnalysisOverlay(root);
    o.update('analyzing', 0.5);
    const el = root.querySelector('.analysis-overlay') as HTMLElement;
    expect(el.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.analysis-label')!.textContent).toContain('50');
    expect((root.querySelector('.analysis-bar') as HTMLElement).style.width).toBe('50%');
  });

  it('shows a decoding label', () => {
    const o = new AnalysisOverlay(root);
    o.update('decoding', 0);
    expect(root.querySelector('.analysis-label')!.textContent!.toLowerCase()).toContain('decod');
  });

  it('hides on ready', () => {
    const o = new AnalysisOverlay(root);
    o.update('analyzing', 0.4);
    o.update('ready', 1);
    expect((root.querySelector('.analysis-overlay') as HTMLElement).classList.contains('hidden')).toBe(true);
  });
});
