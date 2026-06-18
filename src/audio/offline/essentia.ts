// @ts-expect-error - essentia.js ships JS es builds; types added separately if needed
import Essentia from 'essentia.js/dist/essentia.js-core.es.js';
// @ts-expect-error
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js';

let instance: any;
/** Lazily create the single Essentia instance for this worker. */
export function getEssentia(): any {
  if (!instance) instance = new Essentia(EssentiaWASM);
  return instance;
}
