import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import YoutubeIframe, {
  PLAYER_STATES,
  type YoutubeIframeRef,
} from 'react-native-youtube-iframe';
import { FastForward, Pause, Play, Rewind } from 'lucide-react-native';

import {
  HtzButton,
  HtzCard,
  htzTokens,
} from '@haritzeiza/htz-react/native';

import { SeekBar } from '@/components/SeekBar';
import { PLAYER_CARD_MIN_HEIGHT } from '@/utils/constants';
import { formatSeconds } from '@/utils/format';

/**
 * Reproductor de audio de YouTube para las tarjetas de YouTube Music.
 *
 * - Usa la IFrame API dentro de un WebView (react-native-youtube-iframe), por lo
 *   que suena el vídeo real aunque no exista preview MP3.
 * - El reproductor vive oculto (200×200, el mínimo recomendado por la API) y los
 *   controles visibles son los del design system.
 * - Salta la intro (primeros 30 s) en pistas largas cuando actúa de último
 *   recurso; si el usuario pide la canción completa, empieza en 0 (`skipIntro`).
 * - Si el vídeo no se puede incrustar (o YouTube lo rechaza), avisa con
 *   `onUnavailable` para que la pantalla vuelva al preview y pueda reintentar.
 *
 * Nota: la pantalla debe montarlo con `key={videoId}` para reiniciar el estado
 * en cada canción (evita efectos de reseteo).
 */

const PLAYER_SIZE = 200;
const SEEK_STEP_SECONDS = 5;
const INTRO_SKIP_SECONDS = 30;
const INTRO_SKIP_MIN_DURATION = 90;
const POLL_INTERVAL_MS = 500;

/**
 * Origen con el que se carga el HTML local del player.
 *
 * Desde 2025 YouTube rechaza los embeds sin Origin/Referer válido (error 153
 * «Video Player Configuration Error»). Con `useLocalHTML` a secas la página
 * queda con origen opaco (about:blank) y el vídeo no llega a reproducirse;
 * con `baseUrlOverride` adopta este origen y la reproducción se acepta.
 */
const PLAYER_BASE_URL = 'https://playlist-cleaner.app';

interface YouTubeAudioPlayerProps {
  videoId: string;
  active: boolean;
  /**
   * Salta los primeros 30 s en vídeos largos. Por defecto sí (modo último
   * recurso); con `false` la reproducción empieza en 0.
   */
  skipIntro?: boolean;
  onUnavailable: (reason: string) => void;
  /**
   * Estado play/pausa controlado por el padre (pantalla de descubrimiento,
   * que tiene botones de reproducción propios). Si no se indica, el
   * reproductor gestiona su propio play/pausa.
   */
  playing?: boolean;
  onPlayingChange?: (playing: boolean) => void;
}

