import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

import { STORAGE_KEYS } from '@/utils/constants';
import {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_DISCOVERY,
  SPOTIFY_REDIRECT_URI,
  SPOTIFY_SCOPES,
} from './spotifyConfig';

// Cierra el popup del navegador al volver de Spotify.
WebBrowser.maybeCompleteAuthSession();

export interface SpotifySession {
  displayName: string | null;
}

interface StoredSpotifyTokens {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch en milisegundos. */
  expiresAt: number;
  displayName: string | null;
}

const EXPIRY_MARGIN_MS = 60_000;

async function saveTokens(tokens: StoredSpotifyTokens): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEYS.authTokens, JSON.stringify(tokens));
}

async function loadTokens(): Promise<StoredSpotifyTokens | null> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEYS.authTokens);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSpotifyTokens;
  } catch {
    return null;
  }
}

async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEYS.authTokens);
}

function toStoredTokens(
  response: AuthSession.TokenResponse,
  displayName: string | null,
  previousRefreshToken: string | null = null
): StoredSpotifyTokens {
  const issuedAt = response.issuedAt ?? Math.floor(Date.now() / 1000);
  const expiresIn = response.expiresIn ?? 3600;
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken ?? previousRefreshToken,
    expiresAt: (issuedAt + expiresIn) * 1000,
    displayName,
  };
}

async function fetchDisplayName(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const profile = (await response.json()) as { display_name?: string | null };
    return profile.display_name ?? null;
  } catch {
    return null;
  }
}

/**
 * Devuelve un access token válido, refrescándolo con el refresh token si
 * está a punto de caducar (o si se fuerza tras un 401).
 */
async function getAccessToken(options: { forceRefresh?: boolean } = {}): Promise<string> {
  const tokens = await loadTokens();
  if (!tokens) {
    throw new Error('No hay sesión de Spotify. Vuelve a iniciar sesión.');
  }

  const isFresh = Date.now() < tokens.expiresAt - EXPIRY_MARGIN_MS;
  if (isFresh && !options.forceRefresh) {
    return tokens.accessToken;
  }

  if (!tokens.refreshToken) {
    await clearTokens();
    throw new Error('La sesión de Spotify ha caducado. Vuelve a iniciar sesión.');
  }

  try {
    const refreshed = await AuthSession.refreshAsync(
      { clientId: SPOTIFY_CLIENT_ID, refreshToken: tokens.refreshToken },
      SPOTIFY_DISCOVERY
    );
    await saveTokens(toStoredTokens(refreshed, tokens.displayName, tokens.refreshToken));
    return refreshed.accessToken;
  } catch (error) {
    await clearTokens();
    throw new Error(
      error instanceof Error
        ? `No se pudo renovar la sesión de Spotify: ${error.message}`
        : 'No se pudo renovar la sesión de Spotify.'
    );
  }
}

/**
 * Auth de Spotify con Authorization Code + PKCE.
 *
 * Requiere un development build (Expo Go no puede registrar el esquema
 * `playlistcleaner://` para volver desde el navegador).
 */
export const spotifyAuth = {
  async login(): Promise<SpotifySession> {
    const request = new AuthSession.AuthRequest({
      clientId: SPOTIFY_CLIENT_ID,
      scopes: [...SPOTIFY_SCOPES],
      redirectUri: SPOTIFY_REDIRECT_URI,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
    });
    // Genera el estado + code_verifier de PKCE antes de abrir el navegador.
    await request.getAuthRequestConfigAsync();

    const result = await request.promptAsync(SPOTIFY_DISCOVERY, { showInRecents: true });
    if (result.type !== 'success') {
      throw new Error(
        result.type === 'dismiss'
          ? 'Has cancelado el inicio de sesión con Spotify.'
          : 'No se pudo completar el inicio de sesión con Spotify.'
      );
    }

    const code = result.params.code;
    if (!code) {
      throw new Error('Spotify no devolvió un código de autorización.');
    }

    // El code_verifier de PKCE viaja en extraParams (el body del token request).
    const tokenResponse = await AuthSession.exchangeCodeAsync(
      {
        clientId: SPOTIFY_CLIENT_ID,
        code,
        redirectUri: SPOTIFY_REDIRECT_URI,
        extraParams: { code_verifier: request.codeVerifier ?? '' },
      },
      SPOTIFY_DISCOVERY
    );

    const displayName = await fetchDisplayName(tokenResponse.accessToken);
    await saveTokens(toStoredTokens(tokenResponse, displayName));
    return { displayName };
  },

  getAccessToken,

  /** Rehidrata la sesión al arrancar la app. Devuelve null si no hay sesión. */
  async restore(): Promise<SpotifySession | null> {
    const tokens = await loadTokens();
    if (!tokens) return null;
    try {
      await getAccessToken();
    } catch {
      return null;
    }
    // Relee por si getAccessToken acaba de refrescar el token, y completa
    // el nombre de perfil si faltaba.
    const stored = (await loadTokens()) ?? tokens;
    if (!stored.displayName) {
      const displayName = await fetchDisplayName(stored.accessToken);
      if (displayName) {
        await saveTokens({ ...stored, displayName });
        return { displayName };
      }
    }
    return { displayName: stored.displayName };
  },

  async logout(): Promise<void> {
    await clearTokens();
  },
};
