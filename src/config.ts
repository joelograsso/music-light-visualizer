export const FFT_SIZE = 2048;

/** Frequency band edges in Hz: [bass, lowMid, mid, high] upper bounds. */
export const BAND_EDGES = { bassMax: 150, lowMidMax: 500, midMax: 2000, highMax: 8000 };

/** Smoothing factors per frame (0..1, higher = snappier). */
export const SMOOTHING = { loudness: 0.4, energy: 0.04 };

/**
 * Energy model. Designed to feel like breathing, not twitching:
 *  - A SLOW auto-gain reference (`peak`) that rises/decays gradually, so a single
 *    transient (a keyboard tap, a click) can't set the gain and slam energy to max.
 *  - A `presence` envelope that needs SUSTAINED sound to ramp, so sparse noise stays low.
 *  - A slow `energySmooth` so the staged energy (which drives core size + layers) builds
 *    progressively over seconds and rejects momentary spikes — smooth, not jittery.
 *  - A reference `peakFloor` high enough that faint room noise can't normalize to full.
 * The core's per-beat "breathing" comes from the smoothed bass band in coreRadius(),
 * not from this slow envelope, keeping size changes smooth.
 */
export const ENERGY = {
  silenceThreshold: 0.035, // mean normalized magnitude below which we treat input as silence
  presenceRise: 0.01,      // per-frame ramp toward 1 while sound is sustained (~4-5s to full)
  presenceFall: 0.012,     // per-frame decay toward 0 during silence (core recedes gently)
  baseline: 0.25,          // energy floor once warmed up and sound is present
  energySmooth: 0.03,      // slow tracking of energy target -> progressive build, no jitter
  peakRise: 0.02,          // auto-gain reference rises slowly toward sustained loudness
  peakFall: 0.004,         // and decays even more slowly
  peakFloor: 0.18,         // reference floor so faint/transient noise can't normalize to full
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
