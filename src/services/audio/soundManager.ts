import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

/**
 * Singleton de reproducción de previews (SDK 57 usa expo-audio; expo-av
 * ya no existe). Un único AudioPlayer compartido por toda la app:
 * cambiar de track llama a `replace()` sin liberar el reproductor.
 *
 * La UI puede suscribirse con `useAudioPlayerStatus(soundManager.getPlayer())`.
 */
class SoundManager {
  private player: AudioPlayer | null = null;
  private currentUrl: string | null = null;

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
      this.currentUrl = url;
      player.replace(url);
    }
    if (autoplay) player.play();
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
  }
}

export const soundManager = new SoundManager();
