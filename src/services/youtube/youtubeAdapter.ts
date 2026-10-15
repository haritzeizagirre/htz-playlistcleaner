import { cleanArtist } from '../audio/previewResolver';
import type {
  BulkOperationFailure,
  BulkOperationResult,
  IMusicService,
  PlaylistSummary,
  Track,
} from '../interfaces';
import {
  artistKey,
  diversifyByArtist,
  isCoveredArtistKey,
  pickGenreTags,
  songKey,
  splitArtistNames,
  titleArtistCredit,
  titleCollaborators,
  type RecommendationCandidate,
} from '../recommendations';
import { YOUTUBE_API_BASE, YOUTUBE_MUSIC_CATEGORY_ID } from './youtubeConfig';

/**
 * Adaptador real de YouTube Music (YouTube Data API v3).
 *
 * Endpoints usados:
 * - GET    /playlists?mine=true                 (1 unidad)
 * - GET    /playlistItems?playlistId=...        (1 unidad, paginado de 50)
 * - GET    /videos?part=contentDetails          (1 unidad, duración de 50 vídeos)
 * - GET    /videos?part=snippet                 (1 unidad, etiquetas de género)
 * - DELETE /playlistItems?id=...                (50 unidades por borrado)
 * - POST   /playlistItems                       (50 unidades por inserción)
 * - GET    /search?q=...&videoCategoryId=10     (100 unidades)
 *
 * La cuota diaria es de 10.000 unidades por proyecto: el flujo está pensado
 * para borrar en bloque al confirmar (no en cada swipe) precisamente por esto.
 * `relatedToVideoId` está deprecado en la API: las recomendaciones se hacen
 * buscando por los artistas de las canciones semilla, sus colaboradores y su
 * género (ver getRecommendations; hasta 8 búsquedas = 800 unidades por carga).
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
  snippet?: YouTubeSnippet & { tags?: string[] };
  contentDetails?: { duration?: string };
}

/** En /search el `id` viene como objeto de recurso, no como string. */
interface YouTubeSearchItem {
  id: string | { kind: string; videoId?: string };
  snippet: YouTubeSnippet;
}

const PAGE_SIZE = 50;
const MAX_RECOMMENDATIONS = 15;
/** Canciones como máximo por artista: evita monográficos de un solo autor. */
const MAX_PER_ARTIST = 3;
/**
 * Si con ese tope salen menos de estas propuestas (playlist sin colaboradores
 * ni etiquetas), se relaja el tope para no dejar la lista en tres filas.
 */
