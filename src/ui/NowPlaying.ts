import type { NowPlaying as NP } from '../spotify/SpotifyClient';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export class NowPlaying {
  readonly el = document.createElement('div');
  constructor(private onLogin: () => void) {
    this.el.style.cssText =
      'position:fixed;right:16px;top:16px;display:flex;gap:10px;align-items:center;' +
      'background:rgba(10,12,22,.6);padding:10px 12px;border-radius:10px;font:13px ui-monospace,monospace;max-width:320px;';
    this.showLogin();
  }
  showLogin() {
    this.el.innerHTML = `<button id="sp">Connect Spotify</button>`;
    this.el.querySelector('#sp')!.addEventListener('click', () => this.onLogin());
  }
  update(np: NP | null) {
    if (!np) { this.el.innerHTML = `<span style="opacity:.6">Spotify: nothing playing</span>`; return; }
    const pct = np.durationMs ? Math.round((np.progressMs / np.durationMs) * 100) : 0;
    this.el.innerHTML = `
      ${np.albumArtUrl ? `<img src="${np.albumArtUrl}" width="44" height="44" style="border-radius:6px">` : ''}
      <div style="overflow:hidden">
        <div style="font-weight:600;white-space:nowrap;text-overflow:ellipsis;overflow:hidden">${esc(np.title)}</div>
        <div style="opacity:.7;white-space:nowrap;text-overflow:ellipsis;overflow:hidden">${esc(np.artist)}</div>
        <div style="height:3px;background:#ffffff22;border-radius:2px;margin-top:5px">
          <div style="height:100%;width:${pct}%;background:#1db954;border-radius:2px"></div>
        </div>
      </div>`;
  }
}
