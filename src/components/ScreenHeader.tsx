import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';

import { HtzButton, htzTokens } from '@haritzeiza/htz-react/native';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
}

export function ScreenHeader({ title, subtitle, onBack, right }: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <HtzButton
          variant="ghost"
          size="sm"
          onPress={onBack}
          accessibilityLabel="Volver"
          style={styles.backButton}
          icon={<ArrowLeft size={22} color={htzTokens.colors.onSurface} />}
        />
      ) : null}
      <View style={styles.titleBox}>
        <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: htzTokens.spacing.md,
    paddingTop: htzTokens.spacing.sm,
    paddingBottom: htzTokens.spacing.sm,
    gap: htzTokens.spacing.xs,
  },
  backButton: {
    marginLeft: -htzTokens.spacing.xs,
  },
  titleBox: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: htzTokens.colors.onSurface,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: htzTokens.colors.onSurfaceVariant,
    marginTop: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: htzTokens.spacing.sm,
  },
});
