import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Sparkles, Undo2 } from 'lucide-react-native';

import {
  HtzAlert,
  HtzBadge,
  HtzButton,
  HtzCard,
  HtzModal,
  HtzTabs,
  htzTokens,
} from '@haritzeiza/htz-react/native';

import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TrackRow } from '@/components/TrackRow';
import { getMusicService } from '@/services/registry';
import { useAuthStore } from '@/store/useAuthStore';
import { useCleanerStore } from '@/store/useCleanerStore';

type TabId = 'removed' | 'kept';

interface ConfirmResult {
  ok: number;
  failed: number;
}

export default function SummaryScreen() {
  const params = useLocalSearchParams<{ playlistId?: string; playlistName?: string }>();
  const provider = useAuthStore((state) => state.provider);
  const mode = useAuthStore((state) => state.mode) ?? 'demo';

  const removed = useCleanerStore((state) => state.removed);
  const kept = useCleanerStore((state) => state.kept);
  const restore = useCleanerStore((state) => state.restore);
  const dropFromPending = useCleanerStore((state) => state.dropFromPending);
  const clearSession = useCleanerStore((state) => state.clearSession);
  const sessionPlaylistId = useCleanerStore((state) => state.playlistId);
  const sessionPlaylistName = useCleanerStore((state) => state.playlistName);
  const remainingCount = useCleanerStore((state) => state.queue.length);

  const playlistId = typeof params.playlistId === 'string' ? params.playlistId : sessionPlaylistId;
  const playlistName =
    typeof params.playlistName === 'string' ? params.playlistName : sessionPlaylistName;

  const [tab, setTab] = useState<TabId>(() =>
    removed.length === 0 && kept.length > 0 ? 'kept' : 'removed'
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ConfirmResult | null>(null);

  const handleConfirm = async () => {
    if (!playlistId || !provider || removed.length === 0) return;
    setProcessing(true);
    try {
      const outcome = await getMusicService(provider, mode).removeTracksFromPlaylist(
        playlistId,
        removed
      );
      if (outcome.failed.length > 0) {
        dropFromPending(outcome.failed.map((failure) => failure.track.id));
      }
      setResult({ ok: outcome.succeeded.length, failed: outcome.failed.length });
    } catch {
      setResult({ ok: 0, failed: removed.length });
    } finally {
      setProcessing(false);
      setConfirmOpen(false);
    }
  };

  const goHome = () => {
    clearSession();
    if (router.canDismiss()) {
      router.dismissAll();
    } else {
      router.replace('/(main)');
    }
  };

  /**
   * Acción extra al terminar la sesión: buscar canciones parecidas a las
   * conservadas y añadirlas. No limpia la sesión para que las semillas sigan
   * disponibles en la pantalla de descubrimiento.
   */
  const openSimilar = () => {
    if (!playlistId) return;
    router.push({
      pathname: '/(main)/discovery',
      params: { playlistId, playlistName: playlistName || 'Playlist' },
    });
  };

  if (result) {
    const success = result.failed === 0;
    return (
      <Screen>
        <ScreenHeader title="Resultado" subtitle={playlistName || undefined} />
        <View style={styles.padded}>
          <HtzAlert
            variant={success ? 'success' : 'warning'}
            title={success ? 'Cambios aplicados' : 'Cambios parciales'}
          >
            {success
              ? `Se eliminaron ${result.ok} canciones de «${playlistName ?? 'la playlist'}». La playlist ya está actualizada.`
              : `Se eliminaron ${result.ok} canciones, pero ${result.failed} no se pudieron borrar y siguen en la lista de pendientes.`}
          </HtzAlert>
          <HtzCard elevated style={styles.extraCard}>
            <View style={styles.extraTitleRow}>
              <Sparkles size={16} color={htzTokens.colors.primary} />
              <Text style={styles.extraTitle}>¿Y si la amplías?</Text>
            </View>
            <Text style={styles.extraText}>
              Busca canciones parecidas a las que conservaste y añádelas a la playlist sin salir
              de la app.
            </Text>
            <HtzButton variant="outline" onPress={openSimilar}>
              Añadir canciones parecidas
            </HtzButton>
          </HtzCard>

          <HtzButton variant="primary" size="lg" onPress={goHome}>
            Volver a mis playlists
          </HtzButton>
        </View>
      </Screen>
    );
  }

  const data = tab === 'removed' ? removed : kept;

  return (
    <Screen>
      <ScreenHeader title="Resumen de la sesión" subtitle={playlistName || undefined} onBack={() => router.back()} />

      {remainingCount > 0 ? (
        <View style={styles.noticeBox}>
          <HtzAlert variant="info">
            {remainingCount === 1
              ? 'Queda 1 canción sin revisar: se mantendrá tal cual.'
              : `Quedan ${remainingCount} canciones sin revisar: se mantendrán tal cual.`}
          </HtzAlert>
        </View>
      ) : null}

      <View style={styles.tabsBox}>
        <HtzTabs
          tabs={[
            { id: 'removed', label: `Por eliminar (${removed.length})` },
            { id: 'kept', label: `Conservadas (${kept.length})` },
          ]}
          activeTab={tab}
          onChange={(id) => setTab(id as TabId)}
        />
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TrackRow
            track={item}
            right={
              tab === 'removed' ? (
                <HtzButton
                  variant="ghost"
                  size="sm"
                  onPress={() => restore(item.id)}
                  icon={<Undo2 size={14} color={htzTokens.colors.onSurface} />}
                >
                  Restaurar
                </HtzButton>
              ) : (
                <HtzBadge variant="success" label="Conservada" />
              )
            }
          />
        )}
        ItemSeparatorComponent={ListSeparator}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <HtzAlert variant="info" title="Nada por aquí">
            {tab === 'removed'
              ? 'No hay canciones marcadas para eliminar.'
              : 'Todavía no has conservado ninguna canción.'}
          </HtzAlert>
        }
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.footer}>
        {removed.length > 0 ? (
          <HtzButton
            variant="primary"
            size="lg"
            onPress={() => setConfirmOpen(true)}
            style={styles.confirmButton}
          >
            {removed.length === 1
              ? 'Confirmar 1 eliminación'
              : `Confirmar ${removed.length} eliminaciones`}
          </HtzButton>
        ) : (
          <>
            <HtzButton
              variant="outline"
              size="lg"
              onPress={openSimilar}
              style={styles.confirmButton}
              icon={<Sparkles size={18} color={htzTokens.colors.inversePrimary} />}
            >
              Añadir canciones parecidas
            </HtzButton>
            <HtzButton variant="ghost" onPress={goHome}>
              Volver a mis playlists
            </HtzButton>
          </>
        )}
      </View>

      <HtzModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirmar eliminación"
        footer={
          <>
            <HtzButton variant="outline" onPress={() => setConfirmOpen(false)}>
              Cancelar
            </HtzButton>
            <HtzButton variant="primary" loading={processing} onPress={handleConfirm}>
              Eliminar
            </HtzButton>
          </>
        }
      >
        <Text style={styles.modalText}>
          Se eliminarán {removed.length} canciones de «{playlistName ?? 'la playlist'}». Esta
          acción no se puede deshacer.
        </Text>
        <Text style={styles.modalHint}>
          Las canciones se enviarán en una sola operación para ahorrar llamadas a la API.
        </Text>
      </HtzModal>
    </Screen>
  );
}

function ListSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  noticeBox: {
    paddingHorizontal: htzTokens.spacing.md,
    paddingBottom: htzTokens.spacing.sm,
  },
  tabsBox: {
    paddingHorizontal: htzTokens.spacing.md,
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
    gap: htzTokens.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: htzTokens.colors.surfaceVariant,
  },
  confirmButton: {
    alignSelf: 'stretch',
  },
  padded: {
    paddingHorizontal: htzTokens.spacing.md,
    paddingTop: htzTokens.spacing.md,
    gap: htzTokens.spacing.md,
  },
  modalText: {
    fontSize: 14,
    lineHeight: 21,
    color: htzTokens.colors.onSurface,
  },
  modalHint: {
    fontSize: 12,
    lineHeight: 18,
    color: htzTokens.colors.onSurfaceVariant,
    marginTop: htzTokens.spacing.sm,
  },
  extraCard: {
    gap: 10,
  },
  extraTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  extraTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: htzTokens.colors.onSurface,
  },
  extraText: {
    fontSize: 13,
    lineHeight: 19,
    color: htzTokens.colors.onSurfaceVariant,
  },
});
