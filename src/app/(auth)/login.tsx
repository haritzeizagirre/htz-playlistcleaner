import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ListMusic, Music, Sparkles } from 'lucide-react-native';

import {
  HtzAlert,
  HtzButton,
  htzTokens,
} from '@haritzeiza/htz-react/native';

import { Screen } from '@/components/Screen';
import type { MusicProvider } from '@/services/interfaces';
import { isYouTubeConfigured } from '@/services/youtube/youtubeConfig';
import { useAuthStore } from '@/store/useAuthStore';
import { APP_NAME } from '@/utils/constants';

type PendingAction = MusicProvider | 'demo' | null;

export default function LoginScreen() {
  const login = useAuthStore((state) => state.login);
  const isBusy = useAuthStore((state) => state.isBusy);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const [pending, setPending] = useState<PendingAction>(null);
  const youtubeLive = isYouTubeConfigured();

  const handleLogin = async (
    provider: MusicProvider,
    mode: 'live' | 'demo',
    action: PendingAction
  ) => {
    setPending(action);
    const ok = await login(provider, mode);
    setPending(null);
    if (ok) {
      router.replace('/(main)');
    }
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.logo}>
          <Music size={34} color={htzTokens.colors.inversePrimary} />
        </View>

        <Text style={styles.title}>{APP_NAME}</Text>
        <Text style={styles.subtitle}>
          Desliza para curar tus playlists: mantén lo que suena, elimina lo que sobra.
        </Text>

        <HtzAlert variant="info" title="Conexión con tus plataformas">
          {`Spotify usa OAuth 2.0 con PKCE; YouTube Music usa Google Sign-In y la API de datos de YouTube. Las sesiones se guardan en el llavero del dispositivo y el login real necesita un development build.`}
        </HtzAlert>

        {error ? (
          <HtzAlert variant="error" title="No se pudo iniciar sesión" onClose={clearError}>
            {error}
          </HtzAlert>
        ) : null}

        <View style={styles.actions}>
          <HtzButton
            variant="primary"
            size="lg"
            disabled={isBusy}
            loading={pending === 'spotify'}
            onPress={() => handleLogin('spotify', 'live', 'spotify')}
            style={styles.button}
            icon={<Music size={18} color={htzTokens.colors.onPrimary} />}
          >
            Continuar con Spotify
          </HtzButton>

          <HtzButton
            variant="secondary"
            size="lg"
            disabled={isBusy}
            loading={pending === 'youtube'}
            onPress={() => handleLogin('youtube', youtubeLive ? 'live' : 'demo', 'youtube')}
            style={styles.button}
            icon={<ListMusic size={18} color={htzTokens.colors.onSurface} />}
          >
            {youtubeLive ? 'Continuar con YouTube Music' : 'YouTube Music (demo)'}
          </HtzButton>

          <HtzButton
            variant="ghost"
            size="md"
            disabled={isBusy}
            loading={pending === 'demo'}
            onPress={() => handleLogin('spotify', 'demo', 'demo')}
            style={styles.demoButton}
            icon={<Sparkles size={16} color={htzTokens.colors.inversePrimary} />}
          >
            Explorar con datos de ejemplo
          </HtzButton>
        </View>

        <Text style={styles.footnote}>
          ¿Estás en Expo Go? El OAuth real no puede volver a la app: prueba el modo de ejemplo o
          compila un development build (npx expo run:android).
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: htzTokens.spacing.lg,
    gap: htzTokens.spacing.md,
  },
  logo: {
    alignSelf: 'center',
    width: 76,
    height: 76,
    borderRadius: htzTokens.radius.full,
    backgroundColor: htzTokens.colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: htzTokens.spacing.xs,
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: htzTokens.colors.onSurface,
    textAlign: 'center',
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: htzTokens.colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: htzTokens.spacing.sm,
  },
  actions: {
    gap: htzTokens.spacing.sm,
    marginTop: htzTokens.spacing.xs,
  },
  button: {
    alignSelf: 'stretch',
  },
  demoButton: {
    alignSelf: 'center',
  },
  footnote: {
    fontSize: 11,
    lineHeight: 16,
    color: htzTokens.colors.outline,
    textAlign: 'center',
    marginTop: htzTokens.spacing.sm,
  },
});
