import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { HtzBadge, htzTokens } from '@haritzeiza/htz-react/native';

import type { Track } from '@/services/interfaces';
import { formatDurationMs } from '@/utils/format';

interface SongCardProps {
  track: Track;
  style?: StyleProp<ViewStyle>;
}

/** Tarjeta visual de canción del deck: portada + degradado + metadatos. */
export function SongCard({ track, style }: SongCardProps) {
  return (
    <View style={[styles.card, style]}>
      <Image
        source={{ uri: track.coverUrl }}
        style={styles.cover}
        contentFit="cover"
        transition={200}
      />

      <LinearGradient
        colors={['transparent', 'rgba(10, 12, 10, 0.92)']}
        locations={[0.35, 1]}
        style={styles.gradient}
      />

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1} ellipsizeMode="tail">
          {track.artist}
        </Text>
        <Text style={styles.album} numberOfLines={1} ellipsizeMode="tail">
          {track.album}
        </Text>

        <View style={styles.badges}>
          <HtzBadge
            variant="primary"
            label={track.provider === 'spotify' ? 'SPOTIFY' : 'YT MUSIC'}
          />
          <HtzBadge variant="secondary" label={formatDurationMs(track.durationMs)} />
          {!track.previewUrl && track.provider !== 'youtube' ? (
            <HtzBadge variant="warning" label="SIN PREVIEW" />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: htzTokens.radius.lg,
    overflow: 'hidden',
    backgroundColor: htzTokens.colors.surface,
    borderWidth: 1,
    borderColor: htzTokens.colors.surfaceVariant,
  },
  cover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: htzTokens.colors.surfaceVariant,
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '62%',
    pointerEvents: 'none',
  },
  info: {
    marginTop: 'auto',
    padding: htzTokens.spacing.md,
    gap: 4,
    pointerEvents: 'none',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: htzTokens.colors.onSurface,
    letterSpacing: -0.4,
  },
  artist: {
    fontSize: 15,
    fontWeight: '600',
    color: htzTokens.colors.inversePrimary,
  },
  album: {
    fontSize: 12,
    color: htzTokens.colors.onSurfaceVariant,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
});
