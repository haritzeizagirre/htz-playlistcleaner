import {
  clearAllPreloadedSources,
  clearPreloadedSource,
  createAudioPlayer,
  preload,
  type AudioPlayer,
} from 'expo-audio';

/**
 * Máximo de descargas de precarga simultáneas. La siguiente canción se
 * descarga sola (las obsoletas no la bloquean) y el límite evita acumular
 * descargas cuando se avanza muy rápido.
 */
const MAX_ACTIVE_PRELOADS = 2;

/**
 * Singleton de reproducción de previews (SDK 57 usa expo-audio; expo-av
 * ya no existe). Un único AudioPlayer compartido por toda la app:
 * cambiar de track llama a `replace()` sin liberar el reproductor.
 *
 * Además mantiene precargadas las próximas canciones con `preload()`: al
 * cambiar de tarjeta `replace()` arranca al instante en vez de esperar al
 * búfer inicial (el "mini parón" que se notaba). La precarga de la siguiente
 * canción va primero y los búferes que ya no van a sonar pronto se liberan.
 *
 * La UI puede suscribirse con `useAudioPlayerStatus(soundManager.getPlayer())`.
 */
class SoundManager {
  private player: AudioPlayer | null = null;
  private currentUrl: string | null = null;
  /** URLs ya precargadas y listas (no incluye la cargada en el player). */
  private preloadedUrls = new Set<string>();
  /** URLs cuya descarga de precarga está en curso. */
  private inFlightUrls = new Set<string>();
  /** Pendientes de precargar, en orden de prioridad. */
  private preloadQueue: string[] = [];
  /** URLs que interesan ahora mismo (para descartar precargas obsoletas). */
  private wantedPreloads: string[] = [];

  getPlayer(): AudioPlayer {
    if (!this.player) {
      const player = createAudioPlayer(null, { updateInterval: 250 });
      player.loop = true;
      this.player = player;
    }
    return this.player;
  }

  get currentSource(): string | null {
    return this.currentUrl;
  }

  /** Carga una URL de preview y (por defecto) la reproduce en bucle. */
  load(url: string, options: { autoplay?: boolean } = {}): void {
    const { autoplay = true } = options;
    const player = this.getPlayer();
    if (this.currentUrl !== url) {
      const previousUrl = this.currentUrl;
      this.currentUrl = url;
      // `replace` consume la precarga (en iOS además sale de la caché).
      this.preloadedUrls.delete(url);
      player.replace(url);
      // La canción anterior ya no va a sonar: libera su búfer.
      if (previousUrl) {
        void clearPreloadedSource(previousUrl).catch(() => undefined);
      }
    }
    if (autoplay) player.play();
  }

  /**
   * Mantiene precargadas las próximas canciones (la primera de `urls` es la
   * siguiente) y libera los búferes que ya no van a sonar pronto.
   */
  syncPreloads(urls: string[]): void {
    const wanted = urls.filter((url) => url && url !== this.currentUrl);
    this.wantedPreloads = wanted;

    this.preloadedUrls.forEach((url) => {
      if (wanted.includes(url)) return;
      this.preloadedUrls.delete(url);
      void clearPreloadedSource(url).catch(() => undefined);
    });

    // Rehace la cola en orden de prioridad, sin duplicar lo que ya está
    // precargado o descargándose.
    const known = new Set(this.inFlightUrls);
    this.preloadQueue = wanted.filter((url) => {
      if (known.has(url) || this.preloadedUrls.has(url)) return false;
      known.add(url);
      return true;
    });

    this.pumpPreloads();
  }

  /**
   * Lanza precargas pendientes. La siguiente canción va siempre sola (todo el
   * ancho de banda); solo se solapa con descargas ya obsoletas, limitadas por
   * `MAX_ACTIVE_PRELOADS`.
   */
  private pumpPreloads(): void {
    for (;;) {
      if (this.inFlightUrls.size >= MAX_ACTIVE_PRELOADS) return;
      const usefulInFlight = [...this.inFlightUrls].some((url) =>
        this.wantedPreloads.includes(url)
      );
      if (usefulInFlight) return;

      const url = this.preloadQueue.shift();
      if (url === undefined) return;
      if (url === this.currentUrl || this.preloadedUrls.has(url)) continue;
      if (!this.wantedPreloads.includes(url)) continue;

      this.startPreload(url);
    }
  }

  private startPreload(url: string): void {
    this.inFlightUrls.add(url);
    void preload(url).then(
      () => {
        this.inFlightUrls.delete(url);
        if (this.wantedPreloads.includes(url) && this.currentUrl !== url) {
          this.preloadedUrls.add(url);
        } else {
          // Dejó de hacer falta durante la descarga: libera el búfer.
          void clearPreloadedSource(url).catch(() => undefined);
        }
        this.pumpPreloads();
      },
      () => {
        // Falló la descarga: se reintentará en el próximo sync si interesa.
        this.inFlightUrls.delete(url);
        this.pumpPreloads();
      }
    );
  }

  play(): void {
    this.player?.play();
  }

  pause(): void {
    this.player?.pause();
  }

  toggle(): void {
    const player = this.getPlayer();
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  }

  /** Salto relativo de ±N segundos desde la posición actual. */
  seekBy(seconds: number): void {
    if (!this.player) return;
    const target = Math.max(0, this.player.currentTime + seconds);
    void this.player.seekTo(target);
  }

  stop(): void {
    if (!this.player) return;
    this.player.pause();
    void this.player.seekTo(0);
  }

  release(): void {
    this.player?.remove();
    this.player = null;
    this.currentUrl = null;
    this.wantedPreloads = [];
    this.preloadQueue = [];
    this.inFlightUrls.clear();
    this.preloadedUrls.clear();
    void clearAllPreloadedSources().catch(() => undefined);
  }
}

export const soundManager = new SoundManager();
