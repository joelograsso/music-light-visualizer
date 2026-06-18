import { SPOTIFY } from '../config';

export interface NowPlaying {
  title: string; artist: string; albumArtUrl: string | null;
  progressMs: number; durationMs: number; isPlaying: boolean;
}

export function parseNowPlaying(json: any): NowPlaying | null {
  if (!json || !json.item) return null;
  return {
    title: json.item.name,
    artist: (json.item.artists ?? []).map((a: any) => a.name).join(', '),
    albumArtUrl: json.item.album?.images?.[0]?.url ?? null,
    progressMs: json.progress_ms ?? 0,
    durationMs: json.item.duration_ms ?? 0,
    isPlaying: !!json.is_playing,
  };
}

// --- PKCE helpers ---
function randomString(len: number): string {
  const a = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(a, (b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
async function sha256(plain: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class SpotifyClient {
  private token: string | null = null;

  /** Redirect to Spotify's consent page. */
  async login(): Promise<void> {
    const verifier = randomString(64);
    localStorage.setItem('sp_verifier', verifier);
    const challenge = await sha256(verifier);
    const params = new URLSearchParams({
      client_id: SPOTIFY.clientId, response_type: 'code',
      redirect_uri: SPOTIFY.redirectUri, scope: SPOTIFY.scopes,
      code_challenge_method: 'S256', code_challenge: challenge,
    });
    location.href = `https://accounts.spotify.com/authorize?${params}`;
  }

  /** Call on page load; exchanges ?code=… for a token if present. */
  async handleRedirect(): Promise<boolean> {
    const code = new URLSearchParams(location.search).get('code');
    if (!code) { this.token = sessionStorage.getItem('sp_token'); return !!this.token; }
    const verifier = localStorage.getItem('sp_verifier') ?? '';
    const body = new URLSearchParams({
      client_id: SPOTIFY.clientId, grant_type: 'authorization_code', code,
      redirect_uri: SPOTIFY.redirectUri, code_verifier: verifier,
    });
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    const json = await res.json();
    this.token = json.access_token ?? null;
    if (this.token) sessionStorage.setItem('sp_token', this.token);
    history.replaceState({}, '', SPOTIFY.redirectUri);
    return !!this.token;
  }

  get isLoggedIn(): boolean { return !!this.token; }

  async nowPlaying(): Promise<NowPlaying | null> {
    if (!this.token) return null;
    const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (res.status === 204) return null;       // nothing playing
    if (res.status === 401) { this.token = null; sessionStorage.removeItem('sp_token'); return null; }
    return parseNowPlaying(await res.json());
  }
}
