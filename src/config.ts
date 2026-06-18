export const FFT_SIZE = 2048;

/** Frequency band edges in Hz: [bass, lowMid, mid, high] upper bounds. */
export const BAND_EDGES = { bassMax: 150, lowMidMax: 500, midMax: 2000, highMax: 8000 };

/** Smoothing factors per frame (0..1, higher = snappier). */
export const SMOOTHING = { loudness: 0.4, energy: 0.04 };

/**
 * Energy model. Energy is normalized against the song's own recent loudness
 * peak (auto-gain) so loud moments of any song — however quietly mastered —
 * reach the top of the range. A "presence" envelope ramps up while sound plays
 * (the core is born small and grows) and provides a baseline floor that energy
 * won't drop below until the audio goes essentially silent.
 */
export const ENERGY = {
  silenceThreshold: 0.02, // mean normalized magnitude below which we treat input as silence
  presenceRise: 0.012,    // per-frame approach toward 1 while sound is present (~few-second ramp)
  presenceFall: 0.02,     // per-frame approach toward 0 during silence (core recedes)
  baseline: 0.4,          // energy floor once warmed up and sound is present
  energySmooth: 0.12,     // how quickly energy tracks its target (core breathing responsiveness)
  peakDecay: 0.9992,      // adaptive loudness peak slow decay per frame
  peakFloor: 0.05,        // minimum adaptive peak so faint noise can't normalize to full energy
};

/** Energy gate ranges for progressive layering (smoothed energy 0..1). */
export const GATES = {
  ribbons: [0.30, 0.45] as [number, number],
  blooms: [0.50, 0.62] as [number, number],
  kaleidoscope: [0.74, 0.86] as [number, number],
};

/** Core ring sizing, expressed as a fraction of min(canvasW, canvasH). */
export const CORE = { maxRadiusFrac: 0.28, growthFrac: 0.34 };

/** Particle caps for performance. */
export const CAPS = { blooms: 900, shards: 220 };

/** Spotify — fill in your registered app's values. */
export const SPOTIFY = {
  clientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '',
  redirectUri: import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? 'http://localhost:5173',
  scopes: 'user-read-currently-playing user-read-playback-state',
};
