import './style.css';
import { AudioEngine } from './audio/AudioEngine';
import { InputManager } from './audio/InputManager';
import { Renderer } from './visual/Renderer';
import { CoreLayer } from './visual/layers/CoreLayer';
import { RibbonLayer } from './visual/layers/RibbonLayer';
import { BloomLayer } from './visual/layers/BloomLayer';
import { KaleidoscopeLayer } from './visual/layers/KaleidoscopeLayer';
import { Controls } from './ui/Controls';
import { SpotifyClient } from './spotify/SpotifyClient';
import { NowPlaying } from './ui/NowPlaying';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const engine = new AudioEngine();
const input = new InputManager(engine);

const blooms = new BloomLayer();
const layers = [new RibbonLayer(), new CoreLayer(), blooms, new KaleidoscopeLayer(blooms)];

const renderer = new Renderer(canvas, layers, () => engine.sample());
renderer.start();

const controls = new Controls((kind, file) => input.select(kind, file));
document.getElementById('ui')!.appendChild(controls.el);

const spotify = new SpotifyClient();
const nowPlaying = new NowPlaying(() => spotify.login());
document.getElementById('ui')!.appendChild(nowPlaying.el);

spotify.handleRedirect().then((loggedIn) => {
  if (!loggedIn) return;
  const poll = async () => { nowPlaying.update(await spotify.nowPlaying()); };
  poll();
  setInterval(poll, 4000);
});
