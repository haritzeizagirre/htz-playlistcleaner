import {
  GoogleSignin,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';

import { GOOGLE_WEB_CLIENT_ID, YOUTUBE_SCOPE } from './youtubeConfig';

export interface YouTubeSession {
  displayName: string | null;
}

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    scopes: [YOUTUBE_SCOPE],
  });
  configured = true;
}

function displayNameOf(user: { name: string | null; email: string } | null): string | null {
  if (!user) return null;
  return user.name ?? user.email;
}

/**
 * Auth de Google para YouTube Music usando el SDK nativo de Google Sign-In.
 *
 * - `configure({ scopes: [youtube] })` pide el permiso de YouTube en el
 *   propio diálogo de Google.
 * - El access token se obtiene con `getTokens()` y se usa contra la
 *   YouTube Data API v3.
 * - Requiere development build (la librería es código nativo).
 */
export const youtubeAuth = {
  async login(): Promise<YouTubeSession> {
    ensureConfigured();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      throw new Error('Has cancelado el inicio de sesión con Google.');
    }

    const tokens = await GoogleSignin.getTokens();
    if (!tokens.accessToken) {
      throw new Error('Google no devolvió un token de acceso para YouTube.');
    }

    return { displayName: displayNameOf(response.data.user) };
  },

  async getAccessToken(options: { forceRefresh?: boolean } = {}): Promise<string> {
    ensureConfigured();
    let tokens = await GoogleSignin.getTokens();

    // En Android el token se cachea; si la API responde 401 se fuerza refresco.
    if (options.forceRefresh && tokens.accessToken) {
      await GoogleSignin.clearCachedAccessToken(tokens.accessToken);
      tokens = await GoogleSignin.getTokens();
    }

    if (!tokens.accessToken) {
      throw new Error('No hay sesión de Google activa. Vuelve a iniciar sesión.');
    }
    return tokens.accessToken;
  },

  /** Rehidrata la sesión de Google al arrancar la app. */
  async restore(): Promise<YouTubeSession | null> {
    if (!GoogleSignin.hasPreviousSignIn()) return null;
    try {
      ensureConfigured();
      const tokens = await GoogleSignin.getTokens();
      if (!tokens.accessToken) return null;
      const current = GoogleSignin.getCurrentUser();
      return { displayName: displayNameOf(current?.user ?? null) };
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    try {
      await GoogleSignin.signOut();
    } catch {
      // Sin sesión previa: nada que cerrar.
    }
  },
};
