import { describe, it, expect } from 'vitest';
import { OnsetDetector } from '../../src/audio/OnsetDetector';

const SR = 44100;
const FFT = 2048;
const BINS = FFT / 2;

// bin width ~21.5 Hz; a "kick" lives in the lowest bins
function kickFrame(level: number): Uint8Array {
  const d = new Uint8Array(BINS);
  for (let i = 0; i < 6; i++) d[i] = level; // ~0..130 Hz
  return d;
}
function highFrame(level: number): Uint8Array {
  const d = new Uint8Array(BINS);
  for (let i = 300; i < 320; i++) d[i] = level; // ~6.5 kHz, above the onset band
  return d;
}
const silent = new Uint8Array(BINS);

describe('OnsetDetector', () => {
  it('fires an onset on a sudden low-band (kick) jump, not on a steady signal', () => {
    const od = new OnsetDetector(SR, FFT);
    for (let i = 0; i < 30; i++) od.process(silent, 0.016);
    const jump = od.process(kickFrame(220), 0.016);
    expect(jump.onset).toBe(true);
    let steady = jump;
    for (let i = 0; i < 8; i++) steady = od.process(kickFrame(220), 0.016);
    expect(steady.onset).toBe(false); // steady level -> no new onset
  });

  it('responds to low-band changes more than to high-band changes', () => {
    const low = new OnsetDetector(SR, FFT);
    for (let i = 0; i < 20; i++) low.process(silent, 0.016);
    const lowOdf = low.process(kickFrame(220), 0.016).odf;

    const high = new OnsetDetector(SR, FFT);
    for (let i = 0; i < 20; i++) high.process(silent, 0.016);
    const highOdf = high.process(highFrame(220), 0.016).odf;

    expect(lowOdf).toBeGreaterThan(highOdf);
  });

  it('respects the refractory gap (no double-trigger on consecutive frames)', () => {
    const od = new OnsetDetector(SR, FFT);
    for (let i = 0; i < 20; i++) od.process(silent, 0.016);
    let onsets = 0;
    // ramp up over a few frames then hold -> at most one onset in this short window
    for (let i = 0; i < 5; i++) if (od.process(kickFrame(120 + i * 30), 0.016).onset) onsets++;
    expect(onsets).toBeLessThanOrEqual(1);
  });
});