export function YouTubeAudioPlayer({
  videoId,
  active,
  skipIntro = true,
  onUnavailable,
  playing: playingProp,
  onPlayingChange,
}: YouTubeAudioPlayerProps) {
  const playerRef = useRef<YoutubeIframeRef | null>(null);
  const seededIntroRef = useRef(false);
  /** Temporizador del reenganche tras acabar una canción (se limpia al desmontar). */
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Intención del usuario cuando el play/pausa no lo controla el padre. */
  const [internalPlaying, setInternalPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const playing = playingProp ?? internalPlaying;
  const setPlaying = useCallback(
    (value: boolean) => {
      if (playingProp === undefined) {
        setInternalPlaying(value);
      }
      onPlayingChange?.(value);
    },
    [playingProp, onPlayingChange]
  );

  const shouldPlay = active && playing;

  // La librería no expone onProgress: se sondea el tiempo con el ref.
  useEffect(() => {
    if (!shouldPlay) return;
    const interval = setInterval(() => {
      const ref = playerRef.current;
      if (!ref) return;
      Promise.all([ref.getCurrentTime(), ref.getDuration()])
        .then(([time, total]) => {
          setCurrentTime(time || 0);
          setDuration(total || 0);
          // Salta la intro una sola vez por vídeo, en pistas largas.
          if (skipIntro && !seededIntroRef.current && total > INTRO_SKIP_MIN_DURATION) {
            seededIntroRef.current = true;
            ref.seekTo(INTRO_SKIP_SECONDS, true);
            setCurrentTime(INTRO_SKIP_SECONDS);
          }
        })
        .catch(() => {
          // El player aún no está listo; se reintenta en el siguiente sondeo.
        });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [shouldPlay, skipIntro]);

  const handleStateChange = useCallback(
    (state: PLAYER_STATES) => {
      if (state === PLAYER_STATES.ENDED) {
        // Las canciones se repiten mientras la tarjeta está visible: vuelve al
        // inicio y reanuda. Togglea `play` porque el postMessage de play/pausa
        // no basta (regresión 2.4.x; ver patches/react-native-youtube-iframe).
        playerRef.current?.seekTo(0, true);
        setCurrentTime(0);
        setPlaying(false);
        resumeTimeoutRef.current = setTimeout(() => setPlaying(true), 200);
      }
    },
    [setPlaying]
  );

  // Limpia el temporizador de reenganche si la tarjeta se desmonta entre medias.
  useEffect(
    () => () => {
      if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    },
    []
  );

  const handleError = useCallback(
    (error: string) => {
      // La librería no mapea códigos recientes (p. ej. el 153): llegan como undefined.
      console.warn('[youtube-player] error del iframe:', error ?? '(código sin mapear)');
      onUnavailable(error ?? 'unknown');
    },
    [onUnavailable]
  );

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <>
      {/* Reproductor oculto (la IFrame API exige un viewport mínimo de 200×200). */}
      <View style={styles.hiddenPlayer} pointerEvents="none">
        <YoutubeIframe
          ref={playerRef}
          videoId={videoId}
          height={PLAYER_SIZE}
          width={PLAYER_SIZE}
          play={shouldPlay}
          volume={100}
          forceAndroidAutoplay
          useLocalHTML
          baseUrlOverride={PLAYER_BASE_URL}
          initialPlayerParams={{
            controls: false,
            loop: true,
            rel: false,
            iv_load_policy: 3,
            preventFullScreen: true,
          }}
          webViewProps={{
            mediaPlaybackRequiresUserGesture: false,
            allowsInlineMediaPlayback: true,
            androidLayerType: 'hardware',
          }}
          onChangeState={handleStateChange}
          onError={handleError}
        />
      </View>

      <HtzCard elevated style={styles.card}>
        <View style={styles.row}>
          <View style={styles.timeBar}>
            <SeekBar
              value={progress}
              duration={duration}
              onSeek={(seconds) => {
                playerRef.current?.seekTo(seconds, true);
                // Respuesta inmediata de la UI; el sondeo confirmará el tiempo real.
                setCurrentTime(seconds);
              }}
              accessibilityLabel="Ir a un punto de la canción"
            />
          </View>
          <View style={styles.controls}>
            <HtzButton
              variant="ghost"
              size="sm"
              accessibilityLabel="Retroceder 5 segundos"
              onPress={() =>
                playerRef.current?.seekTo(Math.max(0, currentTime - SEEK_STEP_SECONDS), true)
              }
              icon={<Rewind size={18} color={htzTokens.colors.onSurface} />}
            />
            <HtzButton
              variant="primary"
              size="md"
              accessibilityLabel={shouldPlay ? 'Pausar' : 'Reproducir'}
              onPress={() => setPlaying(!playing)}
              style={styles.playButton}
              icon={
                shouldPlay ? (
                  <Pause size={22} color={htzTokens.colors.onPrimary} />
                ) : (
                  <Play size={22} color={htzTokens.colors.onPrimary} />
                )
              }
            />
            <HtzButton
              variant="ghost"
              size="sm"
              accessibilityLabel="Avanzar 5 segundos"
              onPress={() => playerRef.current?.seekTo(currentTime + SEEK_STEP_SECONDS, true)}
              icon={<FastForward size={18} color={htzTokens.colors.onSurface} />}
            />
          </View>
        </View>

        <View style={styles.belowRow}>
          <Text style={styles.timeText}>{formatSeconds(currentTime)}</Text>
          <Text style={styles.timeText}>Vídeo de YouTube</Text>
          <Text style={styles.timeText}>{formatSeconds(duration)}</Text>
        </View>
      </HtzCard>
    </>
  );
}

const styles = StyleSheet.create({
  hiddenPlayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
    opacity: 0,
    zIndex: -1,
  },
  card: {
    paddingVertical: 12,
    paddingHorizontal: htzTokens.spacing.md,
    gap: 8,
    // Mismo alto que la tarjeta de preview: al alternar entre ellas el deck
    // no cambia de tamaño.
    minHeight: PLAYER_CARD_MIN_HEIGHT,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: htzTokens.spacing.sm,
  },
  timeBar: {
    flex: 1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: htzTokens.spacing.sm,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: htzTokens.radius.full,
    paddingHorizontal: 0,
  },
  belowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    color: htzTokens.colors.onSurfaceVariant,
  },
});
