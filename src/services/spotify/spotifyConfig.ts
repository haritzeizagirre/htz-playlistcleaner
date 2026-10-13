/**
 * Configuración de la integración con Spotify (cliente público con PKCE).
 *
 * - El Client ID NO es secreto, pero el Client Secret no se usa nunca aquí
 *   (flujo Authorization Code + PKCE).
 * - El Redirect URI debe coincidir EXACTAMENTE con el registrado en el
 *   dashboard de Spotify (Settings → Redirect URIs).
 */
export const SPOTIFY_CLIENT_ID = '812b98a8793d458595e8aef379773bcc';

/** Debe existir tal cual en el dashboard de Spotify. */
export const SPOTIFY_REDIRECT_URI = 'playlistcleaner://redirect';

export const SPOTIFY_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
  // Necesario para GET /me (nombre visible del perfil).
  'user-read-private',
] as const;

export const SPOTIFY_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

export const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
