import { AudioEngine } from './audio/AudioEngine';
import { InputManager } from './audio/InputManager';
import { Renderer } from './visual/Renderer';
import { CoreLayer } from './visual/layers/CoreLayer';
import { RibbonLayer } from './visual/layers/RibbonLayer';
import { BloomLayer } from './visual/layers/BloomLayer';
import { KaleidoscopeLayer } from './visual/layers/KaleidoscopeLayer';
import { StarfieldLayer } from './visual/layers/StarfieldLayer';
import { LightningLayer } from './visual/layers/LightningLayer';
import { ExplosionLayer } from './visual/layers/ExplosionLayer';
import { Hud } from './ui/Hud';
import { FullscreenController } from './ui/FullscreenController';
import { IdleHider } from './ui/IdleHider';
import { AnalysisOverlay } from './ui/AnalysisOverlay';
import { SpotifyClient } from './spotify/SpotifyClient';

export type VisualizerCleanup = () => void;

export function mountVisualizer(canvas: HTMLCanvasElement, ui: HTMLElement): VisualizerCleanup {
  const engine = new AudioEngine();
  const analysisOverlay = new AnalysisOverlay(ui);
  let hud: Hud;
  let disposed = false;
  let spotifyPollId = 0;

  const input = new InputManager(
    engine,
    (stage, pct) => analysisOverlay.update(stage, pct),
    (track, transport) => {
      if (track && transport) hud.showWaveform(track, transport);
      else hud.hideWaveform();
    },
  );

  const blooms = new BloomLayer();
  const layers = [
    new StarfieldLayer(),
    new RibbonLayer(),
    new CoreLayer(),
    blooms,
    new KaleidoscopeLayer(blooms),
    new LightningLayer(),
    new ExplosionLayer(),
  ];

  const spotify = new SpotifyClient();
  const fullscreen = new FullscreenController();

  hud = new Hud(ui, {
    onSelect: (kind, file) => input.select(kind, file),
    onSensitivity: (sensitivity) => engine.setSensitivity(sensitivity),
    onToggleFullscreen: () => fullscreen.toggle(),
    onLogin: () => spotify.login(),
  });

  const cleanupFullscreen = fullscreen.onChange((active) => hud.controls.setFullscreen(active));
  const onKeydown = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === 'f' || e.key === 'F') fullscreen.toggle();
  };
  window.addEventListener('keydown', onKeydown);

  const renderer = new Renderer(
    canvas,
    layers,
    () => engine.sample(),
    (features, hue) => hud.update(features, hue),
  );
  renderer.start();

  const idle = new IdleHider(ui);
  idle.start();

  spotify.handleRedirect().then((loggedIn) => {
    if (disposed || !loggedIn) return;
    const poll = async (): Promise<void> => {
      try { hud.nowPlaying.update(await spotify.nowPlaying()); }
      catch { /* Spotify temporarily unavailable; chip stays as-is */ }
    };
    void poll();
    spotifyPollId = window.setInterval(poll, 4000);
  }).catch(() => { /* Spotify login/token exchange failed; visualizer unaffected */ });

  return () => {
    disposed = true;
    renderer.stop();
    idle.stop();
    cleanupFullscreen();
    window.removeEventListener('keydown', onKeydown);
    if (spotifyPollId) window.clearInterval(spotifyPollId);
    void engine.teardown();
  };
}
