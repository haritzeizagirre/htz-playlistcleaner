import { Redirect } from 'expo-router';
import { StyleSheet } from 'react-native';

import { HtzSpinner } from '@haritzeiza/htz-react/native';

import { Screen } from '@/components/Screen';
import { useAuthStore } from '@/store/useAuthStore';

/** Punto de entrada: espera la rehidratación y redirige según la sesión. */
export default function Index() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isRestoring = useAuthStore((state) => state.isRestoring);

  if (isRestoring) {
    return (
      <Screen style={styles.center}>
        <HtzSpinner size="lg" />
      </Screen>
    );
  }

  return <Redirect href={isAuthenticated ? '/(main)' : '/(auth)/login'} />;
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
