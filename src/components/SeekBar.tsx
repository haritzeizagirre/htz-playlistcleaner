import { useRef } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { HtzProgressBar } from '@haritzeiza/htz-react/native';

interface SeekBarProps {
  /** Progreso de 0 a 100. */
  value: number;
  /** Duración total en segundos; con <= 0 la barra no es interactiva. */
  duration: number;
  /** Salto a un segundo concreto de la pista. */
  onSeek: (seconds: number) => void;
  disabled?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * Barra de progreso tocable: pulsar en cualquier punto salta a ese momento de
 * la pista. El `hitSlop` amplía el área táctil verticalmente, porque la barra
 * visible es muy fina.
 */
export function SeekBar({
  value,
  duration,
  onSeek,
  disabled = false,
  height = 6,
  style,
  accessibilityLabel = 'Ir a un punto de la canción',
}: SeekBarProps) {
  const widthRef = useRef(0);

  const handleLayout = (event: LayoutChangeEvent) => {
    widthRef.current = event.nativeEvent.layout.width;
  };

  const handlePress = (event: GestureResponderEvent) => {
    const width = widthRef.current;
    if (width <= 0 || duration <= 0) return;
    // Con hitSlop el toque puede caer fuera de la barra: se acota a [0, 1].
    const ratio = Math.min(1, Math.max(0, event.nativeEvent.locationX / width));
    onSeek(ratio * duration);
  };

  const isDisabled = disabled || duration <= 0;

  return (
    <Pressable
      onPress={handlePress}
      onLayout={handleLayout}
      disabled={isDisabled}
      // Se amplía sobre todo hacia abajo: hacia arriba solo hasta el hueco que
      // separa la barra de la fila de controles, para no robarle toques.
      hitSlop={{ top: 8, bottom: 16 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled }}
      style={style}
    >
      <HtzProgressBar value={value} height={height} />
    </Pressable>
  );
}
