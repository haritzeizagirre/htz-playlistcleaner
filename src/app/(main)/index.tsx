import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { LogOut, Search } from 'lucide-react-native';

import {
  HtzAlert,
  HtzBadge,
  HtzButton,
  HtzInput,
  HtzSelect,
  HtzSpinner,
  htzTokens,
} from '@haritzeiza/htz-react/native';

import { PlaylistRow } from '@/components/PlaylistRow';
import { Screen } from '@/components/Screen';
import type { PlaylistSummary } from '@/services/interfaces';
import { getMusicService } from '@/services/registry';
import { useAuthStore } from '@/store/useAuthStore';
import { humanizeMusicError } from '@/utils/errors';
import { providerLabel } from '@/utils/format';

type SortMode = 'name' | 'most' | 'least';

const SORT_OPTIONS = [
  { value: 'name', label: 'Nombre (A-Z)' },
  { value: 'most', label: 'Más canciones primero' },
  { value: 'least', label: 'Menos canciones primero' },
];

export default function PlaylistsScreen() {
  const provider = useAuthStore((state) => state.provider);
  const mode = useAuthStore((state) => state.mode) ?? 'demo';
  const displayName = useAuthStore((state) => state.displayName);
  const logout = useAuthStore((state) => state.logout);

  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('name');

  // Recarga al ganar foco: los recuentos reflejan las sesiones de limpieza.
  useFocusEffect(
    useCallback(() => {
      if (!provider) return;
      let cancelled = false;

      (async () => {
        try {
          const result = await getMusicService(provider, mode).getUserPlaylists();
          if (cancelled) return;
          setPlaylists(result);
          setError(null);
        } catch (cause) {
          if (!cancelled) {
            const detail = cause instanceof Error ? cause.message : String(cause);
            console.warn('[playlists] getUserPlaylists falló:', detail);
            setError(`No se pudieron cargar tus playlists: ${humanizeMusicError(detail)}`);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
      // `reloadKey` no se usa dentro, pero fuerza una nueva carga al pulsar "Reintentar".
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [provider, mode, reloadKey])
  );

  const handleRetry = () => {
    setPlaylists(null);
    setError(null);
    setReloadKey((key) => key + 1);
  };

  const visiblePlaylists = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = (playlists ?? []).filter((playlist) =>
      playlist.name.toLowerCase().includes(normalized)
    );
    return [...filtered].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'most') return b.trackCount - a.trackCount;
      return a.trackCount - b.trackCount;
    });
  }, [playlists, query, sort]);

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  const openCleaner = (playlist: PlaylistSummary) => {
    router.push({
      pathname: '/(main)/cleaner',
      params: { playlistId: playlist.id, playlistName: playlist.name },
    });
  };

  const openSimilarSongs = (playlist: PlaylistSummary) => {
    router.push({
      pathname: '/(main)/discovery',
      params: { playlistId: playlist.id, playlistName: playlist.name },
    });
  };

  const isLoading = playlists === null && !error;

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Mis playlists</Text>
            {displayName ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {displayName}
              </Text>
            ) : null}
          </View>
          {provider ? <HtzBadge variant="primary" label={providerLabel(provider)} /> : null}
          <HtzButton
            variant="ghost"
            size="sm"
            accessibilityLabel="Cerrar sesión"
            onPress={handleLogout}
            icon={<LogOut size={20} color={htzTokens.colors.onSurfaceVariant} />}
          />
        </View>

        <View style={styles.filters}>
          <HtzInput
            placeholder="Buscar playlist..."
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            icon={<Search size={16} color={htzTokens.colors.outline} />}
          />
          <HtzSelect
            compact
            options={SORT_OPTIONS}
            value={sort}
            onChange={(value) => setSort(value as SortMode)}
          />
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <HtzSpinner size="lg" />
            <Text style={styles.centerText}>Cargando tus playlists...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerPadded}>
            <HtzAlert variant="error" title="Error de conexión">
              {error}
            </HtzAlert>
            <HtzButton
              variant="outline"
              onPress={handleRetry}
              style={styles.retryButton}
            >
              Reintentar
            </HtzButton>
          </View>
        ) : visiblePlaylists.length === 0 ? (
          <View style={styles.centerPadded}>
            <HtzAlert variant={query ? 'warning' : 'info'} title="Sin resultados">
              {query
                ? `Ninguna playlist coincide con «${query}».`
                : 'Tu cuenta no tiene playlists todavía. Crea una en tu plataforma y vuelve a cargar.'}
            </HtzAlert>
          </View>
        ) : (
          <FlatList
            data={visiblePlaylists}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <PlaylistRow
                playlist={item}
                onOpen={() => openCleaner(item)}
                onAddSimilar={() => openSimilarSongs(item)}
              />
            )}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: htzTokens.spacing.sm,
    paddingHorizontal: htzTokens.spacing.md,
    paddingTop: htzTokens.spacing.sm,
    paddingBottom: htzTokens.spacing.sm,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: htzTokens.colors.onSurface,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    color: htzTokens.colors.onSurfaceVariant,
    marginTop: 2,
  },
  filters: {
    paddingHorizontal: htzTokens.spacing.md,
    gap: htzTokens.spacing.xs,
  },
  listContent: {
    paddingHorizontal: htzTokens.spacing.md,
    paddingBottom: htzTokens.spacing.lg,
    paddingTop: htzTokens.spacing.xs,
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
  centerPadded: {
    paddingHorizontal: htzTokens.spacing.md,
    paddingTop: htzTokens.spacing.md,
    gap: htzTokens.spacing.md,
  },
  retryButton: {
    alignSelf: 'flex-start',
  },
});
