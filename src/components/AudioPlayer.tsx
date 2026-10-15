import { StyleSheet, Text, View } from 'react-native';
import { useAudioPlayerStatus } from 'expo-audio';
import { FastForward, Pause, Play, Rewind } from 'lucide-react-native';

import {
  HtzButton,
  HtzCard,
  htzTokens,
} from '@haritzeiza/htz-react/native';

import { SeekBar } from '@/components/SeekBar';
import { soundManager } from '@/services/audio/soundManager';
import { PLAYER_CARD_MIN_HEIGHT } from '@/utils/constants';
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

      <SeekBar
        value={hasPreview ? progress : 0}
        duration={duration}
        onSeek={(seconds) => soundManager.seekTo(seconds)}
        disabled={controlsDisabled}
        height={6}
        style={styles.progress}
        accessibilityLabel="Ir a un punto del preview"
      />

      {/* Hueco de altura fija: la tarjeta no debe crecer/encoger al cambiar de
          canción (eso redimensionaba el deck y se percibía como un pequeño
          zoom en cada tarjeta). */}
      <View style={styles.status}>
        {loading ? (
          <Text style={styles.statusText} numberOfLines={1}>
            Cargando preview...
          </Text>
        ) : !hasPreview ? (
          <Text style={[styles.statusText, styles.statusWarning]} numberOfLines={1}>
            Preview no disponible para este tema
          </Text>
        ) : null}
      </View>
    </HtzCard>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: 12,
    paddingHorizontal: htzTokens.spacing.md,
    gap: 10,
    minHeight: PLAYER_CARD_MIN_HEIGHT,
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
  status: {
    height: 20,
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 12,
    color: htzTokens.colors.outline,
    textAlign: 'center',
  },
  statusWarning: {
    color: htzTokens.colors.warning,
  },
  time: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    color: htzTokens.colors.onSurfaceVariant,
    minWidth: 36,
    textAlign: 'center',
  },
});
