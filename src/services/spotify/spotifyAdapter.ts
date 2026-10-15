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
  primaryArtistName,
  songKey,
  splitArtistNames,
  type RecommendationCandidate,
} from '../recommendations';
import { SPOTIFY_API_BASE } from './spotifyConfig';

/**
 * Adaptador real de Spotify (Web API).
 *
 * Endpoints usados (los nuevos, tras la migración de Spotify):
 * - GET    /me/playlists?limit=50&offset=...
 * - GET    /playlists/{id}/items           (el antiguo /tracks está deprecado)
 * - DELETE /playlists/{id}/items           body: { items: [{ uri }] }
 * - POST   /playlists/{id}/items           body: { uris: [...] }
 * - GET    /search?q=artist:"X"&type=track (recomendaciones; /recommendations
 *          y /related-artists ya no existen para apps nuevas)
 *
 * La cuota se cuida con: paginación mínima, borrado en lotes de 100 y
 * reintento único ante 401/429.
 */

interface SpotifyTokensProvider {
  getAccessToken(options?: { forceRefresh?: boolean }): Promise<string>;
}

interface SpotifyImage {
  url: string;
}

interface SpotifyArtist {
  id: string;
  name: string;
}

type SpotifyItemType = 'track' | 'episode' | 'audiobook' | string;

interface SpotifyPlayableObject {
  id: string;
  uri: string;
  name: string;
  type: SpotifyItemType;
  duration_ms: number;
  preview_url?: string | null;
  is_local?: boolean;
  album?: { name: string; images?: SpotifyImage[] };
  images?: SpotifyImage[];
  artists?: SpotifyArtist[];
}

interface SpotifyPlaylistItem {
  is_local: boolean;
  /** Campo nuevo de la API. */
  item: SpotifyPlayableObject | null;
  /** Campo antiguo (deprecado), por si algún cliente aún lo recibe. */
  track?: SpotifyPlayableObject | null;
}

interface SpotifyPaged<T> {
  items: T[];
  next: string | null;
  total: number;
  offset: number;
  limit: number;
}

interface SpotifyPlaylistObject {
  id: string;
  name: string;
  description: string | null;
  images?: SpotifyImage[];
  /** Campo nuevo de la API (total de items). */
  items?: { total: number };
  /** Campo antiguo (deprecado). */
  tracks?: { total: number };
}

interface SpotifySearchResponse {
  tracks?: { items: SpotifyPlayableObject[] };
}

const PAGE_SIZE = 50;
const BATCH_SIZE = 100;
const MAX_RECOMMENDATIONS = 15;
/** Canciones como máximo por artista: evita monográficos de un solo autor. */
const MAX_PER_ARTIST = 3;
/**
 * Si con ese tope salen menos de estas propuestas (playlist sin
 * colaboraciones), se relaja el tope para no dejar la lista en tres filas.
 */
