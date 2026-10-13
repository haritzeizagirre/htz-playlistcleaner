import { forwardRef, useCallback, useImperativeHandle } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { htzTokens } from '@haritzeiza/htz-react/native';

import { SongCard } from '@/components/SongCard';
import type { Track } from '@/services/interfaces';
import {
  SWIPE_EXIT_DURATION_MS,
  SWIPE_MIN_VELOCITY,
  SWIPE_THRESHOLD_RATIO,
} from '@/utils/constants';

export interface CardDeckHandle {
  /** Expulsa la tarjeta superior como si se hubiera deslizado a la izquierda. */
  swipeLeft: () => void;
  /** Expulsa la tarjeta superior como si se hubiera deslizado a la derecha. */
  swipeRight: () => void;
}

interface CardDeckProps {
  /** Cola de canciones; tracks[0] es la tarjeta interactiva. */
  tracks: Track[];
  onDecision: (action: 'keep' | 'remove', track: Track) => void;
  enabled?: boolean;
}

export const CardDeck = forwardRef<CardDeckHandle, CardDeckProps>(function CardDeck(
  { tracks, onDecision, enabled = true },
  ref
) {
  const { width } = useWindowDimensions();
  const threshold = width * SWIPE_THRESHOLD_RATIO;

  const position = useSharedValue(0);
  /** Evita dobles decisiones mientras una tarjeta está saliendo. */
  const locked = useSharedValue(false);

  const topTrack = tracks[0];
  const secondTrack = tracks[1];
  const thirdTrack = tracks[2];

  const finishSwipe = useCallback(
    (action: 'keep' | 'remove') => {
      const track = tracks[0];
      if (!track) return;
      // Reinicia la posición antes de notificar para que la siguiente
      // tarjeta aparezca centrada sin parpadeos.
      position.value = 0;
      locked.value = false;
      onDecision(action, track);
    },
    [locked, onDecision, position, tracks]
  );

  const swipeOut = useCallback(
    (action: 'keep' | 'remove') => {
      if (locked.value || tracks.length === 0) return;
      locked.value = true;
      const target = (action === 'keep' ? 1 : -1) * width * 1.8;
      position.value = withTiming(
        target,
        { duration: SWIPE_EXIT_DURATION_MS },
        (finished) => {
          if (finished) {
            runOnJS(finishSwipe)(action);
          }
        }
      );
    },
    [finishSwipe, locked, position, tracks.length, width]
  );

  useImperativeHandle(
    ref,
    () => ({
      swipeLeft: () => swipeOut('remove'),
      swipeRight: () => swipeOut('keep'),
    }),
    [swipeOut]
  );

  const pan = Gesture.Pan()
    .enabled(enabled && Boolean(topTrack))
    .onUpdate((event) => {
      if (locked.value) return;
      position.value = event.translationX;
    })
    .onEnd((event) => {
      if (locked.value) return;
      const passedThreshold = Math.abs(position.value) > threshold;
      const flicked = Math.abs(event.velocityX) > SWIPE_MIN_VELOCITY;

      if (passedThreshold || flicked) {
        const keep = flicked && event.velocityX !== 0 ? event.velocityX > 0 : position.value > 0;
        const action: 'keep' | 'remove' = keep ? 'keep' : 'remove';
        locked.value = true;
        position.value = withTiming(
          (keep ? 1 : -1) * width * 1.8,
          { duration: SWIPE_EXIT_DURATION_MS },
          (finished) => {
            if (finished) {
              runOnJS(finishSwipe)(action);
            }
          }
        );
      } else {
        position.value = withSpring(0, { damping: 18, stiffness: 180 });
      }
    });

  const topCardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: position.value },
      {
        rotate: `${interpolate(position.value, [-width, 0, width], [-12, 0, 12])}deg`,
      },
    ],
  }));

  const secondCardStyle = useAnimatedStyle(() => {
    const progress = Math.min(Math.abs(position.value) / width, 1);
    return {
      transform: [
        { scale: interpolate(progress, [0, 1], [0.95, 1]) },
        { translateY: interpolate(progress, [0, 1], [12, 0]) },
      ],
    };
  });

  const thirdCardStyle = useAnimatedStyle(() => {
    const progress = Math.min(Math.abs(position.value) / width, 1);
    return {
      transform: [
        { scale: interpolate(progress, [0, 1], [0.9, 0.95]) },
        { translateY: interpolate(progress, [0, 1], [24, 12]) },
      ],
    };
  });

  const keepStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      position.value,
      [threshold * 0.35, threshold],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  const removeStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      position.value,
      [-threshold, -threshold * 0.35],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  return (
    <View style={styles.deck}>
      {thirdTrack ? (
        <Animated.View style={[styles.layer, styles.behindLayer, thirdCardStyle]}>
          <SongCard track={thirdTrack} />
        </Animated.View>
      ) : null}

      {secondTrack ? (
        <Animated.View style={[styles.layer, styles.behindLayer, secondCardStyle]}>
          <SongCard track={secondTrack} />
        </Animated.View>
      ) : null}

      {topTrack ? (
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.layer, topCardStyle]}>
            <SongCard track={topTrack} />
            <Animated.View style={[styles.stamp, styles.keepStamp, keepStampStyle]}>
              <Text style={[styles.stampText, styles.keepStampText]}>MANTENER</Text>
            </Animated.View>
            <Animated.View style={[styles.stamp, styles.removeStamp, removeStampStyle]}>
              <Text style={[styles.stampText, styles.removeStampText]}>ELIMINAR</Text>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  deck: {
    flex: 1,
  },
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  behindLayer: {
    pointerEvents: 'none',
  },
  stamp: {
    position: 'absolute',
    top: 24,
    borderWidth: 3,
    borderRadius: htzTokens.radius.default,
    paddingHorizontal: 12,
    paddingVertical: 6,
    pointerEvents: 'none',
  },
  keepStamp: {
    left: 20,
    borderColor: '#a2cfae',
    backgroundColor: 'rgba(74, 124, 89, 0.25)',
    transform: [{ rotate: '-12deg' }],
  },
  removeStamp: {
    right: 20,
    borderColor: htzTokens.colors.error,
    backgroundColor: 'rgba(147, 0, 10, 0.35)',
    transform: [{ rotate: '12deg' }],
  },
  stampText: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
  },
  keepStampText: {
    color: '#a2cfae',
  },
  removeStampText: {
    color: htzTokens.colors.onErrorContainer,
  },
});
