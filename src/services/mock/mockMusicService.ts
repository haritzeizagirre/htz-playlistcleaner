import type {
  BulkOperationResult,
  IMusicService,
  MusicProvider,
  PlaylistSummary,
  Track,
} from '../interfaces';
import { buildMockLibrary } from './mockData';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const simulateLatency = () => delay(350 + Math.random() * 350);

/**
 * Implementación mock de IMusicService (Fase 1).
 * Mantiene estado en memoria: eliminar/añadir canciones tiene efecto real
 * dentro de la sesión de la app para poder probar el flujo completo.
 */
export class MockMusicService implements IMusicService {
  private readonly provider: MusicProvider;
  private playlists: PlaylistSummary[];
  private tracksByPlaylist: Map<string, Track[]>;
  private readonly discoveryPool: Track[];
  private authenticated = false;

  constructor(provider: MusicProvider) {
    this.provider = provider;
    const library = buildMockLibrary(provider);
    this.playlists = library.playlists;
    this.tracksByPlaylist = library.tracksByPlaylist;
    this.discoveryPool = library.discoveryPool;
  }

  async login(): Promise<boolean> {
    await delay(600);
    this.authenticated = true;
    return true;
  }

  async logout(): Promise<void> {
    await delay(200);
    this.authenticated = false;
  }

  async isAuthenticated(): Promise<boolean> {
    return this.authenticated;
  }

  async getUserPlaylists(): Promise<PlaylistSummary[]> {
    await simulateLatency();
    return this.playlists.map((playlist) => ({ ...playlist }));
  }

  async getPlaylistTracks(playlistId: string): Promise<Track[]> {
    await simulateLatency();
    return [...(this.tracksByPlaylist.get(playlistId) ?? [])];
  }

  async removeTrackFromPlaylist(playlistId: string, track: Track): Promise<boolean> {
    const result = await this.removeTracksFromPlaylist(playlistId, [track]);
    return result.failed.length === 0;
  }

  async addTrackToPlaylist(playlistId: string, track: Track): Promise<boolean> {
    const result = await this.addTracksToPlaylist(playlistId, [track]);
    return result.failed.length === 0;
  }

  async getRecommendations(seedTrackIds: string[]): Promise<Track[]> {
    await simulateLatency();
    // Mock determinista: devuelve el pool de descubrimiento sin las semillas.
    const seedSet = new Set(seedTrackIds);
    return this.discoveryPool
      .filter((track) => !seedSet.has(track.id))
      .map((track) => ({ ...track }));
  }

  async removeTracksFromPlaylist(
    playlistId: string,
    tracks: Track[]
  ): Promise<BulkOperationResult> {
    await simulateLatency();
    const current = this.tracksByPlaylist.get(playlistId);
    if (!current) {
      return {
        succeeded: [],
        failed: tracks.map((track) => ({ track, error: 'Playlist no encontrada' })),
      };
    }

    const removeKeys = new Set(tracks.map((t) => t.playlistItemId ?? t.id));
    this.tracksByPlaylist.set(
      playlistId,
      current.filter((t) => !removeKeys.has(t.playlistItemId ?? t.id))
    );
    this.syncTrackCount(playlistId);

    return { succeeded: tracks.map((t) => t.id), failed: [] };
  }

  async addTracksToPlaylist(
    playlistId: string,
    tracks: Track[]
  ): Promise<BulkOperationResult> {
    await simulateLatency();
    const current = this.tracksByPlaylist.get(playlistId);
    if (!current) {
      return {
        succeeded: [],
        failed: tracks.map((track) => ({ track, error: 'Playlist no encontrada' })),
      };
    }

    const existing = new Set(current.map((t) => t.id));
    const added: Track[] = [];
    for (const track of tracks) {
      if (existing.has(track.id)) continue;
      added.push({
        ...track,
        provider: this.provider,
        playlistItemId: `${playlistId}:${track.id}`,
      });
      existing.add(track.id);
    }

    this.tracksByPlaylist.set(playlistId, [...current, ...added]);
    this.syncTrackCount(playlistId);

    return { succeeded: added.map((t) => t.id), failed: [] };
  }

  private syncTrackCount(playlistId: string): void {
    const count = this.tracksByPlaylist.get(playlistId)?.length ?? 0;
    this.playlists = this.playlists.map((playlist) =>
      playlist.id === playlistId ? { ...playlist, trackCount: count } : playlist
    );
  }
}
