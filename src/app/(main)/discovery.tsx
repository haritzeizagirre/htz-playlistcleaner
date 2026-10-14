import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import {
  HtzAlert,
  HtzBadge,
  HtzButton,
  HtzSpinner,
  htzTokens,
} from '@haritzeiza/htz-react/native';

import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TrackRow } from '@/components/TrackRow';
import type { Track } from '@/services/interfaces';
import { getMusicService } from '@/services/registry';
import { useAuthStore } from '@/store/useAuthStore';
import { useCleanerStore } from '@/store/useCleanerStore';
import { humanizeMusicError } from '@/utils/errors';

/** Número de canciones semilla que alimentan las propuestas. */
const SEED_COUNT = 5;

export default function DiscoveryScreen() {
  const params = useLocalSearchParams<{ playlistId?: string; playlistName?: string }>();
  const playlistId = typeof params.playlistId === 'string' ? params.playlistId : undefined;
  const playlistName = typeof params.playlistName === 'string' ? params.playlistName : 'Playlist';
  const provider = useAuthStore((state) => state.provider);
  const mode = useAuthStore((state) => state.mode) ?? 'demo';
  const sessionPlaylistId = useCleanerStore((state) => state.playlistId);
  const sessionKept = useCleanerStore((state) => state.kept);

  const [recommendations, setRecommendations] = useState<Track[] | null>(null);
  /** true si las propuestas parten de las canciones conservadas en la limpieza. */
  const [basedOnKept, setBasedOnKept] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  const [lastAdded, setLastAdded] = useState<number | null>(null);

  useEffect(() => {
    if (!playlistId || !provider) return;
    let cancelled = false;

    (async () => {
      try {
        const service = getMusicService(provider, mode);
        const tracks = await service.getPlaylistTracks(playlistId);
        // Semillas: primero lo que conservaste en la limpieza (si la sesión es
        // de esta playlist) y después sus canciones, hasta SEED_COUNT.
        const keptIds =
          sessionPlaylistId === playlistId ? sessionKept.map((track) => track.id) : [];
        const seedIds = [...new Set([...keptIds, ...tracks.map((track) => track.id)])].slice(
          0,
          SEED_COUNT
        );
        const suggestions = await service.getRecommendations(seedIds);
        if (!cancelled) {
          setBasedOnKept(keptIds.length > 0);
          setRecommendations(suggestions);
        }
      } catch (cause) {
        if (!cancelled) {
          const detail = cause instanceof Error ? cause.message : String(cause);
          console.warn('[discovery] getRecommendations falló:', detail);
          setError(`No se pudieron cargar las canciones parecidas: ${humanizeMusicError(detail)}`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playlistId, provider, mode, reloadKey, sessionPlaylistId, sessionKept]);

  const selectedTracks = useMemo(
    () => (recommendations ?? []).filter((track) => selectedIds.includes(track.id)),
    [recommendations, selectedIds]
  );

  const toggleSelection = useCallback((trackId: string) => {
    setLastAdded(null);
    setSelectedIds((current) =>
      current.includes(trackId) ? current.filter((id) => id !== trackId) : [...current, trackId]
    );
  }, []);

  const handleApply = async () => {
    if (!playlistId || !provider || selectedTracks.length === 0) return;
    setApplying(true);
    try {
      const result = await getMusicService(provider, mode).addTracksToPlaylist(
        playlistId,
        selectedTracks
      );
      setLastAdded(result.succeeded.length);
      setSelectedIds([]);
    } catch {
      setError('No se pudieron añadir las canciones seleccionadas.');
    } finally {
      setApplying(false);
    }
  };

  const handleRetry = () => {
    setRecommendations(null);
    setError(null);
    setSelectedIds([]);
    setLastAdded(null);
    setReloadKey((key) => key + 1);
  };

  const isLoading = recommendations === null && !error;

  if (!playlistId || !provider) {
    return (
      <Screen>
        <ScreenHeader title="Añadir canciones parecidas" onBack={() => router.back()} />
        <View style={styles.padded}>
          <HtzAlert variant="error" title="Playlist no especificada">
            Vuelve al inicio y elige una playlist para buscarle canciones parecidas.
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
        title="Añadir canciones parecidas"
        subtitle={playlistName}
        onBack={() => router.back()}
      />

      <View style={styles.introBox}>
        <HtzAlert variant="info" title="Canciones parecidas">
          {basedOnKept
            ? `Propuestas parecidas a las canciones que conservaste de «${playlistName}».`
            : `Propuestas parecidas a las que ya suenan en «${playlistName}».`}
        </HtzAlert>
        {lastAdded !== null ? (
          <HtzAlert variant="success" title="Añadidas a la playlist">
            {lastAdded === 1
              ? '1 canción añadida correctamente.'
              : `${lastAdded} canciones añadidas correctamente.`}
          </HtzAlert>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <HtzSpinner size="lg" />
          <Text style={styles.centerText}>Buscando canciones parecidas...</Text>
        </View>
      ) : error ? (
        <View style={styles.padded}>
          <HtzAlert variant="error" title="Algo ha fallado">
            {error}
          </HtzAlert>
          <HtzButton variant="outline" onPress={handleRetry}>
            Reintentar
          </HtzButton>
        </View>
      ) : (
        <FlatList
          data={recommendations ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const selected = selectedIds.includes(item.id);
            return (
              <TrackRow
                track={item}
                right={
                  <>
                    {selected ? <HtzBadge variant="success" label="Elegida" /> : null}
                    <HtzButton
                      variant={selected ? 'ghost' : 'primary'}
                      size="sm"
                      onPress={() => toggleSelection(item.id)}
                    >
                      {selected ? 'Quitar' : 'Añadir'}
                    </HtzButton>
                  </>
                }
              />
            );
          }}
          ItemSeparatorComponent={ListSeparator}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <HtzAlert variant="info" title="Sin propuestas">
              No hemos encontrado canciones parecidas para esta playlist.
            </HtzAlert>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={styles.footer}>
        <HtzButton
          variant="primary"
          size="lg"
          loading={applying}
          disabled={selectedTracks.length === 0}
          onPress={handleApply}
          style={styles.applyButton}
        >
          {selectedTracks.length === 1
            ? 'Añadir 1 canción a la playlist'
            : `Añadir ${selectedTracks.length} canciones a la playlist`}
        </HtzButton>
      </View>
    </Screen>
  );
}

function ListSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  introBox: {
    paddingHorizontal: htzTokens.spacing.md,
    gap: htzTokens.spacing.sm,
    paddingBottom: htzTokens.spacing.sm,
  },
  listContent: {
    paddingHorizontal: htzTokens.spacing.md,
    paddingBottom: htzTokens.spacing.md,
  },
  separator: {
    height: htzTokens.spacing.sm,
  },
  footer: {
    paddingHorizontal: htzTokens.spacing.md,
    paddingTop: htzTokens.spacing.sm,
    paddingBottom: htzTokens.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: htzTokens.colors.surfaceVariant,
  },
  applyButton: {
    alignSelf: 'stretch',
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
});
