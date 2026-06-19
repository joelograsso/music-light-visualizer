import { DROP, OFFLINE } from '../../config';
import type { Drop } from './types';

function snapToDownbeat(downbeats: Float32Array, t: number, maxSec: number): number {
  let best = t, bestDist = maxSec;
  for (let i = 0; i < downbeats.length; i++) {
    const dist = Math.abs(downbeats[i] - t);
    if (dist < bestDist) { bestDist = dist; best = downbeats[i]; }
  }
  return best;
}

function medianInterval(times: Float32Array): number {
  if (times.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return 0;
  gaps.sort((a, b) => a - b);
  return gaps[gaps.length >> 1];
}

function maxRise(ch: Float32Array, start: number, end: number): number {
  const s = Math.max(0, start);
  const e = Math.min(ch.length, end);
  if (e <= s) return 0;
  let minSoFar = ch[s];
  let best = 0;
  for (let i = s + 1; i < e; i++) {
    const v = ch[i];
    const rise = v - minSoFar;
    if (rise > best) best = rise;
    if (v < minSoFar) minSoFar = v;
  }
  return best;
}

/**
 * Non-causal drop detection: scan an internal energy curve (unit sensitivity) plus the
 * bass channel for a sustained build followed by a sudden slam, snap each slam to the
 * nearest downbeat, and precompute an anticipation ramp rising into each drop. The build
 * check looks back at least one inferred bar so brief pre-drop cuts do not erase the rise.
 */
export function findDrops(
  energy: Float32Array,
  bass: Float32Array,
  downbeats: Float32Array,
  frameRate: number,
): { drops: Drop[]; anticipation: Float32Array } {
  const n = energy.length;
  const anticipation = new Float32Array(n);
  const drops: Drop[] = [];
  if (n === 0) return { drops, anticipation };

  const build = new Float32Array(n);
  for (let i = 0; i < n; i++) build[i] = (1 - DROP.bassWeight) * energy[i] + DROP.bassWeight * bass[i];

  const slamWin = Math.max(1, Math.round(OFFLINE.drops.slamSec * frameRate));
  const barSec = medianInterval(downbeats);
  const buildLookbackSec = Math.max(OFFLINE.drops.buildLookbackSec, OFFLINE.drops.anticipationLeadSec, barSec);
  const buildWin = Math.max(1, Math.round(buildLookbackSec * frameRate));
  const cooldownFrames = Math.round(DROP.cooldownSec * frameRate);
  let lastFrame = -Infinity;

  for (let i = slamWin; i < n; i++) {
    if (i - lastFrame < cooldownFrames) continue;
    if (energy[i] < DROP.highThreshold) continue;                 // must end up loud
    if (energy[i] - energy[i - slamWin] < OFFLINE.drops.slamJump) continue; // sudden jump
    const preEnd = i - slamWin;
    const preStart = Math.max(0, preEnd - buildWin);
    if (maxRise(build, preStart, preEnd) < OFFLINE.drops.buildRise) continue; // earned by a build

    let time = i / frameRate;
    time = snapToDownbeat(downbeats, time, OFFLINE.drops.snapMaxSec);
    const buildStart = Math.max(0, time - OFFLINE.drops.anticipationLeadSec);
    drops.push({ time, intensity: Math.min(1, energy[i]), buildStart });
    lastFrame = Math.round(time * frameRate);
  }

  for (const d of drops) {
    const s = Math.max(0, Math.round(d.buildStart * frameRate));
    const e = Math.min(n - 1, Math.round(d.time * frameRate));
    const span = Math.max(1, e - s);
    for (let f = s; f <= e; f++) {
      const r = (f - s) / span;
      if (r > anticipation[f]) anticipation[f] = r;
    }
  }

  return { drops, anticipation };
}
