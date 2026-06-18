/** Average N channels into a single mono buffer of `length` samples. */
export function mixToMono(channels: Float32Array[], length: number): Float32Array {
  const out = new Float32Array(length);
  if (channels.length === 0) return out;
  for (const ch of channels) {
    const m = Math.min(length, ch.length);
    for (let i = 0; i < m; i++) out[i] += ch[i];
  }
  const inv = 1 / channels.length;
  for (let i = 0; i < length; i++) out[i] *= inv;
  return out;
}
