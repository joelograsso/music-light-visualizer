import type { NowPlaying as NP } from '../spotify/SpotifyClient';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Top-right neon chip: Spotify connect, then album art + title/artist + progress. */
export class NowPlaying {
  readonly el = document.createElement('div');

  constructor(private onLogin: () => void) {
    this.el.className = 'hud-np';
    this.showLogin();
  }

  showLogin(): void {
    this.el.innerHTML = `<button class="hud-np-login">Connect Spotify</button>`;
    this.el.querySelector('.hud-np-login')!.addEventListener('click', () => this.onLogin());
  }

  update(np: NP | null): void {
    if (!np) { this.el.innerHTML = `<span class="hud-np-empty">Spotify: nothing playing</span>`; return; }
    const pct = np.durationMs ? Math.round((np.progressMs / np.durationMs) * 100) : 0;
    this.el.innerHTML = `
      ${np.albumArtUrl ? `<img class="hud-np-art" src="${esc(np.albumArtUrl)}" width="44" height="44">` : ''}
      <div class="hud-np-meta">
        <div class="hud-np-title">${esc(np.title)}</div>
        <div class="hud-np-artist">${esc(np.artist)}</div>
        <div class="hud-np-progress"><div class="hud-np-fill" style="width:${pct}%"></div></div>
      </div>`;
  }
}
