export type SectionTier = 'calm' | 'building' | 'intense' | 'peak';

/** A detected structural segment (times in seconds). */
export interface Section {
  start: number;
  end: number;
  intensity: number;   // 0..1, relative loudness across the track
  tier: SectionTier;
}

/** A detected drop and the build that precedes it (times in seconds). */
export interface Drop {
  time: number;        // when the slam lands (downbeat-snapped)
  intensity: number;   // 0..1 peak strength
  buildStart: number;  // anticipation ramps from here up to `time`
}

/**
 * The precomputed result of analyzing one audio file. Continuous channels share a length
 * (`frameCount`) and are sampled at `frameRate` fps; event arrays hold times in seconds.
 */
export interface AnalyzedTrack {
  duration: number;          // seconds
  sampleRate: number;
  frameRate: number;         // continuous-channel frames per second (sampleRate / hop)
  tempoBpm: number;          // 0 if undetermined
  // continuous channels, length = frameCount
  loudness: Float32Array;    // absolute RMS, zero-phase smoothed
  presence: Float32Array;    // 0..1 "song playing" gate, zero-phase smoothed
  bass: Float32Array;
  lowMid: Float32Array;
  mid: Float32Array;
  high: Float32Array;
  onset: Float32Array;       // 0..1 onset envelope (raw, for reference/fallback)
  anticipation: Float32Array;// 0..1 build-up ramp into each drop
  // events
  beats: Float32Array;       // beat times (s)
  downbeats: Float32Array;   // downbeat times (s)
  drops: Drop[];
  sections: Section[];
}
