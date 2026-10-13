import type {
  BulkOperationFailure,
  BulkOperationResult,
  IMusicService,
  PlaylistSummary,
  Track,
} from '../interfaces';
import { YOUTUBE_API_BASE, YOUTUBE_MUSIC_CATEGORY_ID } from './youtubeConfig';

/**
 * Adaptador real de YouTube Music (YouTube Data API v3).
 *
 * Endpoints usados:
 * - GET    /playlists?mine=true                 (1 unidad)
 * - GET    /playlistItems?playlistId=...        (1 unidad, paginado de 50)
 * - GET    /videos?part=contentDetails          (1 unidad, duración de 50 vídeos)
 * - DELETE /playlistItems?id=...                (50 unidades por borrado)
 * - POST   /playlistItems                       (50 unidades por inserción)
 * - GET    /search?q=...&videoCategoryId=10     (100 unidades)
 *
 * La cuota diaria es de 10.000 unidades por proyecto: el flujo está pensado
 * para borrar en bloque al confirmar (no en cada swipe) precisamente por esto.
 * `relatedToVideoId` está deprecado en la API: las recomendaciones se hacen
 * buscando por el artista/canal de las canciones semilla.
 */

interface YouTubeTokensProvider {
  getAccessToken(options?: { forceRefresh?: boolean }): Promise<string>;
}

interface YouTubeThumbnail {
  url: string;
  width: number;
  height: number;
}

interface YouTubeThumbnails {
  default?: YouTubeThumbnail;
  medium?: YouTubeThumbnail;
  high?: YouTubeThumbnail;
  standard?: YouTubeThumbnail;
  maxres?: YouTubeThumbnail;
}

interface YouTubeSnippet {
  title: string;
  description?: string;
  channelTitle?: string;
  videoOwnerChannelTitle?: string;
  thumbnails?: YouTubeThumbnails;
  resourceId?: { videoId?: string };
}

interface YouTubeListResponse<T> {
  items?: T[];
  nextPageToken?: string;
  error?: { code: number; message: string };
}

interface YouTubePlaylist {
  id: string;
  snippet: YouTubeSnippet;
  contentDetails?: { itemCount?: number };
}

interface YouTubePlaylistItem {
  id: string;
  snippet: YouTubeSnippet;
  contentDetails?: { videoId?: string };
}

interface YouTubeVideo {
  id: string;
  contentDetails?: { duration?: string };
}

/** En /search el `id` viene como objeto de recurso, no como string. */
interface YouTubeSearchItem {
  id: string | { kind: string; videoId?: string };
  snippet: YouTubeSnippet;
}

const PAGE_SIZE = 50;
const MAX_RECOMMENDATIONS = 15;
const MAX_SEED_ARTISTS = 3;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** "PT3M42S" / "PT1H2M3S" → milisegundos. */
export function parseIsoDuration(duration: string | undefined): number {
  if (!duration) return 0;
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration);
  if (!match) return 0;
  const [, days, hours, minutes, seconds] = match;
  const totalSeconds =
    Number(days ?? 0) * 86_400 +
    Number(hours ?? 0) * 3_600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0);
  return totalSeconds * 1_000;
}

function bestThumbnail(thumbnails: YouTubeThumbnails | undefined): string {
  return (
    thumbnails?.standard?.url ??
    thumbnails?.high?.url ??
    thumbnails?.medium?.url ??
    thumbnails?.default?.url ??
    ''
  );
}

export class YouTubeAdapter implements IMusicService {
  /** Cache id → track de la última playlist cargada (para recomendaciones). */
  private readonly trackCache = new Map<string, Track>();

  constructor(private readonly auth: YouTubeTokensProvider) {}

  // ---------------------------------------------------------------- helpers

