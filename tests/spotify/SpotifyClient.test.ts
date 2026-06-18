import { describe, it, expect } from 'vitest';
import { parseNowPlaying } from '../../src/spotify/SpotifyClient';

describe('parseNowPlaying', () => {
  it('extracts track metadata', () => {
    const json = {
      is_playing: true, progress_ms: 1000,
      item: { name: 'Song', duration_ms: 200000,
        artists: [{ name: 'A' }, { name: 'B' }],
        album: { images: [{ url: 'big' }, { url: 'small' }] } },
    };
    const np = parseNowPlaying(json);
    expect(np).toEqual({ title: 'Song', artist: 'A, B', albumArtUrl: 'big',
      progressMs: 1000, durationMs: 200000, isPlaying: true });
  });
  it('returns null when nothing is playing', () => {
    expect(parseNowPlaying({})).toBeNull();
    expect(parseNowPlaying(null)).toBeNull();
  });
});
