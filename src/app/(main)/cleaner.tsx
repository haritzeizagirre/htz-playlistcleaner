import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Check, Headphones, Music2, Undo2, X } from 'lucide-react-native';

import {
  HtzAlert,
  HtzBadge,
  HtzButton,
  HtzCard,
  HtzChip,
  HtzProgressBar,
  HtzSpinner,
  htzTokens,
} from '@haritzeiza/htz-react/native';

import { AudioPlayer } from '@/components/AudioPlayer';
import { CardDeck, type CardDeckHandle } from '@/components/CardDeck';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { UndoSnackbar } from '@/components/UndoSnackbar';
import { YouTubeAudioPlayer } from '@/components/YouTubeAudioPlayer';
import { resolvePreviewUrl } from '@/services/audio/previewResolver';
import { soundManager } from '@/services/audio/soundManager';
import { getMusicService } from '@/services/registry';
import { useAuthStore } from '@/store/useAuthStore';
import { useCleanerStore } from '@/store/useCleanerStore';
import { humanizeMusicError } from '@/utils/errors';
import { providerLabel } from '@/utils/format';

/** Un ID de vídeo real de YouTube tiene 11 caracteres (los mocks no). */
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export default function CleanerScreen() {
  const params = useLocalSearchParams<{ playlistId?: string; playlistName?: string }>();
  const playlistId = typeof params.playlistId === 'string' ? params.playlistId : undefined;
  const playlistNameParam =
    typeof params.playlistName === 'string' ? params.playlistName : 'Playlist';

  const provider = useAuthStore((state) => state.provider);
  const mode = useAuthStore((state) => state.mode) ?? 'demo';

  // Suscripciones granulares: evita re-renders de esta pantalla cuando cambian
  // partes del store que no usa (p. ej. la pantalla de resumen de debajo).
  const queue = useCleanerStore((state) => state.queue);
  const kept = useCleanerStore((state) => state.kept);
  const removed = useCleanerStore((state) => state.removed);
  const history = useCleanerStore((state) => state.history);
  const playlistName = useCleanerStore((state) => state.playlistName);
  const startSession = useCleanerStore((state) => state.startSession);
  const keep = useCleanerStore((state) => state.keep);
  const remove = useCleanerStore((state) => state.remove);
  const undo = useCleanerStore((state) => state.undo);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [preview, setPreview] = useState<{ trackId: string; url: string | null } | null>(null);
  const [ytFailedTrackId, setYtFailedTrackId] = useState<string | null>(null);
  /** El usuario prefiere escuchar la canción completa (iframe) en vez del preview. */
  const [preferFullSong, setPreferFullSong] = useState(false);
  const [isFocused, setIsFocused] = useState(true);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const deckRef = useRef<CardDeckHandle>(null);

  // Carga la playlist y arranca la sesión de limpieza.
  useEffect(() => {
    if (!playlistId || !provider) return;
    let cancelled = false;

    (async () => {
      try {
        const tracks = await getMusicService(provider, mode).getPlaylistTracks(playlistId);
        if (cancelled) return;
        startSession(playlistId, playlistNameParam, tracks);
        setLoading(false);
      } catch (cause) {
        if (!cancelled) {
          const detail = cause instanceof Error ? cause.message : String(cause);
          console.warn('[cleaner] getPlaylistTracks falló:', detail);
          setLoadError(`No se pudieron cargar las canciones: ${humanizeMusicError(detail)}`);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playlistId, provider, mode, playlistNameParam, startSession, reloadKey]);

  // Pausa el audio al abandonar la pantalla.
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => {
        setIsFocused(false);
        soundManager.pause();
      };
    }, [])
  );

  const currentTrack = queue[0];
  const currentTrackId = currentTrack?.id ?? null;
  const previewReady = preview !== null && preview.trackId === currentTrackId;
  const previewUrl = previewReady && preview ? preview.url : null;
  const previewLoading = Boolean(currentTrack) && !previewReady;

  const isRealYouTubeTrack =
    currentTrack?.provider === 'youtube' && YOUTUBE_VIDEO_ID_PATTERN.test(currentTrack.id);
  const canUseYouTubePlayer = isRealYouTubeTrack && currentTrack?.id !== ytFailedTrackId;
  // El resolver multi-fuente (Deezer/iTunes) no encontró nada: el iframe es el último recurso.
  const resolverFoundNothing = previewReady && !previewUrl;
  // El iframe se usa en dos casos: último recurso (sin preview) o petición explícita
  // del usuario de escuchar la canción completa.
  const useYouTubePlayer = canUseYouTubePlayer && (preferFullSong || resolverFoundNothing);
  // El toggle no aparece cuando el resolver se quedó sin preview: ahí el iframe es
  // la única opción y no hay vuelta al preview.
  const showFullSongToggle = canUseYouTubePlayer && !resolverFoundNothing;

  // Reproducción automática del audio de la tarjeta visible.
  useEffect(() => {
    if (!isFocused || !currentTrack) return;

    let cancelled = false;
    const trackId = currentTrack.id;

    // Con el iframe activo el MP3 calla: el reproductor de YouTube gestiona su
    // audio. Aun así se resuelve el preview en segundo plano para saber si
    // existe y poder ofrecer el toggle de "volver al preview".
    if (useYouTubePlayer) {
      soundManager.pause();
    }

    (async () => {
      const url = await resolvePreviewUrl(currentTrack);
      if (cancelled) return;
      setPreview({ trackId, url });
      if (useYouTubePlayer) return;
      if (url) {
        soundManager.load(url);
      } else {
        soundManager.pause();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentTrack, isFocused, useYouTubePlayer]);

  // Mantiene listas las próximas tarjetas: resuelve su preview y deja el audio
  // precargado, de modo que al pasar de canción el sonido arranca al instante
  // (sin el parón del búfer inicial). Los fallos también se cachean.
  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;

    (async () => {
      const upcoming = queue.slice(1, 5);
      const urls = await Promise.all(
        upcoming.map((track) => resolvePreviewUrl(track).catch(() => null))
      );
      if (cancelled) return;
      soundManager.syncPreloads(
        urls.filter((url): url is string => Boolean(url)).slice(0, 2)
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [isFocused, queue]);

  /** Decisión del deck; estable para no re-crear gestos en cada render. */
  const handleDecision = useCallback(
    (action: 'keep' | 'remove') => {
      if (action === 'keep') keep();
      else remove();
    },
    [keep, remove]
  );

  const lastRecord = history[history.length - 1];
  const showUndo = lastRecord?.action === 'remove' && dismissedAt !== history.length && !loading;
  const snackbarTrack = showUndo ? lastRecord.track : null;

  const total = queue.length + kept.length + removed.length;
  const reviewed = kept.length + removed.length;
  const progress = total > 0 ? (reviewed / total) * 100 : 0;
  const finished = !loading && !loadError && total > 0 && queue.length === 0;

  const handleBack = () => {
    soundManager.pause();
    router.back();
  };

  /** Ir al resumen con lo pendiente (sin necesidad de revisar toda la cola). */
  const openSummary = () => {
    if (!playlistId) return;
    soundManager.pause();
    router.push({
      pathname: '/(main)/summary',
      params: { playlistId, playlistName: playlistName || playlistNameParam },
    });
  };

  const handleRetry = () => {
    setLoading(true);
    setLoadError(null);
    setReloadKey((key) => key + 1);
  };

  if (!playlistId || !provider) {
    return (
      <Screen>
        <ScreenHeader title="Limpieza" onBack={() => router.back()} />
        <View style={styles.padded}>
          <HtzAlert variant="error" title="Playlist no especificada">
            Vuelve al inicio y elige una playlist para limpiar.
          </HtzAlert>
          <HtzButton variant="outline" onPress={() => router.replace('/(main)')}>
            Ir a mis playlists
          </HtzButton>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title={playlistName || playlistNameParam}
        subtitle={provider ? providerLabel(provider) : undefined}
        onBack={handleBack}
        right={<HtzChip label={`${queue.length} por revisar`} variant="secondary" />}
      />

      <View style={styles.progressBox}>
        <HtzProgressBar value={progress} height={6} />
        <Text style={styles.progressText}>
          {reviewed} / {total} revisadas
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <HtzSpinner size="lg" />
          <Text style={styles.centerText}>Preparando las tarjetas...</Text>
        </View>
      ) : loadError ? (
        <View style={styles.padded}>
          <HtzAlert variant="error" title="Algo ha fallado">
            {loadError}
          </HtzAlert>
          <HtzButton variant="outline" onPress={handleRetry}>
            Reintentar
          </HtzButton>
        </View>
      ) : finished ? (
        <View style={styles.padded}>
          <HtzAlert variant="success" title="¡Playlist revisada!">
            Has terminado de repasar todas las canciones.
          </HtzAlert>
          <HtzCard elevated style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <HtzBadge variant="success" label={`${kept.length} CONSERVADAS`} />
              <HtzBadge variant="warning" label={`${removed.length} PARA ELIMINAR`} />
            </View>
          </HtzCard>
          <HtzButton variant="primary" size="lg" onPress={openSummary}>
            {removed.length === 0
              ? 'Finalizar sesión'
              : removed.length === 1
                ? 'Revisar 1 eliminación'
                : `Revisar ${removed.length} eliminaciones`}
          </HtzButton>
          <HtzButton variant="ghost" onPress={handleBack}>
            Volver a mis playlists
          </HtzButton>
        </View>
      ) : (
        <>
          <View style={styles.deckContainer}>
            <CardDeck ref={deckRef} tracks={queue} onDecision={handleDecision} />
            <UndoSnackbar
              track={snackbarTrack}
              onUndo={() => undo()}
              onDismiss={() => setDismissedAt(history.length)}
            />
          </View>

          <View style={styles.playerBox}>
            {/* El hueco se reserva siempre que el iframe sea posible: el botón
                aparece/desaparece según la canción y el deck no debe moverse. */}
            {canUseYouTubePlayer ? (
              <View style={styles.fullSongToggle}>
                {showFullSongToggle ? (
                  <HtzButton
                    variant="ghost"
                    size="sm"
                    accessibilityLabel={
                      preferFullSong
                        ? 'Volver al preview de 30 segundos'
                        : 'Escuchar la canción completa'
                    }
                    onPress={() => setPreferFullSong((value) => !value)}
                    icon={
                      preferFullSong ? (
                        <Music2 size={16} color={htzTokens.colors.onSurfaceVariant} />
                      ) : (
                        <Headphones size={16} color={htzTokens.colors.onSurface} />
                      )
                    }
                  >
                    {preferFullSong ? 'Volver al preview de 30 s' : 'Escuchar la canción completa'}
                  </HtzButton>
                ) : null}
              </View>
            ) : null}

            {useYouTubePlayer && currentTrack ? (
              <YouTubeAudioPlayer
                key={currentTrack.id}
                videoId={currentTrack.id}
                active={isFocused}
                // Petición explícita del usuario: empieza en 0 (sin saltar la intro).
                skipIntro={!preferFullSong}
                onUnavailable={() => setYtFailedTrackId(currentTrack.id)}
              />
            ) : (
              <AudioPlayer previewUrl={previewUrl} loading={previewLoading} />
            )}
          </View>

          <View style={styles.controls}>
            <HtzButton
              variant="secondary"
              accessibilityLabel="Eliminar canción"
              onPress={() => deckRef.current?.swipeLeft()}
              style={[styles.circleButton, styles.removeButton]}
              icon={<X size={26} color={htzTokens.colors.error} />}
            />
            <HtzButton
              variant="ghost"
              accessibilityLabel="Deshacer última decisión"
              disabled={history.length === 0}
              onPress={() => undo()}
              style={styles.circleButton}
              icon={<Undo2 size={24} color={htzTokens.colors.onSurface} />}
            />
            <HtzButton
              variant="primary"
              accessibilityLabel="Mantener canción"
              onPress={() => deckRef.current?.swipeRight()}
              style={[styles.circleButton, styles.keepButton]}
              icon={<Check size={30} color={htzTokens.colors.onPrimary} />}
            />
          </View>

          <View style={styles.finishBox}>
            <HtzButton variant="outline" size="sm" onPress={openSummary}>
              {removed.length === 0
                ? 'Finalizar sesión'
                : removed.length === 1
                  ? 'Finalizar ahora · 1 para eliminar'
                  : `Finalizar ahora · ${removed.length} para eliminar`}
            </HtzButton>
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: htzTokens.spacing.sm,
    paddingHorizontal: htzTokens.spacing.md,
    paddingBottom: htzTokens.spacing.sm,
  },
  progressText: {
    fontSize: 11,
    color: htzTokens.colors.onSurfaceVariant,
    fontVariant: ['tabular-nums'],
  },
  deckContainer: {
    flex: 1,
    paddingHorizontal: htzTokens.spacing.md,
  },
  playerBox: {
    paddingHorizontal: htzTokens.spacing.md,
    paddingTop: htzTokens.spacing.sm,
  },
  fullSongToggle: {
    alignItems: 'center',
    justifyContent: 'center',
    // Hueco fijo (botón sm 32 + separación): reserva el espacio aunque el
    // botón esté oculto, para que el deck no cambie de alto.
    height: 36,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: htzTokens.spacing.lg,
    paddingVertical: htzTokens.spacing.md,
    paddingHorizontal: htzTokens.spacing.md,
  },
  finishBox: {
    alignItems: 'center',
    paddingBottom: htzTokens.spacing.md,
  },
  circleButton: {
    width: 60,
    height: 60,
    borderRadius: htzTokens.radius.full,
    paddingHorizontal: 0,
  },
  removeButton: {
    borderColor: htzTokens.colors.error,
  },
  keepButton: {
    width: 68,
    height: 68,
    borderRadius: htzTokens.radius.full,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: htzTokens.spacing.md,
  },
  centerText: {
    fontSize: 14,
    color: htzTokens.colors.onSurfaceVariant,
  },
  padded: {
    paddingHorizontal: htzTokens.spacing.md,
    paddingTop: htzTokens.spacing.sm,
    gap: htzTokens.spacing.md,
  },
  summaryCard: {
    gap: htzTokens.spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: htzTokens.spacing.sm,
    flexWrap: 'wrap',
  },
});
