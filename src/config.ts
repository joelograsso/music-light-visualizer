export const FFT_SIZE = 2048;

/** Frequency band edges in Hz: [bass, lowMid, mid, high] upper bounds. */
export const BAND_EDGES = { bassMax: 150, lowMidMax: 500, midMax: 2000, highMax: 8000 };

/** Smoothing factors per frame (0..1, higher = snappier). */
export const SMOOTHING = { loudness: 0.4, energy: 0.04 };

/**
 * Energy model — ABSOLUTE loudness, not normalized. The lights track how loud the
 * music actually is: a steady moderate beat reads mild, only genuinely loud/busy
 * sections read high. (A relative/auto-gain model made every song look loud because
 * the current level always became "the loudest thing".) Because absolute level
 * depends on playback volume, a user-facing `sensitivity` gain calibrates the scale.
 *  - `fullScale`: the (sensitivity-scaled) loudness mapped to full energy.
 *  - `dynamicsGamma` (>1): keeps moderate input low so the build has headroom.
 *  - `presence`: gentle intro ramp + silence gate (blank canvas when quiet).
 *  - `bandSmooth`: smooths the visualized bands so spikes ease instead of snapping.
 */
export const ENERGY = {
  silenceThreshold: 0.02,  // scaled RMS loudness below which we treat input as silence
  presenceRise: 0.01,      // per-frame ramp toward 1 while sound is present (gentle intro)
  presenceFall: 0.012,     // per-frame decay toward 0 during silence (core recedes)
  energySmooth: 0.04,      // tracks the energy target smoothly (no jitter)
  fullScale: 0.3,          // scaled RMS loudness that maps to full energy
  dynamicsGamma: 1.4,      // >1 keeps moderate loudness mild so only loud sections peak
  bandSmooth: 0.16,        // per-frame smoothing of visualized frequency bands (anti-jitter)
  defaultSensitivity: 1.0, // loudness gain; user-tunable to calibrate to their audio level
  minSensitivity: 0.4,
  maxSensitivity: 2.5,
};

/** Energy gate ranges for progressive layering (smoothed energy 0..1). */
export const GATES = {
  ribbons: [0.12, 0.25] as [number, number],
  blooms: [0.22, 0.38] as [number, number],
  kaleidoscope: [0.38, 0.58] as [number, number],
};

/** Core ring sizing, expressed as a fraction of min(canvasW, canvasH). */
export const CORE = { maxRadiusFrac: 0.28, growthFrac: 0.34 };

/** Particle caps for performance (raised so blooms/shards can fill the screen). */
export const CAPS = { blooms: 1300, shards: 360 };

/** Spotify — fill in your registered app's values. */
export const SPOTIFY = {
  clientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '',
  redirectUri: import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? 'http://localhost:5173',
  scopes: 'user-read-currently-playing user-read-playback-state',
};
