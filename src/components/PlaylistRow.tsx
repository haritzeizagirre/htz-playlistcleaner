import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { ChevronRight, Sparkles } from 'lucide-react-native';

import {
  HtzBadge,
  HtzCard,
  HtzChip,
  htzTokens,
} from '@haritzeiza/htz-react/native';

import type { PlaylistSummary } from '@/services/interfaces';
import { formatTrackCount, providerLabel } from '@/utils/format';

interface PlaylistRowProps {
  playlist: PlaylistSummary;
  onOpen: () => void;
  onDiscover: () => void;
}

/**
 * Fila de playlist. El área principal (abrir limpieza) y el chip "Descubrir"
 * son elementos interactivos hermanos: anidar botones rompe la semántica
 * HTML en web y genera errores de hidratación.
 */
export function PlaylistRow({ playlist, onOpen, onDiscover }: PlaylistRowProps) {
  return (
    <HtzCard elevated style={styles.card}>
      <View style={styles.row}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={`Limpiar la playlist ${playlist.name}`}
          style={styles.main}
        >
          <Image
            source={{ uri: playlist.coverUrl }}
            style={styles.cover}
            contentFit="cover"
            transition={150}
          />

          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
              {playlist.name}
            </Text>
            <Text style={styles.meta} numberOfLines={1} ellipsizeMode="tail">
              {formatTrackCount(playlist.trackCount)} · {playlist.description}
            </Text>
            <View style={styles.badges}>
              <HtzBadge variant="primary" label={providerLabel(playlist.provider)} />
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.actions}>
          <HtzChip
            label="Descubrir"
            variant="primary"
            onPress={onDiscover}
            icon={<Sparkles size={13} color={htzTokens.colors.inversePrimary} />}
          />
          <ChevronRight size={20} color={htzTokens.colors.outline} />
        </View>
      </View>
    </HtzCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: htzTokens.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  cover: {
    width: 56,
    height: 56,
    borderRadius: htzTokens.radius.md,
    backgroundColor: htzTokens.colors.surfaceVariant,
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  name: {
    fontSize: 16,
    fontWeight: '800',
    color: htzTokens.colors.onSurface,
    letterSpacing: -0.2,
  },
  meta: {
    fontSize: 12,
    color: htzTokens.colors.onSurfaceVariant,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
