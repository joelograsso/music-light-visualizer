/**
 * Infer downbeats assuming 4/4: for each candidate bar phase (0..3), sum the onset
 * energy on the beats it would mark as downbeats, and pick the phase with the most.
 * Returns the downbeat times (every `beatsPerBar`-th beat from the winning phase).
 */
export function findDownbeats(
  beats: Float32Array,
  onset: Float32Array,
  frameRate: number,
  beatsPerBar = 4,
): Float32Array {
  if (beats.length === 0) return new Float32Array(0);
  const strengthAt = (t: number): number => {
    const f = Math.round(t * frameRate);
    return f >= 0 && f < onset.length ? onset[f] : 0;
  };
  let bestPhase = 0, bestSum = -Infinity;
  for (let p = 0; p < beatsPerBar; p++) {
    let sum = 0;
    for (let b = p; b < beats.length; b += beatsPerBar) sum += strengthAt(beats[b]);
    if (sum > bestSum) { bestSum = sum; bestPhase = p; }
  }
  const down: number[] = [];
  for (let b = bestPhase; b < beats.length; b += beatsPerBar) down.push(beats[b]);
  return Float32Array.from(down);
}