const MIN_RECOMMENDATIONS = 9;
const MAX_PER_ARTIST_FILL = 6;
/** Búsquedas por artistas de las canciones semilla. */
const MAX_SEED_QUERIES = 3;
/** Búsquedas por artistas que colaboran en las semillas. */
const MAX_COLLAB_QUERIES = 3;
/** Búsquedas por género (etiquetas de las semillas) para traer artistas nuevos. */
const MAX_TAG_QUERIES = 2;
const MAX_RESULTS_PER_QUERY = 10;

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

  /** Etiquetas de los vídeos semilla (1 unidad por cada 50 vídeos). */
  private async fetchSeedTags(seedTrackIds: string[]): Promise<string[][]> {
    const tagLists: string[][] = [];
    for (let i = 0; i < seedTrackIds.length; i += PAGE_SIZE) {
      const ids = seedTrackIds.slice(i, i + PAGE_SIZE).join(',');
      if (!ids) continue;
      const query = this.buildQuery({ part: 'snippet', id: ids });
      try {
        const page = await this.request<YouTubeListResponse<YouTubeVideo>>(`/videos?${query}`);
        for (const video of page.items ?? []) {
          tagLists.push(video.snippet?.tags ?? []);
        }
      } catch {
        // Sin etiquetas: las búsquedas por género se omiten.
      }
    }
    return tagLists;
  }

  /**
   * Propuestas de canciones parecidas.
   *
   * `relatedToVideoId` está deprecado y las listas "mix" no son accesibles por
   * API, así que se busca por texto en tres rondas: artistas semilla,
   * colaboradores (feat./ft./with/& de los títulos) y temas del mismo género
   * (etiquetas de las semillas). El reparto final es ronda a ronda con tope
   * por artista, resolviendo el artista real aunque el vídeo lo suba un sello
   * ("STMPD RCRDS" + "Martin Garrix - Animals" ⇒ Martin Garrix): una playlist
   * de un solo autor antes devolvía casi solo sus canciones.
   */
  async getRecommendations(seedTrackIds: string[]): Promise<Track[]> {
    const seeds = seedTrackIds
      .map((seedId) => this.trackCache.get(seedId))
      .filter((track): track is Track => Boolean(track));
    if (seeds.length === 0) return [];

    // Canales que son en realidad sellos u otros perfiles: si el título lleva
    // "Artista - Canción", el artista es ese y no el canal.
    const channelArtistKeys = new Map<string, string>();
    const channelArtistNames = new Map<string, string>();
    const learnChannelArtist = (channelKey: string, rawTitle: string) => {
      if (!channelKey || channelArtistKeys.has(channelKey)) return;
      const credit = titleArtistCredit(rawTitle);
      if (!credit) return;
      const creditKey = artistKey(credit);
      if (!creditKey || creditKey.includes(channelKey) || channelKey.includes(creditKey)) return;
      const [primary] = splitArtistNames(credit);
      if (!primary) return;
      channelArtistKeys.set(channelKey, artistKey(primary));
      channelArtistNames.set(channelKey, primary);
    };
    const artistOfChannel = (channelKey: string) =>
      channelArtistKeys.get(channelKey) || channelKey;
    const nameOfChannel = (channel: string, channelKey: string) =>
      (channelArtistNames.get(channelKey) ?? cleanArtist(channel)) || channel;

    for (const seed of seeds) {
      learnChannelArtist(artistKey(seed.artist), seed.title);
    }

    // Artistas semilla (normalizados: "X", "X - Topic" y su sello cuentan como uno).
    const queriedKeys = new Set<string>();
    const artistQueries: { key: string; name: string }[] = [];
    for (const seed of seeds) {
      if (artistQueries.length >= MAX_SEED_QUERIES) break;
      const channelKey = artistKey(seed.artist);
      const key = artistOfChannel(channelKey);
      if (!key || queriedKeys.has(key)) continue;
      queriedKeys.add(key);
      artistQueries.push({ key, name: nameOfChannel(seed.artist, channelKey) });
    }

    const seenIds = new Set(seedTrackIds);
    const seenTitles = new Set<string>();
    for (const seed of seeds) {
      // La misma canción en otro vídeo (p. ej. "(Official Video)") no es una propuesta.
      const key = artistOfChannel(artistKey(seed.artist));
      seenTitles.add(`${key}|${songKey(seed.title)}`);
    }

    const candidates: RecommendationCandidate[] = [];
    /** Colaboradores pendientes de buscar; primero los de los títulos semilla. */
    const pendingCollabs: string[] = [];
    const pendingKeys = new Set<string>();

    const collectCollabs = (raw: string) => {
      for (const name of titleCollaborators(raw)) {
        const key = artistKey(name);
        if (!key || isCoveredArtistKey(key, queriedKeys) || pendingKeys.has(key)) continue;
        pendingKeys.add(key);
        pendingCollabs.push(name);
      }
    };

    for (const seed of seeds) {
      collectCollabs(seed.title);
    }

    const search = async (
      queryText: string,
      /** Artista de la consulta (null en las búsquedas por género). */
      artist: { key: string; name: string } | null,
      shortOnly = false
    ) => {
      const query = this.buildQuery({
        part: 'snippet',
        type: 'video',
        videoCategoryId: YOUTUBE_MUSIC_CATEGORY_ID,
        maxResults: String(MAX_RESULTS_PER_QUERY),
        // En las búsquedas por género, los mixes de horas se cuelan siempre.
        videoDuration: shortOnly ? 'short' : undefined,
        q: queryText,
      });
      let page: YouTubeListResponse<YouTubeSearchItem>;
      try {
        page = await this.request<YouTubeListResponse<YouTubeSearchItem>>(`/search?${query}`);
      } catch {
        return; // Una búsqueda caída no debe tumbar toda la pantalla.
      }

      for (const item of page.items ?? []) {
        const videoId =
          typeof item.id === 'string' ? item.id : item.id?.videoId ?? undefined;
        if (!videoId || seenIds.has(videoId)) continue;

        const title = item.snippet.title;
        const channel = item.snippet.channelTitle ?? 'YouTube Music';
        const channelKey = artistKey(channel);

        let key = artistOfChannel(channelKey);
        let artistName = nameOfChannel(channel, channelKey);
        const credit = titleArtistCredit(title);
        if (artist && credit && artistKey(credit).includes(artist.key)) {
          // El título confirma al artista buscado (el canal puede ser su sello).
          key = artist.key;
          artistName = credit;
          if (!channelArtistKeys.has(channelKey)) {
            channelArtistKeys.set(channelKey, artist.key);
            channelArtistNames.set(channelKey, artist.name);
          }
        }

        // Mismo artista y misma canción ⇒ duplicado ("X" y "X (Official Video)").
        const dedupeKey = `${key}|${songKey(title)}`;
        if (seenTitles.has(dedupeKey)) continue;
        seenIds.add(videoId);
        seenTitles.add(dedupeKey);

        candidates.push({
          key,
          track: {
            id: videoId,
            title,
            artist: artistName,
            album: '',
            coverUrl: bestThumbnail(item.snippet.thumbnails),
            previewUrl: null,
            durationMs: 0,
            provider: 'youtube',
          },
        });
        // Los propios resultados revelan colaboraciones ("X & Y - …").
        collectCollabs(title);
      }
    };

    // Ronda 1: artistas semilla. Ronda 2: colaboradores. Ronda 3: género.
    // Dentro de cada ronda las búsquedas son independientes: en paralelo para
    // que la pantalla no encadene 6-8 llamadas secuenciales.
    await Promise.all(artistQueries.map((query) => search(query.name, query, false)));
    await Promise.all(
      pendingCollabs
        .slice(0, MAX_COLLAB_QUERIES)
        .map((name) => search(name, { key: artistKey(name), name }, false))
    );

    const genreTags = pickGenreTags(await this.fetchSeedTags(seedTrackIds), {
      knownArtistKeys: [
        ...queriedKeys,
        ...channelArtistKeys.keys(),
        ...channelArtistKeys.values(),
        ...pendingKeys,
      ],
      seedTitles: seeds.map((seed) => seed.title),
      limit: MAX_TAG_QUERIES,
    });
    await Promise.all(genreTags.map((tag) => search(tag, null, true)));

    const pick = (maxPerArtist: number) =>
      diversifyByArtist(candidates, { maxPerArtist, maxTotal: MAX_RECOMMENDATIONS });
    const diversified = pick(MAX_PER_ARTIST);
    // Sin fuentes suficientes (ni colaboradores ni etiquetas) se relaja el
    // tope por artista: mejor más canciones del propio artista que tres filas.
    return diversified.length >= MIN_RECOMMENDATIONS ? diversified : pick(MAX_PER_ARTIST_FILL);
  }
}
