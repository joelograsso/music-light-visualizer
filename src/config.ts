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
  ribbons: [0.05, 0.16] as [number, number],
  blooms: [0.22, 0.38] as [number, number],
  kaleidoscope: [0.38, 0.58] as [number, number],
};

/**
 * Core ring sizing, as a fraction of min(canvasW, canvasH).
 *  - minRadiusFrac: baseline size held while a song is playing (even quiet passages).
 *  - maxRadiusFrac: full size at peak energy (and the hard cap).
 * The actual radius interpolates min..max by energy, scaled by `presence` so the ring
 * closes to a point only in real silence (song start/end), not during the song.
 */
export const CORE = { minRadiusFrac: 0.1, maxRadiusFrac: 0.28 };

/** Particle caps for performance (raised so blooms/shards can fill the screen). */
export const CAPS = { blooms: 1300, shards: 360 };

/**
 * Drop detection. A "drop" is a SUDDEN energy jump (not a gradual build), found by
 * comparing a fast vs slow energy envelope: when the fast one leaps well above the
 * slow one past a high threshold, fire an explosion. Emits a 0..1 envelope that
 * spikes and decays, driving the screen flash / shockwave / burst.
 */
export const DROP = {
  fastSmooth: 0.15,   // fast energy envelope (responds in ~0.4s)
  slowSmooth: 0.02,   // slow energy envelope (responds in ~3s)
  highThreshold: 0.55,// fast energy must exceed this to count as a drop
  riseAbove: 0.18,    // ...and lead the slow envelope by at least this (the "sudden" test)
  cooldownSec: 1.8,   // min seconds between drops
  decayPerSec: 1.7,   // explosion envelope decay (~0.6s tail)
};

/** Full-screen kaleidoscope mirror: 8-fold symmetry, faded in over this energy range. */
export const KALEIDO = {
  segments: 8,
  gate: [0.68, 0.86] as [number, number],
};

/** Spotify — fill in your registered app's values. */
export const SPOTIFY = {
  clientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '',
  redirectUri: import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? 'http://localhost:5173',
  scopes: 'user-read-currently-playing user-read-playback-state',
};
