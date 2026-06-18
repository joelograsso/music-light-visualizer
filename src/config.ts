export const FFT_SIZE = 2048;

/** Frequency band edges in Hz: [bass, lowMid, mid, high] upper bounds. */
export const BAND_EDGES = { bassMax: 150, lowMidMax: 500, midMax: 2000, highMax: 8000 };

/**
 * Onset detection: half-wave-rectified spectral flux weighted toward the low end
 * (kick/snare) — the part you feel as the beat — with an adaptive moving threshold
 * and a refractory gap so it picks clean beats instead of broadband noise.
 */
export const ONSET = {
  lowHz: 500,          // only consider flux up to here (kick + snare body)
  threshMargin: 1.6,   // onset when flux exceeds movingAvg * this ...
  threshFloor: 0.004,  // ... plus this floor (ignore tiny flux)
  refractorySec: 0.11, // min seconds between onsets
  histFrames: 43,      // moving-average window (~0.7s at 60fps)
};

/**
 * Tempo + beat tracking. The onset strength is resampled into a fixed-rate envelope;
 * tempo comes from autocorrelating that envelope (robust vs. inter-onset medians).
 */
export const TEMPO = {
  rateHz: 100,         // fixed sample rate of the onset envelope
  seconds: 6,          // history length for autocorrelation
  minBpm: 70,
  maxBpm: 180,
  smooth: 0.04,        // smoothing of the BPM estimate
};

/**
 * Phase-locked beat tracker (a PLL). A phase accumulator runs at the detected tempo
 * and is nudged toward incoming onsets so predicted beats line up with the music.
 * Lets effects fire ON the beat grid (predictively) rather than after each onset.
 */
export const BEAT = {
  pllGain: 0.12,         // how hard each onset nudges the phase toward it
  pulseDecayBeats: 0.4,  // beat pulse fades over this fraction of a beat
  confidenceSmooth: 0.03,// smoothing of beat confidence
  onsetMinStrength: 0.2, // ignore weak onsets for phase locking
};

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
  energyAttack: 0.09,      // energy rises at this rate (responds promptly to swells)
  energyRelease: 0.03,     // and falls at this slower rate (smooth musical decay)
  fullScale: 0.3,          // scaled RMS loudness that maps to full energy
  dynamicsGamma: 1.4,      // >1 keeps moderate loudness mild so only loud sections peak
  bandSmooth: 0.12,        // per-frame smoothing of visualized frequency bands (anti-jitter)
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
  fastSmooth: 0.28,   // fast energy envelope (snappy, so the slam is detected with low latency)
  slowSmooth: 0.02,   // slow energy envelope (responds in ~3s)
  highThreshold: 0.55,// fast energy must exceed this to count as a drop
  riseAbove: 0.23,    // ...and lead the slow envelope by at least this (a clear sudden jump)
  cooldownSec: 2.5,   // min seconds between drops
  decayPerSec: 1.7,   // explosion envelope decay (~0.6s tail)
  // Warmup: no drops in the first warmupSec after a song's sound begins. The slow
  // baseline lags while energy ramps up from silence, which otherwise looks like a drop
  // in a song's opening seconds. A sustained silence (gapSec) = a new song, re-warming.
  quietReset: 0.05,   // energy below this counts as silence
  gapSec: 1.2,        // sustained silence beyond this resets the warmup (new song)
  warmupSec: 10,      // suppress drops for this long after sound starts
  // Build-up requirement: a drop must be EARNED by a preceding build — a sustained rise
  // in a bass-weighted intensity signal. A "build charge" accumulates while that signal
  // leads its own slow reference, and the drop only fires on the slam's rising edge if
  // the charge is already high (so the build came BEFORE the slam, not as part of it).
  bassWeight: 0.6,        // build signal = 0.4*energy + 0.6*bass
  buildSmooth: 0.12,      // smoothing of the build signal
  buildSlopeMin: 0.04,    // per-second rise to count as "building" (a gentle ramp)
  buildSlopeMax: 0.9,     // ...but a faster rise is a sudden jump, not a build (excluded)
  buildChargeSec: 1.3,    // seconds of building to fully charge
  buildDecaySec: 0.8,     // charge decays over this while falling (during sound)
  buildRequired: 0.32,    // minimum build charge for a drop to fire (lower = drops fire more readily)
  // Beat-snapping: a detected drop's flash is nudged onto the predicted beat grid so it
  // lands on a beat. Fire immediately if just past a beat or the beat isn't confident;
  // otherwise defer to the upcoming beat (but never longer than quantizeMaxWait).
  quantizeMinConfidence: 0.4,
  quantizeNowPhase: 0.15, // if we're within this of a beat already, fire now; else wait for the next beat
  quantizeMaxWait: 0.6,   // ...but never defer longer than this (seconds)
};

