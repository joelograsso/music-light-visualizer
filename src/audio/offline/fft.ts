/**
 * In-place iterative radix-2 Cooley–Tukey FFT. `re`/`im` must be the same length and a
 * power of two. After the call they hold the complex spectrum.
 */
export function fftInPlace(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = i + k + half;
        const bRe = re[b] * curRe - im[b] * curIm;
        const bIm = re[b] * curIm + im[b] * curRe;
        re[b] = re[a] - bRe; im[b] = im[a] - bIm;
        re[a] = re[a] + bRe; im[a] = im[a] + bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/**
 * Magnitude spectrum (length n/2) of a real signal of length n (a power of two), with
 * 1/N normalization so a full-amplitude sinusoid reads ~0.5 at its bin.
 */
export function magnitudeSpectrum(signal: Float32Array): Float32Array {
  const n = signal.length;
  const re = new Float32Array(n);
  re.set(signal);
  const im = new Float32Array(n);
  fftInPlace(re, im);
  const half = n >> 1;
  const mag = new Float32Array(half);
  for (let i = 0; i < half; i++) mag[i] = Math.hypot(re[i], im[i]) / n;
  return mag;
}
