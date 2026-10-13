/**
 * Contratos de la capa musical (patrón Adapter).
 * Cualquier proveedor (Spotify, YouTube Music, mocks) implementa IMusicService,
 * de modo que la UI nunca depende de una API concreta.
 */

export type MusicProvider = 'spotify' | 'youtube';

/** 'live' = APIs reales del proveedor; 'demo' = datos de ejemplo locales. */
export type SessionMode = 'live' | 'demo';

export interface Track {
  /** ID único en la plataforma. */
  id: string;
  /** ID específico del item dentro de la playlist (imprescindible en YouTube). */
  playlistItemId?: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  /** URL MP3 del preview o null si no hay fragmento disponible. */
  previewUrl: string | null;
  durationMs: number;
  provider: MusicProvider;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  trackCount: number;
  provider: MusicProvider;
}

export interface BulkOperationFailure {
  track: Track;
  error: string;
}

export interface BulkOperationResult {
  /** IDs de los tracks procesados con éxito. */
  succeeded: string[];
  failed: BulkOperationFailure[];
}

export interface IMusicService {
  login(): Promise<boolean>;
  logout(): Promise<void>;
  isAuthenticated(): Promise<boolean>;
  getUserPlaylists(): Promise<PlaylistSummary[]>;
  getPlaylistTracks(playlistId: string): Promise<Track[]>;
  removeTrackFromPlaylist(playlistId: string, track: Track): Promise<boolean>;
  addTrackToPlaylist(playlistId: string, track: Track): Promise<boolean>;
  getRecommendations(seedTrackIds: string[]): Promise<Track[]>;
  /**
   * Extensión Fase 4 (batching): elimina varios tracks en una sola operación.
   * Spotify admite hasta 100 URIs por llamada; YouTube requiere borrado
   * individual, pero el adapter lo agrupa internamente.
   */
  removeTracksFromPlaylist(
    playlistId: string,
    tracks: Track[]
  ): Promise<BulkOperationResult>;
  /** Extensión Fase 5: añade varios tracks descubiertos de una vez. */
  addTracksToPlaylist(
    playlistId: string,
    tracks: Track[]
  ): Promise<BulkOperationResult>;
}
