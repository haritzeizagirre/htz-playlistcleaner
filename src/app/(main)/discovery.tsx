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
import { humanizeMusicError } from '@/utils/errors';

export default function DiscoveryScreen() {
  const params = useLocalSearchParams<{ playlistId?: string; playlistName?: string }>();
  const playlistId = typeof params.playlistId === 'string' ? params.playlistId : undefined;
  const playlistName = typeof params.playlistName === 'string' ? params.playlistName : 'Playlist';
  const provider = useAuthStore((state) => state.provider);
  const mode = useAuthStore((state) => state.mode) ?? 'demo';

  const [recommendations, setRecommendations] = useState<Track[] | null>(null);
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
        const seeds = tracks.slice(0, 5).map((track) => track.id);
        const suggestions = await service.getRecommendations(seeds);
        if (!cancelled) setRecommendations(suggestions);
      } catch (cause) {
        if (!cancelled) {
          const detail = cause instanceof Error ? cause.message : String(cause);
          console.warn('[discovery] getRecommendations falló:', detail);
          setError(`No se pudieron cargar las recomendaciones: ${humanizeMusicError(detail)}`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playlistId, provider, mode, reloadKey]);

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
        <ScreenHeader title="Descubrir" onBack={() => router.back()} />
        <View style={styles.padded}>
          <HtzAlert variant="error" title="Playlist no especificada">
            Vuelve al inicio y elige una playlist para descubrir canciones afines.
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
        title="Descubrir"
        subtitle={playlistName}
        onBack={() => router.back()}
      />

      <View style={styles.introBox}>
        <HtzAlert variant="info" title="Recomendaciones">
          {`Basadas en las primeras canciones de «${playlistName}». En la Fase 5 se afinarán con los artistas de las pistas que conserves.`}
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
          <Text style={styles.centerText}>Buscando canciones afines...</Text>
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
            <HtzAlert variant="info" title="Sin sugerencias">
              No hemos encontrado canciones afines a esta playlist.
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
