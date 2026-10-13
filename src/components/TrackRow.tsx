import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { htzTokens } from '@haritzeiza/htz-react/native';

import type { Track } from '@/services/interfaces';

interface TrackRowProps {
  track: Track;
  subtitle?: string;
  right?: ReactNode;
}

/** Fila de canción reutilizable (resumen, descubrimiento...). */
export function TrackRow({ track, subtitle, right }: TrackRowProps) {
  return (
    <View style={styles.row}>
      <Image
        source={{ uri: track.coverUrl }}
        style={styles.cover}
        contentFit="cover"
        transition={150}
      />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
          {track.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">
          {subtitle ?? `${track.artist} · ${track.album}`}
        </Text>
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: htzTokens.radius.md,
    backgroundColor: htzTokens.colors.surfaceContainer,
    borderWidth: 1,
    borderColor: htzTokens.colors.surfaceVariant,
  },
  cover: {
    width: 48,
    height: 48,
    borderRadius: htzTokens.radius.sm,
    backgroundColor: htzTokens.colors.surfaceVariant,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: htzTokens.colors.onSurface,
  },
  subtitle: {
    fontSize: 12,
    color: htzTokens.colors.onSurfaceVariant,
    marginTop: 2,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
