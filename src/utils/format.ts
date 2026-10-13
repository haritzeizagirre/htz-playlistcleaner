/** "3:45" a partir de milisegundos. */
export function formatDurationMs(durationMs: number): string {
  return formatSeconds(Math.round(durationMs / 1000));
}

/** "0:12" a partir de segundos. */
export function formatSeconds(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** "1 canción" / "N canciones". */
export function formatTrackCount(count: number): string {
  return count === 1 ? '1 canción' : `${count} canciones`;
}

/** Etiqueta visible del proveedor musical. */
export function providerLabel(provider: 'spotify' | 'youtube'): string {
  return provider === 'spotify' ? 'SPOTIFY' : 'YT MUSIC';
}
