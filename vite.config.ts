import { defineConfig } from 'vite';
// Bind the dev server to the IPv4 loopback (127.0.0.1) so it matches the Spotify
// redirect URI — Spotify rejects `localhost`, and macOS otherwise serves only on ::1.
export default defineConfig({ server: { host: '127.0.0.1', port: 5173, strictPort: true } });
