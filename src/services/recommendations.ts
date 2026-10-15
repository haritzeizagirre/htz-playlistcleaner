import { artistFromTitle, cleanArtist } from './audio/previewResolver';
import type { Track } from './interfaces';

/**
 * Utilidades compartidas por los adaptadores para la pantalla de
 * "canciones parecidas".
 *
 * Ni YouTube (`relatedToVideoId`, deprecado) ni Spotify (`/recommendations` y
 * `/related-artists`, retirados) exponen ya un endpoint de similares: la
 * aproximación es buscar por artistas. Estas funciones evitan que el resultado
 * lo monopolicen los artistas semilla:
 *
 * - se resuelve el artista real de cada vídeo (el canal puede ser un sello:
 *   "STMPD RCRDS" + "Martin Garrix - Animals" ⇒ Martin Garrix);
 * - además de los artistas de las canciones semilla se buscan sus
 *   colaboradores (feat./ft./with/&/…), tanto del título como del campo de
 *   artistas, y —si hay etiquetas— temas del mismo género;
 * - los huecos se reparten ronda a ronda entre artistas con un tope por
 *   artista: antes, una playlist de un solo autor devolvía casi solo sus
 *   canciones.
 */

/** Separadores de colaboración: "A feat. B", "A & B", "A x B", "A b2b B", "A, B"… */
const ARTIST_SEPARATORS = /\s*(?:,|&|\+|\b(?:feat(?:uring)?|ft|with|b2b)\b\.?|\bx\b)\s*/i;

/** Clave de artista normalizada: "Unknown Brain - Topic" ≡ "Unknown Brain". */
export function artistKey(raw: string): string {
  return cleanArtist(raw).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Clave de título sin ruido de vídeo: "X (Official Video)" ≡ "X". */
export function titleKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[([][^)\]]*[)\]]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Nombres de artistas de un campo o cabecera ("A, B" → ["A", "B"]). */
export function splitArtistNames(raw: string): string[] {
  return raw
    .split(ARTIST_SEPARATORS)
    .map((name) => cleanArtist(name).trim())
    .filter(isPlausibleArtistName);
}

/**
 * Artistas citados en un título: "A feat. B - Canción" → ["A", "B"]. Si el
 * título no tiene la forma "artista - canción" o no hay separadores, [].
 */
export function titleCollaborators(rawTitle: string): string[] {
  const head = artistFromTitle(rawTitle);
  if (!head) return [];
  const names = splitArtistNames(head);
  return names.length > 1 ? names : [];
}

/**
 * Crédito de artista del título ("A - Canción" → "A"), o null. Es el mejor
 * indicio del artista real cuando el canal es un sello o un perfil distinto
 * ("STMPD RCRDS" subiendo "Martin Garrix - Animals").
 */
export function titleArtistCredit(rawTitle: string): string | null {
  const head = artistFromTitle(rawTitle);
  return head && isPlausibleArtistName(head) ? head : null;
}

/**
 * Clave de la canción dentro de un título: igual que `titleKey` pero sin el
 * crédito de artista, de modo que "A - X (Official Video)" y "X" sean la
 * misma canción al buscar duplicados.
 */
export function songKey(rawTitle: string): string {
  const credit = titleArtistCredit(rawTitle);
  if (!credit) return titleKey(rawTitle);
  const rest = rawTitle.slice(credit.length).replace(/^\s*[-–—]\s*/, '');
  return titleKey(rest) || titleKey(rawTitle);
}