/** Full-screen kaleidoscope mirror: faded in over this energy range. Segment count
 * is chosen by the active scene (see SCENES); this is the fallback default. */
export const KALEIDO = {
  segments: 8,
  gate: [0.68, 0.86] as [number, number],
};

/** Warp-speed starfield. Stars streak outward from center; speed scales with energy. */
export const STARFIELD = {
  count: 260,
  baseSpeed: 0.5,   // gentle drift when quiet (fraction of width per second-ish)
  energySpeed: 7,   // extra warp speed at full energy
};

/** Lightning arcs snapping out from the core on strong beats. */
export const LIGHTNING = {
  beatThreshold: 0.5, // onset strength needed to spawn a bolt
  minGap: 0.1,        // seconds between bolt volleys
  maxBolts: 4,        // at full energy
  decayPerSec: 5,     // bolts flash and fade fast (~0.2s)
};

/**
 * Scenes the show rotates through. Each defines a color family (hue) and the
 * kaleidoscope symmetry (segments). The SceneController switches scene on each drop
 * (and at least every maxSeconds), so the whole vibe changes as the set evolves.
 */
export const SCENES = [
  { hue: 205, segments: 8 },  // electric blue
  { hue: 280, segments: 6 },  // violet
  { hue: 330, segments: 12 }, // hot pink
  { hue: 30, segments: 8 },   // amber/fire
  { hue: 150, segments: 10 }, // teal/green
  { hue: 255, segments: 6 },  // indigo
];
export const SCENE_SWITCH = { minSeconds: 8, maxSeconds: 30 };

/** Spotify — fill in your registered app's values. */
export const SPOTIFY = {
  clientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '',
  redirectUri: import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? 'http://127.0.0.1:5173',
  scopes: 'user-read-currently-playing user-read-playback-state',
};

/**
 * Stage A — offline whole-track analysis (local files only). The file is decoded and
 * analyzed in a Web Worker before playback; visuals then read a precomputed timeline by
 * playback position. See docs/superpowers/specs/2026-06-18-offline-audio-analysis-stage-a-design.md
 */
export const OFFLINE = {
  hop: 512,            // STFT hop in samples (fftSize = FFT_SIZE = 2048) -> ~86 fps @ 44.1k
  minDb: -80,          // magnitude->level mapping floor (linear, /N-normalized FFT magnitude)
  maxDb: -20,          // ...and ceiling; each bin maps (db - minDb)/(maxDb - minDb), clamped 0..1
  smoothAlpha: 0.2,    // per-pass EMA factor for zero-phase smoothing (applied forward + backward)
  presenceFloor: 0.01, // raw loudness above this counts as "a song is playing"
  beatTightness: 100,  // DP beat tracker: penalty weight on deviating from the tempo period
  drops: {
    slamSec: 0.12,            // window over which a sudden energy jump (the slam) is measured
    slamJump: 0.18,           // energy must jump >= this across slamSec to be a slam
    buildLookbackSec: 1.3,    // the build is measured over this window before the slam
    buildRise: 0.12,          // bass-weighted build signal must rise >= this over the lookback
    snapMaxSec: 0.25,         // snap a drop to a downbeat only if one is within this
    anticipationLeadSec: 1.8, // glow ramps up over this long before each drop
  },
};

/**
 * File transport + band-colored waveform (local files only). A scrolling window shows the
 * track around the playhead, colored by band energy. See
 * docs/superpowers/specs/2026-06-18-file-transport-waveform-design.md
 */
export const WAVEFORM = {
  barsBehind: 4,
  barsAhead: 4,
  beatsPerBar: 4,
  fallbackWindowSec: 8,   // window length when tempo is unknown (tempoBpm === 0)
  heightScale: 0.9,       // waveform fills this fraction of the half-canvas height
  bandHeightScale: 0.6,   // a fully-present band reaches this fraction of the half-canvas (then bands stack)
  peakPercentile: 0.95,   // per-band normalization peak (robust vs lone transients) so quiet highs stay visible
  lowColor: '#e23b3b',    // lows (kick/bass) — red
  midColor: '#46c93a',    // mids (vocals/synths) — green
  highColor: '#3a8ee2',   // highs (hats/risers) — blue
  seekStepBars: 1,        // skip-back / skip-forward step, in bars
};
