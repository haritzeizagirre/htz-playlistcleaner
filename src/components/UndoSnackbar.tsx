import { useCallback, useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { HtzButton, HtzCard, htzTokens } from '@haritzeiza/htz-react/native';

import type { Track } from '@/services/interfaces';
import { SNACKBAR_DURATION_MS } from '@/utils/constants';

interface UndoSnackbarProps {
  /** Canción eliminada más reciente; null oculta el snackbar. */
  track: Track | null;
  onUndo: () => void;
  onDismiss: () => void;
}

/** Barra flotante "Deshacer" tras marcar una canción para eliminar. */
export function UndoSnackbar({ track, onUndo, onDismiss }: UndoSnackbarProps) {
  // Animated.Value estable en estado (leer refs durante render está prohibido).
  const [translateY] = useState(() => new Animated.Value(24));
  const [opacity] = useState(() => new Animated.Value(0));

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 24, duration: 160, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onDismiss();
    });
  }, [onDismiss, opacity, translateY]);

  const trackId = track?.id ?? null;

  useEffect(() => {
    if (!trackId) return;

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(hide, SNACKBAR_DURATION_MS);
    return () => clearTimeout(timer);
  }, [trackId, hide, opacity, translateY]);

  if (!track) return null;

  return (
    <Animated.View
      style={[styles.wrapper, { opacity, transform: [{ translateY }] }]}
    >
      <HtzCard elevated style={styles.card}>
        <View style={styles.content}>
          <Text style={styles.text} numberOfLines={1} ellipsizeMode="middle">
            «{track.title}» marcada para eliminar
          </Text>
          <HtzButton
            variant="primary"
            size="sm"
            onPress={() => {
              hide();
              onUndo();
            }}
          >
            Deshacer
          </HtzButton>
        </View>
      </HtzCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: htzTokens.spacing.md,
    right: htzTokens.spacing.md,
    bottom: htzTokens.spacing.md,
    pointerEvents: 'box-none',
  },
  card: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: htzTokens.spacing.sm,
  },
  text: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: htzTokens.colors.onSurface,
  },
});
