import { GATES } from '../config';
import type { LayerGates } from '../types';

function gate(v: number, [lo, hi]: [number, number]): number {
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
}

export class StageController {
  gates(energy: number): LayerGates {
    return {
      ribbons: gate(energy, GATES.ribbons),
      blooms: gate(energy, GATES.blooms),
      kaleidoscope: gate(energy, GATES.kaleidoscope),
    };
  }
}
