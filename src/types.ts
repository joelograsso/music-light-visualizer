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
}

/** Per-layer gate opacities produced by StageController. */
export interface LayerGates {
  ribbons: number;       // 0..1
  blooms: number;        // 0..1
  kaleidoscope: number;  // 0..1
}
