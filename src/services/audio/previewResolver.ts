import type { Track } from '../interfaces';

/**
 * Resolución de previews de audio.
 *
 * 1. Si el track ya trae `previewUrl` (Spotify, mock), se usa tal cual.
 * 2. Si no, se consulta la API pública de iTunes Search (30 s de fragmento,
 *    sin cuenta). Los resultados (incluidos los fallos) se cachean en memoria
 *    para no repetir red por la misma canción.
 */

const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';

interface ITunesResult {
  previewUrl?: string;
}

const cache = new Map<string, string | null>();

function cacheKey(track: Track): string {
  return `${track.title.toLowerCase()}|${track.artist.toLowerCase()}`;
}

export async function resolvePreviewUrl(track: Track): Promise<string | null> {
  if (track.previewUrl) return track.previewUrl;

  const key = cacheKey(track);
  if (cache.has(key)) return cache.get(key) ?? null;

  try {
    const term = encodeURIComponent(`${track.title} ${track.artist}`);
    const response = await fetch(
      `${ITUNES_SEARCH_URL}?term=${term}&media=music&entity=song&limit=1`
    );
    if (!response.ok) throw new Error(`iTunes respondió ${response.status}`);

    const payload = (await response.json()) as { results?: ITunesResult[] };
    const previewUrl = payload.results?.[0]?.previewUrl ?? null;
    cache.set(key, previewUrl);
    return previewUrl;
  } catch {
    // Sin red o sin resultados: se recuerda para no reintentar en bucle.
    cache.set(key, null);
    return null;
  }
}

export function clearPreviewCache(): void {
  cache.clear();
}
