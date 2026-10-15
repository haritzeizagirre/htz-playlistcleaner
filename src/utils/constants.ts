export const APP_NAME = 'Playlist Cleaner';

/** Duración del fragmento de preview que se muestra en la tarjeta (s). */
export const PREVIEW_SECONDS = 30;

/** Tiempo que permanece visible el snackbar de "Deshacer" (ms). */
export const SNACKBAR_DURATION_MS = 5000;

/** Duración de la animación de salida de una tarjeta al hacer swipe (ms). */
export const SWIPE_EXIT_DURATION_MS = 240;

/** Umbral relativo del ancho de pantalla para confirmar el swipe. */
export const SWIPE_THRESHOLD_RATIO = 0.28;

/** Velocidad (px/s) que dispensa del umbral al deslizar rápido. */
export const SWIPE_MIN_VELOCITY = 900;

/**
 * Alto mínimo de las tarjetas de reproductor (preview y vídeo). Al mantenerlo
 * igual en ambas, el deck no cambia de tamaño al alternar entre ellas: ese
 * salto de layout se percibía como un pequeño "zoom" en cada canción.
 */
export const PLAYER_CARD_MIN_HEIGHT = 120;

/** Claves para almacenamiento seguro (SecureStore).
 *  OJO: SecureStore solo admite alfanuméricos, '.', '-' y '_' (nada de '/'). */
export const STORAGE_KEYS = {
  authTokens: 'playlist-cleaner.auth-tokens',
} as const;

/** Un ID de vídeo real de YouTube tiene 11 caracteres (los mocks no). */
export const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
