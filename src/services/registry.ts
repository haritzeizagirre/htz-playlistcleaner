import type { IMusicService, MusicProvider, SessionMode } from './interfaces';
import { MockMusicService } from './mock/mockMusicService';
import { SpotifyAdapter } from './spotify/spotifyAdapter';
import { spotifyAuth } from './spotify/spotifyAuth';
import { YouTubeAdapter } from './youtube/youtubeAdapter';
import { youtubeAuth } from './youtube/youtubeAuth';

/**
 * Registro de servicios musicales por proveedor + modo de sesión.
 * 'live' usa las APIs reales; 'demo' usa datos de ejemplo locales.
 */
const registry = new Map<string, IMusicService>();

export function getMusicService(
  provider: MusicProvider,
  mode: SessionMode = 'demo'
): IMusicService {
  const key = `${provider}:${mode}`;
  let service = registry.get(key);
  if (!service) {
    if (mode === 'live' && provider === 'spotify') {
      service = new SpotifyAdapter(spotifyAuth);
    } else if (mode === 'live' && provider === 'youtube') {
      service = new YouTubeAdapter(youtubeAuth);
    } else {
      service = new MockMusicService(provider);
    }
    registry.set(key, service);
  }
  return service;
}
