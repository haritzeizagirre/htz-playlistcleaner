import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Check, Undo2, X } from 'lucide-react-native';

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

  const {
    queue,
    kept,
    removed,
    history,
    playlistName,
    startSession,
    keep,
    remove,
    undo,
  } = useCleanerStore();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [preview, setPreview] = useState<{ trackId: string; url: string | null } | null>(null);
  const [ytFailedTrackId, setYtFailedTrackId] = useState<string | null>(null);
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
  // El iframe de YouTube es el ÚLTIMO recurso: solo se usa cuando el resolver
  // multi-fuente (Deezer/iTunes) no encuentra preview y el vídeo es real.
  const resolverFoundNothing = previewReady && !previewUrl;
  const useYouTubePlayer =
    isRealYouTubeTrack && resolverFoundNothing && currentTrack?.id !== ytFailedTrackId;

  // Reproducción automática del audio de la tarjeta visible.
  useEffect(() => {
    if (!isFocused || !currentTrack) return;

    if (useYouTubePlayer) {
      // El reproductor de YouTube gestiona su propio audio.
      soundManager.pause();
      return;
    }

    let cancelled = false;
    const trackId = currentTrack.id;

    (async () => {
      const url = await resolvePreviewUrl(currentTrack);
      if (cancelled) return;
      setPreview({ trackId, url });
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
            <CardDeck
              ref={deckRef}
              tracks={queue}
              onDecision={(action) => (action === 'keep' ? keep() : remove())}
            />
            <UndoSnackbar
              track={snackbarTrack}
              onUndo={() => undo()}
              onDismiss={() => setDismissedAt(history.length)}
            />
          </View>

          <View style={styles.playerBox}>
            {useYouTubePlayer && currentTrack ? (
              <YouTubeAudioPlayer
                key={currentTrack.id}
                videoId={currentTrack.id}
                active={isFocused}
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

          {removed.length > 0 ? (
            <View style={styles.finishBox}>
              <HtzButton variant="outline" size="sm" onPress={openSummary}>
                {removed.length === 1
                  ? 'Finalizar ahora · 1 para eliminar'
                  : `Finalizar ahora · ${removed.length} para eliminar`}
              </HtzButton>
            </View>
          ) : null}
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