function isPlausibleArtistName(name: string): boolean {
  return name.length >= 2 && name.length <= 40 && !/[#@|/]/.test(name) && !/^\d+$/.test(name);
}

/**
 * true si el nombre ya está cubierto por un artista conocido o buscado. Además
 * de la coincidencia exacta se descartan los fragmentos: en "Simon &
 * Garfunkel" los separadores no son una colaboración sino parte del nombre.
 */
export function isCoveredArtistKey(key: string, knownKeys: Iterable<string>): boolean {
  for (const known of knownKeys) {
    if (known === key || known.includes(key)) return true;
  }
  return false;
}

/**
 * Primer artista de un campo con varios ("A, B, C" → "A"). A diferencia de
 * `splitArtistNames` solo corta por comas: en "Simon & Garfunkel" el `&` es
 * parte del nombre, no una colaboración.
 */
export function primaryArtistName(raw: string): string {
  return raw.split(',').map((name) => cleanArtist(name).trim()).find(isPlausibleArtistName) ?? '';
}

/** Palabras de etiquetas que no son un género (ruido de subida o del sello). */
const TAG_STOPWORDS =
  /\b(official|video|music|audio|lyric|lyrics|song|songs|new|hd|hq|4k|8k|live|remix|cover|edit|mix|dj|records?|entertainment|label|visualizer|clip|videos?|tv|radio|premiere|exclusive|playlist|compilation|album|ep|hits?|top|trending|viral|tiktok|shorts|subscribe|channel|fan|fans)\b/i;

function isGenreTag(raw: string): boolean {
  return (
    raw.length >= 3 &&
    raw.length <= 30 &&
    raw.split(/\s+/).length <= 4 &&
    !/^(19|20)\d{2}$/.test(raw) &&
    /^[a-z0-9\u00c0-\u024f][a-z0-9\u00c0-\u024f '&+.-]*$/i.test(raw) &&
    !TAG_STOPWORDS.test(raw)
  );
}

/**
 * Elige etiquetas de género a partir de los tags de los vídeos semilla.
 *
 * Solo valen los temas repetidos en varias canciones (los que aparecen una vez
 * suelen ser el nombre de la canción) y se descartan los que son el propio
 * artista, su sello o el título de una semilla. Con estas etiquetas se hacen
 * búsquedas de género que devuelven artistas que no están en la playlist.
 */
export function pickGenreTags(
  tagLists: string[][],
  options: { knownArtistKeys: Iterable<string>; seedTitles: string[]; limit: number }
): string[] {
  const counts = new Map<string, number>();
  for (const tags of tagLists) {
    // Un tag repetido dentro del mismo vídeo cuenta una sola vez.
    const unique = new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean));
    for (const tag of unique) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const seedTitleKeys = options.seedTitles.map(titleKey);
  const ranked = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);

  const picked: string[] = [];
  for (const [tag] of ranked) {
    if (picked.length >= options.limit) break;
    if (!isGenreTag(tag)) continue;
    if (isCoveredArtistKey(artistKey(tag), options.knownArtistKeys)) continue;
    const tagKey = titleKey(tag);
    if (tagKey && seedTitleKeys.some((title) => title.includes(tagKey))) continue;
    picked.push(tag);
  }

  return picked;
}

export interface RecommendationCandidate {
  track: Track;
  /** Clave de artista (ver artistKey) para agrupar y limitar. */
  key: string;
}

/**
 * Reparte las candidatas entre artistas ronda a ronda (las primeras posiciones
 * mezclan artistas) y limita cuántas se cogen por artista y en total.
 */
export function diversifyByArtist(
  candidates: RecommendationCandidate[],
  options: { maxPerArtist: number; maxTotal: number }
): Track[] {
  const buckets = new Map<string, RecommendationCandidate[]>();
  for (const candidate of candidates) {
    const bucket = buckets.get(candidate.key);
    if (bucket) bucket.push(candidate);
    else buckets.set(candidate.key, [candidate]);
  }

  const picked: Track[] = [];
  for (let round = 0; round < options.maxPerArtist; round++) {
    for (const bucket of buckets.values()) {
      const candidate = bucket[round];
      if (!candidate) continue;
      picked.push(candidate.track);
      if (picked.length >= options.maxTotal) return picked;
    }
  }

  return picked;
}
