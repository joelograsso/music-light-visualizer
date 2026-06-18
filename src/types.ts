export interface FrequencyBands {
  bass: number;    // 0..1
  lowMid: number;  // 0..1
  mid: number;     // 0..1
  high: number;    // 0..1
}

export interface AudioFeatures {
  loudness: number;        // 0..1 instantaneous (lightly smoothed)
  energy: number;          // 0..1 slow-smoothed envelope; drives staged layering
  bands: FrequencyBands;
  beat: number;            // 0..1 onset intensity this frame (fast decay)
  motionSpeed: number;     // global motion multiplier (~0.35..1.6)
  tempoBpm: number | null; // running tempo estimate; null until confident
  presence: number;        // 0..1 "a song is playing" envelope; gates the core's baseline size
  drop: number;            // 0..1 explosion envelope; spikes on a detected drop, then decays
  beatPhase: number;       // 0..1 position within the beat (0 = on the beat), phase-locked
  beatConfidence: number;  // 0..1 how locked-in the beat tracker is
  anticipation: number;    // 0..1 build-up glow before a known drop (analyzed files only; 0 live)
  sectionActive: boolean;  // true when an analyzed track exposes sections (file only)
  sectionBoundary: number; // 1 on the frame the playhead crosses into a new section, else 0
  sectionIntensity: number; // 0..1 current section intensity; 1 (neutral) when no sections
}

/** Per-layer gate opacities produced by StageController. */
export interface LayerGates {
  ribbons: number;       // 0..1
  blooms: number;        // 0..1
  kaleidoscope: number;  // 0..1
}