const MIN_RECOMMENDATIONS = 9;
const MAX_PER_ARTIST_FILL = 6;
/** Búsquedas por artistas principales de las semillas. */
const MAX_SEED_QUERIES = 3;
/** Búsquedas por los demás artistas de cada pista (colaboraciones). */
const MAX_COLLAB_QUERIES = 5;
const MAX_RESULTS_PER_QUERY = 10;

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class SpotifyAdapter implements IMusicService {
  /** Cache id → track de la última playlist cargada (para recomendaciones). */
  private readonly trackCache = new Map<string, Track>();

  constructor(private readonly auth: SpotifyTokensProvider) {}

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

    const response = await fetch(`${SPOTIFY_API_BASE}${path}`, { ...init, headers });

    // Token caducado a mitad de petición: refresca y reintenta una vez.
    if (response.status === 401 && attempt === 0) {
      return this.request<T>(path, init, 1);
    }
    // Rate limit: respeta Retry-After (con tope de 10 s).
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get('Retry-After') ?? '1');
      await delay(Math.min(Number.isFinite(retryAfter) ? retryAfter : 1, 10) * 1000);
      return this.request<T>(path, init, attempt + 1);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    if (!response.ok) {
      let message = `Spotify respondió ${response.status}`;
      try {
        const raw = await response.text();
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { error?: { message?: string } | string };
            if (parsed?.error) {
              message =
                typeof parsed.error === 'string'
                  ? parsed.error
                  : parsed.error.message ?? message;
            } else {
              message = `${message} · ${raw.slice(0, 200)}`;
            }
          } catch {
            message = `${message} · ${raw.slice(0, 200)}`;
          }
        }
      } catch {
        // Sin cuerpo legible: se queda el mensaje con el código.
      }
      throw new Error(message);
    }
    return (await response.json()) as T;
  }

  private mapItem(item: SpotifyPlayableObject, itemUri?: string): Track {
    return {
      id: item.id,
      playlistItemId: itemUri,
      title: item.name,
      artist: (item.artists ?? []).map((artist) => artist.name).join(', '),
      album: item.album?.name ?? '',
      coverUrl: item.album?.images?.[0]?.url ?? item.images?.[0]?.url ?? '',
      previewUrl: item.preview_url ?? null,
      durationMs: item.duration_ms,
      provider: 'spotify',
    };
  }

  private itemUri(track: Track): string {
    return track.playlistItemId ?? `spotify:track:${track.id}`;
  }

  // ---------------------------------------------------------------- sesión

  async login(): Promise<boolean> {
    await this.auth.getAccessToken();
    return true;
  }

  async logout(): Promise<void> {
    // La sesión la gestiona spotifyAuth (SecureStore).
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
    const summaries: PlaylistSummary[] = [];
    let offset = 0;

    for (;;) {
      const page = await this.request<SpotifyPaged<SpotifyPlaylistObject>>(
        `/me/playlists?limit=${PAGE_SIZE}&offset=${offset}`
      );

      for (const playlist of page.items) {
        summaries.push({
          id: playlist.id,
          name: playlist.name,
          description: playlist.description ?? '',
          coverUrl: playlist.images?.[0]?.url ?? '',
          trackCount: playlist.items?.total ?? playlist.tracks?.total ?? 0,
          provider: 'spotify',
        });
      }

      if (!page.next) break;
      offset += page.limit;
    }

    return summaries;
  }

  async getPlaylistTracks(playlistId: string): Promise<Track[]> {
    const tracks: Track[] = [];
    let offset = 0;

    for (;;) {
      const page = await this.request<SpotifyPaged<SpotifyPlaylistItem>>(
        `/playlists/${playlistId}/items?limit=${PAGE_SIZE}&offset=${offset}`
      );

      for (const entry of page.items) {
        const item = entry.item ?? entry.track ?? null;
        // Solo canciones reales: fuera episodios, archivos locales y huecos.
        if (!item || item.type !== 'track' || entry.is_local || item.is_local) {
          continue;
        }
        const track = this.mapItem(item, item.uri);
        tracks.push(track);
        this.trackCache.set(track.id, track);
      }

      if (!page.next) break;
      offset += page.limit;
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

  async removeTracksFromPlaylist(
    playlistId: string,
    tracks: Track[]
  ): Promise<BulkOperationResult> {
    const succeeded: string[] = [];
    const failed: BulkOperationFailure[] = [];

    for (const group of chunk(tracks, BATCH_SIZE)) {
      try {
        await this.request(`/playlists/${playlistId}/items`, {
          method: 'DELETE',
          body: JSON.stringify({
            items: group.map((track) => ({ uri: this.itemUri(track) })),
          }),
        });
        succeeded.push(...group.map((track) => track.id));
      } catch {
        // Si falla el lote (p. ej. algún item ya no existe), reintenta
        // individualmente para aislar los que sí se pueden borrar.
        const partial = await this.removeIndividually(playlistId, group);
        succeeded.push(...partial.succeeded);
        failed.push(...partial.failed);
      }
    }

    return { succeeded, failed };
  }

  private async removeIndividually(
    playlistId: string,
    tracks: Track[]
  ): Promise<BulkOperationResult> {
    const succeeded: string[] = [];
    const failed: BulkOperationFailure[] = [];

    for (const track of tracks) {
      try {
        await this.request(`/playlists/${playlistId}/items`, {
          method: 'DELETE',
          body: JSON.stringify({ items: [{ uri: this.itemUri(track) }] }),
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

  async addTracksToPlaylist(playlistId: string, tracks: Track[]): Promise<BulkOperationResult> {
    const succeeded: string[] = [];
    const failed: BulkOperationFailure[] = [];

    for (const group of chunk(tracks, BATCH_SIZE)) {
      try {
        await this.request(`/playlists/${playlistId}/items`, {
          method: 'POST',
          body: JSON.stringify({ uris: group.map((track) => this.itemUri(track)) }),
        });
        succeeded.push(...group.map((track) => track.id));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido';
        failed.push(...group.map((track) => ({ track, error: message })));
      }
    }

    return { succeeded, failed };
  }

  // ------------------------------------------------------------- descubrir

  /**
   * Propuestas de canciones parecidas.
   *
   * `/recommendations` y `/artists/{id}/related-artists` ya no existen para
   * apps nuevas, así que se busca por texto: primero por el artista principal
   * de cada semilla y después por los colaboradores (el resto de artistas de
   * la pista), con tope de canciones por artista para evitar monográficos.
   */
  async getRecommendations(seedTrackIds: string[]): Promise<Track[]> {
    const seeds = seedTrackIds
      .map((seedId) => this.trackCache.get(seedId))
      .filter((track): track is Track => Boolean(track));
    if (seeds.length === 0) return [];

    // Artistas principales de las semillas (una búsqueda por artista).
    const queriedKeys = new Set<string>();
    const artistQueries: string[] = [];
    const pendingCollabs: string[] = [];
    const pendingKeys = new Set<string>();

    const collectCollabs = (raw: string) => {
      for (const name of splitArtistNames(raw)) {
        const key = artistKey(name);
        if (!key || isCoveredArtistKey(key, queriedKeys) || pendingKeys.has(key)) continue;
        pendingKeys.add(key);
        pendingCollabs.push(name);
      }
    };

    const seenIds = new Set(seedTrackIds);
    const seenTitles = new Set<string>();

    for (const seed of seeds) {
      const primary = primaryArtistName(seed.artist);
      if (primary && artistQueries.length < MAX_SEED_QUERIES) {
        const key = artistKey(primary);
        if (key && !queriedKeys.has(key)) {
          queriedKeys.add(key);
          artistQueries.push(primary);
          // La misma canción en otra versión/álbum no es una propuesta.
          seenTitles.add(`${key}|${songKey(seed.title)}`);
        }
      }
      // Resto de artistas de la pista (colaboraciones). `collectCollabs`
      // descarta lo que ya está cubierto por el artista principal.
      collectCollabs(seed.artist);
    }

    const candidates: RecommendationCandidate[] = [];

    const search = async (queryText: string) => {
      const query = encodeURIComponent(`artist:"${queryText}"`);
      let searchPage: SpotifySearchResponse;
      try {
        searchPage = await this.request<SpotifySearchResponse>(
          `/search?q=${query}&type=track&limit=${MAX_RESULTS_PER_QUERY}`
        );
      } catch {
        return; // Una búsqueda caída no debe tumbar toda la pantalla.
      }

      for (const item of searchPage.tracks?.items ?? []) {
        // La búsqueda no admite episodes; descarta locales y duplicados.
        if (!item.id || item.is_local || item.type !== 'track' || seenIds.has(item.id)) {
          continue;
        }
        const primaryKey = artistKey(item.artists?.[0]?.name ?? '');
        if (!primaryKey) continue;
        const dedupeKey = `${primaryKey}|${songKey(item.name)}`;
        if (seenTitles.has(dedupeKey)) continue;
        seenIds.add(item.id);
        seenTitles.add(dedupeKey);

        const track = this.mapItem(item);
        candidates.push({ key: primaryKey, track });
        collectCollabs(track.artist);
      }
    };

    // Ronda 1: artistas principales. Ronda 2: colaboradores (los de las
    // semillas primero; después, los descubiertos en los resultados). Los
    // que ya se buscaron como artista principal no se repiten. En paralelo
    // para no encadenar llamadas.
    await Promise.all(artistQueries.map((queryText) => search(queryText)));
    const collabQueries = pendingCollabs
      .filter((name) => !queriedKeys.has(artistKey(name)))
      .slice(0, MAX_COLLAB_QUERIES);
    await Promise.all(collabQueries.map((queryText) => search(queryText)));

    const pick = (maxPerArtist: number) =>
      diversifyByArtist(candidates, { maxPerArtist, maxTotal: MAX_RECOMMENDATIONS });
    const diversified = pick(MAX_PER_ARTIST);
    // Sin colaboraciones suficientes se relaja el tope por artista: mejor más
    // canciones del propio artista que tres filas.
    return diversified.length >= MIN_RECOMMENDATIONS ? diversified : pick(MAX_PER_ARTIST_FILL);
  }
}
