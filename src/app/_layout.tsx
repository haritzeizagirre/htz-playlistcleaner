import { useEffect } from 'react';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { setAudioModeAsync } from 'expo-audio';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { htzTokens } from '@haritzeiza/htz-react/native';

import { useAuthStore } from '@/store/useAuthStore';

/** Tema de navegación alineado con los tokens Verde Sage. */
const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: htzTokens.colors.primary,
    background: htzTokens.colors.background,
    card: htzTokens.colors.surface,
    text: htzTokens.colors.onSurface,
    border: htzTokens.colors.surfaceVariant,
    notification: htzTokens.colors.primary,
  },
};

export default function RootLayout() {
  useEffect(() => {
    // Los previews suenan aunque el móvil esté en modo silencio (iOS).
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {
      // Sin audio disponible (p. ej. web sin gesto de usuario): se ignora.
    });

    // Rehidrata la sesión de Spotify guardada en SecureStore.
    void useAuthStore.getState().restore();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={navigationTheme}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: htzTokens.colors.background },
            }}
          />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
