import type { AudioFeatures, LayerGates } from '../types';
import type { Palette } from './Palette';

export interface RenderEnv {
  ctx: CanvasRenderingContext2D;
  w: number; h: number; cx: number; cy: number;
  dt: number;
  features: AudioFeatures;
  gates: LayerGates;
  palette: Palette;
  t: number; // seconds since start
}

export interface Layer {
  update(env: RenderEnv): void;
  render(env: RenderEnv): void;
}
