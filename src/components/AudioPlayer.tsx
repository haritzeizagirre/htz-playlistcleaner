import { StyleSheet, Text, View } from 'react-native';
import { useAudioPlayerStatus } from 'expo-audio';
import { FastForward, Pause, Play, Rewind } from 'lucide-react-native';

import {
  HtzButton,
  HtzCard,
  HtzProgressBar,
  htzTokens,
} from '@haritzeiza/htz-react/native';

import { soundManager } from '@/services/audio/soundManager';
import { formatSeconds } from '@/utils/format';

interface AudioPlayerProps {
  previewUrl: string | null;
  /** Mientras se resuelve el preview del track actual. */
  loading?: boolean;
  disabled?: boolean;
}

/** Reproductor del preview de 30 s: play/pausa, ±5 s y barra de progreso. */
export function AudioPlayer({ previewUrl, loading = false, disabled = false }: AudioPlayerProps) {
  const player = soundManager.getPlayer();
  const status = useAudioPlayerStatus(player);

  const hasPreview = Boolean(previewUrl);
  const duration = Number.isFinite(status.duration) && status.duration > 0 ? status.duration : 0;
  const current = Math.min(status.currentTime ?? 0, duration || status.currentTime || 0);
  const progress = duration > 0 ? (current / duration) * 100 : 0;
  const controlsDisabled = disabled || loading || !hasPreview;

  return (
    <HtzCard elevated style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.time}>{formatSeconds(current)}</Text>

        <View style={styles.controls}>
          <HtzButton
            variant="ghost"
            size="sm"
            disabled={controlsDisabled}
            accessibilityLabel="Retroceder 5 segundos"
            onPress={() => soundManager.seekBy(-5)}
            icon={<Rewind size={18} color={htzTokens.colors.onSurface} />}
          />
          <HtzButton
            variant="primary"
            size="md"
            loading={false}
            disabled={controlsDisabled}
            accessibilityLabel={status.playing ? 'Pausar' : 'Reproducir'}
            onPress={() => soundManager.toggle()}
            style={styles.playButton}
            icon={
              status.playing ? (
                <Pause size={22} color={htzTokens.colors.onPrimary} />
              ) : (
                <Play size={22} color={htzTokens.colors.onPrimary} />
              )
            }
          />
          <HtzButton
            variant="ghost"
            size="sm"
            disabled={controlsDisabled}
            accessibilityLabel="Avanzar 5 segundos"
            onPress={() => soundManager.seekBy(5)}
            icon={<FastForward size={18} color={htzTokens.colors.onSurface} />}
          />
        </View>

        <Text style={styles.time}>{formatSeconds(duration)}</Text>
      </View>

      <HtzProgressBar
        value={hasPreview ? progress : 0}
        variant="primary"
        height={6}
        style={styles.progress}
      />

      {loading ? (
        <Text style={styles.loadingPreview}>Cargando preview...</Text>
      ) : !hasPreview ? (
        <Text style={styles.noPreview}>
          Preview no disponible para este tema. El resto de funciones sigue funcionando.
        </Text>
      ) : null}
    </HtzCard>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: 12,
    paddingHorizontal: htzTokens.spacing.md,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: htzTokens.spacing.sm,
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
  progress: {
    marginTop: 2,
  },
  time: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    color: htzTokens.colors.onSurfaceVariant,
    minWidth: 36,
    textAlign: 'center',
  },
  noPreview: {
    fontSize: 12,
    color: htzTokens.colors.warning,
    textAlign: 'center',
  },
  loadingPreview: {
    fontSize: 12,
    color: htzTokens.colors.outline,
    textAlign: 'center',
  },
});
