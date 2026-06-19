import { describe, it, expect } from 'vitest';
import { Transport } from '../../src/audio/Transport';

function fakeCtx() {
  const created: any[] = [];
  return {
    currentTime: 0,
    outputLatency: 0,
    destination: {},
    createGain() { return { connect() {}, disconnect() {} }; },
    createBufferSource() {
      const n: any = {
        buffer: null, loop: false, started: -1, stopped: false, onended: null,
        connect() {}, disconnect() {},
        start(_when: number, off: number) { n.started = off ?? 0; },
        stop() { n.stopped = true; if (n.onended) n.onended(); },
        _end() { if (n.onended) n.onended(); }, // simulate the buffer reaching its end
      };
      created.push(n); return n;
    },
    _created: created,
  } as any;
}

describe('Transport', () => {
  it('plays, advances, pauses (freezing position), seeks, and resumes from a new node', () => {
    const ctx = fakeCtx();
    const tr = new Transport(ctx, { duration: 10 } as AudioBuffer);
    expect(tr.duration).toBe(10);
    expect(tr.isPlaying).toBe(false);

    tr.play();
    expect(tr.isPlaying).toBe(true);
    expect(ctx._created.length).toBe(1);
    expect(ctx._created[0].started).toBeCloseTo(0, 5);

    ctx.currentTime = 3;
    expect(tr.position()).toBeCloseTo(3, 5);

    tr.pause();
    expect(tr.isPlaying).toBe(false);
    expect(ctx._created[0].stopped).toBe(true);
    ctx.currentTime = 50;
    expect(tr.position()).toBeCloseTo(3, 5);

    tr.seek(8);
    expect(tr.position()).toBeCloseTo(8, 5);
    expect(ctx._created.length).toBe(1);

    tr.play();
    expect(ctx._created.length).toBe(2);
    expect(ctx._created[1].started).toBeCloseTo(8, 5);
  });

  it('does not loop: position clamps at the end instead of wrapping', () => {
    const ctx = fakeCtx();
    const tr = new Transport(ctx, { duration: 10 } as AudioBuffer);
    tr.play();
    expect(ctx._created[0].loop).toBe(false);
    ctx.currentTime = 25; // well past the end
    expect(tr.position()).toBeCloseTo(10, 5); // clamped to duration, NOT 5 (a wrap)
  });

  it('pauses at the end when the buffer finishes on its own', () => {
    const ctx = fakeCtx();
    const tr = new Transport(ctx, { duration: 10 } as AudioBuffer);
    tr.play();
    ctx.currentTime = 10;
    ctx._created[0]._end();             // buffer reached its end (loop is off)
    expect(tr.isPlaying).toBe(false);   // parked, not looping
    expect(tr.position()).toBeCloseTo(10, 2); // sitting at the end
  });

  it('restarts from the start when play is pressed at the end', () => {
    const ctx = fakeCtx();
    const tr = new Transport(ctx, { duration: 10 } as AudioBuffer);
    tr.play(); ctx.currentTime = 10; ctx._created[0]._end(); // finished, parked at end
    tr.play();                          // press play again
    expect(tr.isPlaying).toBe(true);
    expect(ctx._created[ctx._created.length - 1].started).toBeCloseTo(0, 5); // from the top
  });

  it('subtracts output latency from the audible position', () => {
    const ctx = fakeCtx();
    ctx.outputLatency = 0.5;
    const tr = new Transport(ctx, { duration: 10 } as AudioBuffer);
    tr.play();
    ctx.currentTime = 4;
    expect(tr.position()).toBeCloseTo(3.5, 5);
  });
});
