import type { Track } from '../interfaces';

/**
 * Resolución de previews de audio multi-fuente.
 *
 * Problema: los títulos de YouTube son ruido puro
 * ("Alex Skrindo - Jumbo | House | NCS - Copyright Free Music") y el "artista"
 * es el canal ("NoCopyrightSounds", "Unknown Brain - Topic"). Buscar eso tal
 * cual en un catálogo no encuentra nada.
 *
 * Estrategia por canción (se queda con el primer acierto):
 *  1. Limpia artista/título y extrae "Artista - Canción" del título si existe.
 *  2. Deezer (búsqueda precisa) → Deezer (suelta) → iTunes.
 *
 * Sin claves de API y con caché en memoria (incluidos los fallos).
 */

const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';
const DEEZER_SEARCH_URL = 'https://api.deezer.com/search';

export interface SearchTerms {
  artist: string;
  title: string;
}

const cache = new Map<string, string | null>();
/** Búsquedas en curso: si se pide el mismo track dos veces a la vez, se comparte. */
const inFlight = new Map<string, Promise<string | null>>();

// ------------------------------------------------------------------ limpieza

const BRACKET_NOISE =
  /\b(official|lyric|lyrics|audio|video|visualizer|music video|hd|hq|4k|8k|remaster(ed)?|live|ncs|nocopyrightsounds|copyright free|free download|no copyright|out now|premiere)\b/i;

/** "Unknown Brain - Topic" → "Unknown Brain"; "XVEVO" → "X". */
export function cleanArtist(raw: string): string {
  return raw
    .replace(/\s*-\s*topic\s*$/i, '')
    .replace(/vevo\s*$/i, '')
    .replace(/\s*-\s*official\s*(music\s*)?(channel|audio|video)?\s*$/i, '')
    .trim();
}

/** Limpia títulos de YouTube: corta en "|", quita corchetes ruidosos. */
export function cleanTitle(raw: string): string {
  let title = raw.trim();

  const segments = title.split('|').map((segment) => segment.trim()).filter(Boolean);
  if (segments.length > 1) {
    title = segments[0];
  }
  title = title.replace(/\s*-\s*(copyright free music|free music|ncs)\b.*$/i, '');

  title = title.replace(/[([][^)\]]*[)\]]/g, (match) => {
    const inner = match.slice(1, -1);
    return BRACKET_NOISE.test(inner) ? ' ' : match;
  });

  return title.replace(/\s{2,}/g, ' ').trim();
}

/** Último recurso: fuera TODOS los paréntesis/corchetes ("Where You Are (w/ Jex)" → "Where You Are"). */
export function stripAllBrackets(title: string): string {
  return title
    .replace(/[([][^)\]]*[)\]]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Parte común de "… | …" que suele contener "Artista - Canción". */
function headSegment(raw: string): string {
  return raw.split('|')[0]?.trim() ?? '';
}

/** Si el título es "Artista - Canción …", devuelve el lado izquierdo. */
export function artistFromTitle(raw: string): string | null {
  const match = headSegment(raw).match(/^(.+?)\s+-\s+(.+)$/);
  if (!match) return null;
  const candidate = match[1].trim();
  return candidate.length > 0 && candidate.length <= 40 ? candidate : null;
}

/** Si el título es "Artista - Canción …", devuelve el lado derecho. */
export function titleFromTitle(raw: string): string | null {
  const match = headSegment(raw).match(/^(.+?)\s+-\s+(.+)$/);
  if (!match) return null;
  const candidate = match[2].trim();
  return candidate.length > 0 ? candidate : null;
}

/** Candidatos de búsqueda en orden de prioridad. */
export function buildSearchTerms(track: Track): SearchTerms[] {
  const candidates: SearchTerms[] = [];
  const add = (artist: string, title: string) => {
    const clean = { artist: artist.trim(), title: title.trim() };
    if (!clean.artist || !clean.title) return;
    const duplicate = candidates.some(
      (item) =>
        item.artist.toLowerCase() === clean.artist.toLowerCase() &&
        item.title.toLowerCase() === clean.title.toLowerCase()
    );
    if (!duplicate) candidates.push(clean);
  };

  const titleArtist = artistFromTitle(track.title);
  const titleSong = titleFromTitle(track.title);
  const channel = cleanArtist(track.artist);
  // La canción ya sin el prefijo "Artista - " (si estaba en el título).
  const cleanedSong = titleSong ? cleanTitle(titleSong) : cleanTitle(track.title);
  const bareSong = stripAllBrackets(cleanedSong);

  // 1) "Artista - Canción" sacado del propio título (el caso NCS).
  if (titleArtist) add(titleArtist, cleanedSong);
  // 2) Canal limpio (sin "- Topic") + canción limpia.
  add(channel, cleanedSong);
  // 3) Sin paréntesis de ningún tipo ("Where You Are (w/ Jex)" → "Where You Are").
  if (bareSong !== cleanedSong) {
    add(channel, bareSong);
    if (titleArtist) add(titleArtist, bareSong);
  }
  // 4) Último recurso: canal limpio + título original (búsquedas sueltas).
  add(channel, track.title);

  return candidates;
}

// ------------------------------------------------------------------ búsquedas

interface DeezerResult {
  preview?: string;
}

async function searchDeezer(
  artist: string,
  title: string,
  precise: boolean
): Promise<string | null> {
  const q = precise ? `artist:"${artist}" track:"${title}"` : `${artist} ${title}`;
  const response = await fetch(`${DEEZER_SEARCH_URL}?q=${encodeURIComponent(q)}&limit=1`);
  if (!response.ok) throw new Error(`Deezer respondió ${response.status}`);
  const payload = (await response.json()) as { data?: DeezerResult[] };
  const preview = payload.data?.[0]?.preview;
  return preview && preview.length > 0 ? preview : null;
}

async function searchItunes(artist: string, title: string): Promise<string | null> {
  const term = encodeURIComponent(`${artist} ${title}`);
  const response = await fetch(`${ITUNES_SEARCH_URL}?term=${term}&media=music&entity=song&limit=1`);
  if (!response.ok) throw new Error(`iTunes respondió ${response.status}`);
  const payload = (await response.json()) as { results?: { previewUrl?: string }[] };
  const preview = payload.results?.[0]?.previewUrl;
  return preview && preview.length > 0 ? preview : null;
}

/** Devuelve una URL de preview MP3 (30 s) o null si ninguna fuente la tiene. */
export async function resolvePreviewUrl(track: Track): Promise<string | null> {
  if (track.previewUrl) return track.previewUrl;

  const key = `${track.title.toLowerCase()}|${track.artist.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const running = inFlight.get(key);
  if (running) return running;

  const promise = searchAllSources(track)
    .then((url) => {
      cache.set(key, url);
      return url;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

/** Recorre las fuentes en orden: Deezer (precisa → suelta) y luego iTunes. */
async function searchAllSources(track: Track): Promise<string | null> {
  for (const terms of buildSearchTerms(track)) {
    try {
      const precise = await searchDeezer(terms.artist, terms.title, true);
      if (precise) return precise;
    } catch {
      // Sin red o sin respuesta: se prueba la siguiente fuente.
    }

    try {
      const loose = await searchDeezer(terms.artist, terms.title, false);
      if (loose) return loose;
    } catch {
      // Siguiente.
    }

    try {
      const itunes = await searchItunes(terms.artist, terms.title);
      if (itunes) return itunes;
    } catch {
      // Siguiente.
    }
  }

  return null;
}

export function clearPreviewCache(): void {
  cache.clear();
  inFlight.clear();
}
