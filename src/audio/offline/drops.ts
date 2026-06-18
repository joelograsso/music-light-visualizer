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

/**
 * Non-causal drop detection: scan an internal energy curve (unit sensitivity) plus the
 * bass channel for a sustained build followed by a sudden slam, snap each slam to the
 * nearest downbeat, and precompute an anticipation ramp rising into each drop.
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
  const buildWin = Math.max(1, Math.round(OFFLINE.drops.buildLookbackSec * frameRate));
  const cooldownFrames = Math.round(DROP.cooldownSec * frameRate);
  let lastFrame = -Infinity;

  for (let i = slamWin; i < n; i++) {
    if (i - lastFrame < cooldownFrames) continue;
    if (energy[i] < DROP.highThreshold) continue;                 // must end up loud
    if (energy[i] - energy[i - slamWin] < OFFLINE.drops.slamJump) continue; // sudden jump
    const preEnd = i - slamWin;
    const preStart = Math.max(0, preEnd - buildWin);
    if (build[preEnd] - build[preStart] < OFFLINE.drops.buildRise) continue; // earned by a build

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
