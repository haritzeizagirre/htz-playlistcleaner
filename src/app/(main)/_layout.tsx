import { Stack } from 'expo-router';

import { htzTokens } from '@haritzeiza/htz-react/native';

export default function MainLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: htzTokens.colors.background },
      }}
    />
  );
}
