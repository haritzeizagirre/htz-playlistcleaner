import type { MusicProvider, PlaylistSummary, Track } from '../interfaces';

/**
 * Dataset mock para la Fase 1: permite probar toda la UX sin credenciales.
 * - Covers: picsum.photos (semilla estable por canción).
 * - Previews: MP3s públicos de SoundHelix. Dos canciones van sin preview
 *   para ejercitar el fallback de iTunes (PreviewResolver).
 */

const SOUNDHELIX_BASE = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-';
const coverUrl = (seed: string) => `https://picsum.photos/seed/${seed}/600/600`;

interface TrackSeed {
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  soundhelix?: number;
}

const TRACK_SEEDS: TrackSeed[] = [
  { title: 'Neon Sunrise', artist: 'Aurora Vale', album: 'Daylight EP', durationMs: 222_000, soundhelix: 1 },
  { title: 'Midnight Drive', artist: 'The Lumen', album: 'City Lights', durationMs: 245_000, soundhelix: 2 },
  { title: 'Sage & Gold', artist: 'Valle Verde', album: 'Botánica', durationMs: 198_000, soundhelix: 3 },
  { title: 'Paper Planes', artist: 'Kite Season', album: 'Aerials', durationMs: 176_000, soundhelix: 4 },
  // Sin preview: pone a prueba el fallback de iTunes.
  { title: 'Café con Lluvia', artist: 'Marta Solar', album: 'Domingos', durationMs: 213_000 },
  { title: 'Static Hearts', artist: 'Neon Harbor', album: 'Frequencies', durationMs: 260_000, soundhelix: 5 },
  { title: 'Bosque de Pinos', artist: 'Valle Verde', album: 'Botánica', durationMs: 185_000, soundhelix: 6 },
  { title: 'Runaway Signal', artist: 'The Lumen', album: 'City Lights', durationMs: 227_000, soundhelix: 7 },
  { title: 'Luna de Miel', artist: 'Marta Solar', album: 'Domingos', durationMs: 252_000, soundhelix: 8 },
  { title: 'Silver Wave', artist: 'Aurora Vale', album: 'Daylight EP', durationMs: 209_000, soundhelix: 9 },
  { title: 'Corriente', artist: 'Río Abajo', album: 'Mareas', durationMs: 168_000, soundhelix: 10 },
  // Sin preview: segundo caso de fallback.
  { title: 'Glass Horizon', artist: 'Neon Harbor', album: 'Frequencies', durationMs: 238_000 },
  { title: 'Velvet Static', artist: 'Kite Season', album: 'Aerials', durationMs: 191_000, soundhelix: 11 },
  { title: 'Amanecer Lento', artist: 'Río Abajo', album: 'Mareas', durationMs: 241_000, soundhelix: 12 },
  { title: 'Echo Chamber', artist: 'Static Bloom', album: 'Reverberación', durationMs: 155_000, soundhelix: 13 },
  { title: 'Polaroid Summer', artist: 'Static Bloom', album: 'Reverberación', durationMs: 204_000, soundhelix: 14 },
];

const DISCOVERY_SEEDS: TrackSeed[] = [
  { title: 'Sunset Boulevard', artist: 'Aurora Vale', album: 'Daylight EP', durationMs: 216_000, soundhelix: 15 },
  { title: 'Ciudad Fantasma', artist: 'The Lumen', album: 'City Lights', durationMs: 248_000, soundhelix: 16 },
  { title: 'Té de Jazmín', artist: 'Marta Solar', album: 'Domingos', durationMs: 182_000, soundhelix: 1 },
  { title: 'Wildflower', artist: 'Kite Season', album: 'Aerials', durationMs: 225_000, soundhelix: 2 },
  { title: 'Marea Alta', artist: 'Río Abajo', album: 'Mareas', durationMs: 237_000, soundhelix: 3 },
  { title: 'Prisma', artist: 'Static Bloom', album: 'Reverberación', durationMs: 199_000, soundhelix: 4 },
];

interface PlaylistSeed {
  id: string;
  name: string;
  description: string;
  /** Índices (1-based) sobre TRACK_SEEDS. */
  trackNumbers: number[];
}

const PLAYLIST_SEEDS: PlaylistSeed[] = [
  {
    id: 'pl-road-trip',
    name: 'Road Trip 🚗',
    description: 'Para cantar en la carretera',
    trackNumbers: [1, 2, 4, 7, 10, 13, 15, 16],
  },
  {
    id: 'pl-favoritas-2026',
    name: 'Favoritas 2026',
    description: 'Lo mejor del año hasta ahora',
    trackNumbers: [1, 3, 5, 6, 8, 9, 11, 14, 15, 2],
  },
  {
    id: 'pl-gym-power',
    name: 'Gym Power',
    description: 'Energía para entrenar',
    trackNumbers: [2, 6, 8, 10, 12, 15],
  },
  {
    id: 'pl-chill-sunday',
    name: 'Chill Sunday',
    description: 'Calma para el domingo',
    trackNumbers: [3, 5, 7, 9, 14],
  },
];

function buildTrack(
  seed: TrackSeed,
  index: number,
  provider: MusicProvider,
  idPrefix: string
): Track {
  const slug = seed.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return {
    id: `${idPrefix}-${index}-${slug}`,
    title: seed.title,
    artist: seed.artist,
    album: seed.album,
    coverUrl: coverUrl(`track-${idPrefix}-${index}`),
    previewUrl: seed.soundhelix ? `${SOUNDHELIX_BASE}${seed.soundhelix}.mp3` : null,
    durationMs: seed.durationMs,
    provider,
  };
}

export function buildMockLibrary(provider: MusicProvider): {
  playlists: PlaylistSummary[];
  tracksByPlaylist: Map<string, Track[]>;
  discoveryPool: Track[];
} {
  const tracks = TRACK_SEEDS.map((seed, i) => buildTrack(seed, i + 1, provider, 'trk'));
  const discoveryPool = DISCOVERY_SEEDS.map((seed, i) =>
    buildTrack(seed, i + 1, provider, 'new')
  );

  const playlists: PlaylistSummary[] = PLAYLIST_SEEDS.map((seed) => {
    const items = seed.trackNumbers
      .map((n) => tracks[n - 1])
      .filter((t): t is Track => Boolean(t));
    return {
      id: seed.id,
      name: seed.name,
      description: seed.description,
      coverUrl: coverUrl(`playlist-${seed.id}`),
      trackCount: items.length,
      provider,
    };
  });

  const tracksByPlaylist = new Map<string, Track[]>(
    PLAYLIST_SEEDS.map((seed) => [
      seed.id,
      seed.trackNumbers
        .map((n) => tracks[n - 1])
        .filter((t): t is Track => Boolean(t))
        .map((track) => ({ ...track, playlistItemId: `${seed.id}:${track.id}` })),
    ])
  );

  return { playlists, tracksByPlaylist, discoveryPool };
}
