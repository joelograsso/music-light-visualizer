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
        buffer: null, loop: false, started: -1, stopped: false,
        connect() {}, disconnect() {},
        start(_when: number, off: number) { n.started = off ?? 0; },
        stop() { n.stopped = true; },
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

  it('subtracts output latency from the audible position', () => {
    const ctx = fakeCtx();
    ctx.outputLatency = 0.5;
    const tr = new Transport(ctx, { duration: 10 } as AudioBuffer);
    tr.play();
    ctx.currentTime = 4;
    expect(tr.position()).toBeCloseTo(3.5, 5);
  });
});