  private async request<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
    const token = await this.auth.getAccessToken({ forceRefresh: attempt > 0 });
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...(init.headers as Record<string, string> | undefined),
    };
    if (init.body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${YOUTUBE_API_BASE}${path}`, { ...init, headers });

    // Token caducado: fuerza refresco (Android cachea el de Google) y reintenta.
    if (response.status === 401 && attempt === 0) {
      return this.request<T>(path, init, 1);
    }
    if (response.status === 429 && attempt < 2) {
      await delay((attempt + 1) * 1_500);
      return this.request<T>(path, init, attempt + 1);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    if (!response.ok) {
      let message = `YouTube respondió ${response.status}`;
      try {
        const raw = await response.text();
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { error?: { message?: string } };
            message = parsed?.error?.message ?? `${message} · ${raw.slice(0, 200)}`;
          } catch {
            message = `${message} · ${raw.slice(0, 200)}`;
          }
        }
      } catch {
        // Sin cuerpo legible.
      }
      throw new Error(message);
    }
    return (await response.json()) as T;
  }

  private buildQuery(params: Record<string, string | undefined>): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) query.set(key, value);
    }
    return query.toString();
  }

  private mapPlayableItem(
    item: YouTubePlaylistItem,
    durationsMs: Map<string, number>
  ): Track | null {
    const videoId = item.contentDetails?.videoId;
    if (!videoId) return null;
    const snippet = item.snippet ?? { title: '' };
    return {
      id: videoId,
      playlistItemId: item.id,
      title: snippet.title,
      artist:
        snippet.videoOwnerChannelTitle ?? snippet.channelTitle ?? 'YouTube Music',
      // YouTube no expone álbum; se usa el canal como contexto.
      album: snippet.channelTitle ?? '',
      coverUrl: bestThumbnail(snippet.thumbnails),
      previewUrl: null, // el resolver de previews (iTunes) cubrirá estos casos
      durationMs: durationsMs.get(videoId) ?? 0,
      provider: 'youtube',
    };
  }

  /** Rellena las duraciones con /videos (1 unidad por cada 50 vídeos). */
  private async fetchDurations(videoIds: string[]): Promise<Map<string, number>> {
    const durations = new Map<string, number>();
    for (let i = 0; i < videoIds.length; i += PAGE_SIZE) {
      const ids = videoIds.slice(i, i + PAGE_SIZE).join(',');
      const query = this.buildQuery({ part: 'contentDetails', id: ids });
      try {
        const page = await this.request<YouTubeListResponse<YouTubeVideo>>(`/videos?${query}`);
        for (const video of page.items ?? []) {
          durations.set(video.id, parseIsoDuration(video.contentDetails?.duration));
        }
      } catch {
        // Sin duraciones: las tarjetas mostrarán 0:00 hasta la próxima carga.
      }
    }
    return durations;
  }

  // ---------------------------------------------------------------- sesión

  async login(): Promise<boolean> {
    await this.auth.getAccessToken();
    return true;
  }

  async logout(): Promise<void> {
    // La sesión la gestiona youtubeAuth (GoogleSignin).
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      await this.auth.getAccessToken();
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------- lectura

  async getUserPlaylists(): Promise<PlaylistSummary[]> {
    const playlists: PlaylistSummary[] = [];
    let pageToken: string | undefined;

    do {
      const query = this.buildQuery({
        part: 'snippet,contentDetails',
        mine: 'true',
        maxResults: String(PAGE_SIZE),
        pageToken,
      });
      const page = await this.request<YouTubeListResponse<YouTubePlaylist>>(`/playlists?${query}`);

      for (const playlist of page.items ?? []) {
        playlists.push({
          id: playlist.id,
          name: playlist.snippet.title,
          description: playlist.snippet.description ?? '',
          coverUrl: bestThumbnail(playlist.snippet.thumbnails),
          trackCount: playlist.contentDetails?.itemCount ?? 0,
          provider: 'youtube',
        });
      }
      pageToken = page.nextPageToken;
    } while (pageToken);

    return playlists;
  }

  async getPlaylistTracks(playlistId: string): Promise<Track[]> {
    const items: YouTubePlaylistItem[] = [];
    let pageToken: string | undefined;

    do {
      const query = this.buildQuery({
        part: 'snippet,contentDetails',
        playlistId,
        maxResults: String(PAGE_SIZE),
        pageToken,
      });
      const page = await this.request<YouTubeListResponse<YouTubePlaylistItem>>(
        `/playlistItems?${query}`
      );
      items.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);

    const videoIds = items
      .map((item) => item.contentDetails?.videoId)
      .filter((id): id is string => Boolean(id));
    const durations = videoIds.length > 0 ? await this.fetchDurations(videoIds) : new Map();

    const tracks = items
      .map((item) => this.mapPlayableItem(item, durations))
      .filter((track): track is Track => track !== null);

    for (const track of tracks) {
      this.trackCache.set(track.id, track);
    }
    return tracks;
  }

  // ---------------------------------------------------------------- escritura

  async removeTrackFromPlaylist(playlistId: string, track: Track): Promise<boolean> {
    const result = await this.removeTracksFromPlaylist(playlistId, [track]);
    return result.failed.length === 0;
  }

  async addTrackToPlaylist(playlistId: string, track: Track): Promise<boolean> {
    const result = await this.addTracksToPlaylist(playlistId, [track]);
    return result.failed.length === 0;
  }

  /** La API no tiene borrado por lotes: N llamadas (50 unidades cada una). */
  async removeTracksFromPlaylist(
    playlistId: string,
    tracks: Track[]
  ): Promise<BulkOperationResult> {
    const succeeded: string[] = [];
    const failed: BulkOperationFailure[] = [];

    for (const track of tracks) {
      if (!track.playlistItemId) {
        failed.push({ track, error: 'Falta el ID del item de la playlist' });
        continue;
      }
      try {
        const query = this.buildQuery({ id: track.playlistItemId });
        await this.request(`/playlistItems?${query}`, { method: 'DELETE' });
        succeeded.push(track.id);
      } catch (error) {
        failed.push({
          track,
          error: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    }

    return { succeeded, failed };
  }

  /** Inserciones individuales (50 unidades cada una). */
  async addTracksToPlaylist(playlistId: string, tracks: Track[]): Promise<BulkOperationResult> {
    const succeeded: string[] = [];
    const failed: BulkOperationFailure[] = [];

    for (const track of tracks) {
      try {
        const query = this.buildQuery({ part: 'snippet' });
        await this.request(`/playlistItems?${query}`, {
          method: 'POST',
          body: JSON.stringify({
            snippet: {
              playlistId,
              resourceId: { kind: 'youtube#video', videoId: track.id },
            },
          }),
        });
        succeeded.push(track.id);
      } catch (error) {
        failed.push({
          track,
          error: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    }

    return { succeeded, failed };
  }

  // ------------------------------------------------------------- descubrir

  async getRecommendations(seedTrackIds: string[]): Promise<Track[]> {
    // No hay endpoint de "similares" estable (relatedToVideoId está
    // deprecado): se busca por el canal/artista de las canciones semilla
    // (los nombres salen de la caché que llena getPlaylistTracks).
    const artistNames: string[] = [];
    for (const seedId of seedTrackIds) {
      const cached = this.trackCache.get(seedId);
      if (!cached?.artist) continue;
      const artist = cached.artist.trim();
      if (artist && !artistNames.includes(artist)) {
        artistNames.push(artist);
      }
      if (artistNames.length >= MAX_SEED_ARTISTS) break;
    }

    if (artistNames.length === 0) {
      return [];
    }

    const recommendations: Track[] = [];
    const seen = new Set<string>(seedTrackIds);

    for (const artist of artistNames) {
      const query = this.buildQuery({
        part: 'snippet',
        type: 'video',
        videoCategoryId: YOUTUBE_MUSIC_CATEGORY_ID,
        maxResults: '10',
        q: artist,
      });
      let page: YouTubeListResponse<YouTubeSearchItem>;
      try {
        page = await this.request<YouTubeListResponse<YouTubeSearchItem>>(`/search?${query}`);
      } catch {
        continue;
      }

      for (const item of page.items ?? []) {
        const videoId =
          typeof item.id === 'string' ? item.id : item.id?.videoId ?? undefined;
        if (!videoId || seen.has(videoId)) continue;
        seen.add(videoId);
        recommendations.push({
          id: videoId,
          title: item.snippet.title,
          artist: item.snippet.channelTitle ?? 'YouTube Music',
          album: '',
          coverUrl: bestThumbnail(item.snippet.thumbnails),
          previewUrl: null,
          durationMs: 0,
          provider: 'youtube',
        });
        if (recommendations.length >= MAX_RECOMMENDATIONS) {
          return recommendations;
        }
      }
    }

    return recommendations;
  }
}
