/**
 * Zero-phase smoothing: a one-pole EMA applied forward then backward. Running the same
 * filter both directions cancels the phase lag, so the result is smooth WITHOUT shifting
 * features in time (the same trick as SciPy's filtfilt). `alpha` is the per-pass factor.
 */
export function smoothZeroPhase(x: Float32Array, alpha: number): Float32Array {
  const n = x.length;
  const out = new Float32Array(n);
  if (n === 0) return out;
  let acc = x[0];
  out[0] = acc;
  for (let i = 1; i < n; i++) { acc += (x[i] - acc) * alpha; out[i] = acc; }
  acc = out[n - 1];
  for (let i = n - 2; i >= 0; i--) { acc += (out[i] - acc) * alpha; out[i] = acc; }
  return out;
}
