/**
 * Configuración de la integración con Google / YouTube Music (Fase 3).
 *
 * Requisitos en Google Cloud Console:
 * - YouTube Data API v3 habilitada.
 * - Pantalla de consentimiento OAuth con el scope de YouTube y tu cuenta
 *   añadida como usuario de prueba (mientras la app no esté verificada).
 * - Cliente OAuth de tipo **Android** (package + SHA-1) para el SDK nativo.
 * - Cliente OAuth de tipo **Web**: su Client ID va aquí como `webClientId`.
 */
export const GOOGLE_WEB_CLIENT_ID =
  '946860855319-4lev7dm15l0qntcuro2tf6ndfbm6avgs.apps.googleusercontent.com'; // ← Client ID de tipo "Web"

/** Permiso completo sobre la cuenta de YouTube (gestionar playlists). */
export const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube';

export const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/** Categoría "Music" de YouTube (para que las recomendaciones sean música). */
export const YOUTUBE_MUSIC_CATEGORY_ID = '10';

/** true cuando el Client ID Web está configurado (login real disponible). */
export const isYouTubeConfigured = (): boolean => GOOGLE_WEB_CLIENT_ID.length > 0;
