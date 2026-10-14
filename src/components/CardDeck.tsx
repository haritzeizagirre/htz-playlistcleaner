import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  makeMutable,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
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

interface DeckCardProps {
  track: Track;
  /** 0 = tarjeta superior (interactiva); 1 y 2 = tarjetas apiladas detrás. */
  index: number;
  width: number;
  threshold: number;
  /** Desplazamiento propio de la tarjeta: persiste aunque cambie de posición. */
  drag: SharedValue<number>;
  /** Desplazamiento de la tarjeta superior (mueve el escalado del fondo). */
  topDrag: SharedValue<number>;
  /** Bloquea gestos mientras una tarjeta está saliendo. */
  locked: SharedValue<boolean>;
  enabled: boolean;
  onDecide: (action: 'keep' | 'remove', track: Track) => void;
}

/** Tarjetas visibles a la vez: la superior interactiva + 2 de fondo. */
const VISIBLE_CARDS = 3;
/** La tarjeta expulsada sale 1.8 anchos de pantalla (fuera de la vista). */
const EXIT_OFFSET_RATIO = 1.8;

/**
 * Tarjeta del deck con su propio arrastre.
 *
 * Al ser `memo` y estar identificada por canción (key estable), una tarjeta
 * conserva su instancia —y su imagen ya cargada— mientras baja de la posición
 * superior a la de fondo: solo cambian sus transformaciones, nunca la portada.
 */
const DeckCard = memo(function DeckCard({
  track,
  index,
  width,
  threshold,
  drag,
  topDrag,
  locked,
  enabled,
  onDecide,
}: DeckCardProps) {
  const isTop = index === 0;

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled && isTop)
        .onUpdate((event) => {
          if (locked.value) return;
          drag.value = event.translationX;
        })
        .onEnd((event) => {
          if (locked.value) return;

          const passedThreshold = Math.abs(drag.value) > threshold;
          const flicked = Math.abs(event.velocityX) > SWIPE_MIN_VELOCITY;

          if (!passedThreshold && !flicked) {
            drag.value = withSpring(0, { damping: 18, stiffness: 180 });
            return;
          }

          const keep = flicked && event.velocityX !== 0 ? event.velocityX > 0 : drag.value > 0;
          const action: 'keep' | 'remove' = keep ? 'keep' : 'remove';
          locked.value = true;
          drag.value = withTiming(
            (keep ? 1 : -1) * width * EXIT_OFFSET_RATIO,
            { duration: SWIPE_EXIT_DURATION_MS, easing: Easing.out(Easing.cubic) },
            (finished) => {
              if (finished) {
                runOnJS(onDecide)(action, track);
              } else {
                // Animación cancelada (p. ej. la cola se reemplazó a mitad):
                // desbloquear para que el deck nunca se quede inerte.
                locked.value = false;
              }
            }
          );
        }),
    [drag, enabled, isTop, locked, onDecide, threshold, track, width]
  );

  const cardStyle = useAnimatedStyle(() => {
    if (index === 0) {
      return {
        transform: [
          { translateX: drag.value },
          {
            rotate: `${interpolate(drag.value, [-width, 0, width], [-12, 0, 12])}deg`,
          },
        ],
      };
    }

    // Las tarjetas de fondo "suben" en función de cuánto se ha desplazado la
    // superior. Con la tarjeta ya expulsada (o recién confirmada) las escalas
    // coinciden con las de la posición que ocupan tras la decisión: sin saltos.
    const progress = Math.min(Math.abs(topDrag.value) / width, 1);
    if (index === 1) {
      return {
        transform: [
          { scale: interpolate(progress, [0, 1], [0.95, 1]) },
          { translateY: interpolate(progress, [0, 1], [12, 0]) },
        ],
      };
    }
    return {
      transform: [
        { scale: interpolate(progress, [0, 1], [0.9, 0.95]) },
        { translateY: interpolate(progress, [0, 1], [24, 12]) },
      ],
    };
  });

  const keepStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      drag.value,
      [threshold * 0.35, threshold],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  const removeStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      drag.value,
      [-threshold, -threshold * 0.35],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.layer, cardStyle]}
        pointerEvents={isTop ? 'auto' : 'none'}
      >
        <SongCard track={track} />
        <Animated.View style={[styles.stamp, styles.keepStamp, keepStampStyle]} pointerEvents="none">
          <Text style={[styles.stampText, styles.keepStampText]}>MANTENER</Text>
        </Animated.View>
        <Animated.View
          style={[styles.stamp, styles.removeStamp, removeStampStyle]}
          pointerEvents="none"
        >
          <Text style={[styles.stampText, styles.removeStampText]}>ELIMINAR</Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
});

/**
 * Deck de tarjetas con swipe.
 *
 * Cada canción tiene su propia instancia de tarjeta y su propio valor de
 * arrastre, así que al confirmar una decisión la tarjeta entrante ya está
 * montada, en reposo y con la portada cargada: no hay que reiniciar posiciones
 * (ni esperar a que React aplique la nueva cola) y no se producen parpadeos.
 * La tarjeta expulsada completa su animación y solo entonces se confirma.
 */
export const CardDeck = memo(
  forwardRef<CardDeckHandle, CardDeckProps>(function CardDeck(
    { tracks, onDecision, enabled = true },
    ref
  ) {
    const { width } = useWindowDimensions();
    const threshold = width * SWIPE_THRESHOLD_RATIO;

    /** Evita dobles decisiones mientras una tarjeta está saliendo. */
    const locked = useSharedValue(false);

    /**
     * Un valor de arrastre por canción (makeMutable permite crearlos fuera de
     * hooks). La tarjeta que entra en la posición superior arranca en 0 sin
     * necesidad de reiniciar nada, por eso no hay saltos ni parpadeos.
     */
    const dragValuesRef = useRef(new Map<string, SharedValue<number>>());
    const dragFor = useCallback((trackId: string): SharedValue<number> => {
      const cache = dragValuesRef.current;
      let value = cache.get(trackId);
      if (!value) {
        value = makeMutable(0);
        cache.set(trackId, value);
      }
      return value;
    }, []);

    /**
     * Clave estable de React por objeto canción: una playlist puede contener
     * la misma canción dos veces (mismo id) y ambas tarjetas deben sobrevivir.
     */
    const keysRef = useRef(new WeakMap<Track, string>());
    const keysCountRef = useRef(0);
    const keyFor = useCallback((track: Track): string => {
      let key = keysRef.current.get(track);
      if (!key) {
        key = `song-${keysCountRef.current++}`;
        keysRef.current.set(track, key);
      }
      return key;
    }, []);

    /** Props más recientes, para los disparadores imperativos (botones). */
    const latestRef = useRef({ tracks, enabled, onDecision });
    useLayoutEffect(() => {
      latestRef.current = { tracks, enabled, onDecision };
    });

    const handleDecide = useCallback(
      (action: 'keep' | 'remove', track: Track) => {
        locked.value = false;
        latestRef.current.onDecision(action, track);
      },
      [locked]
    );

    // Purga los valores de arrastre de las canciones que salen del deck: si
    // una vuelve (deshacer) entra centrada.
    useEffect(() => {
      const visibleIds = new Set(tracks.slice(0, VISIBLE_CARDS).map((track) => track.id));
      const cache = dragValuesRef.current;
      cache.forEach((value, id) => {
        if (visibleIds.has(id)) return;
        value.value = 0;
        cache.delete(id);
      });
    }, [tracks]);

    const swipeOut = useCallback(
      (action: 'keep' | 'remove') => {
        const { tracks: currentTracks, enabled: isEnabled } = latestRef.current;
        const track = currentTracks[0];
        if (!isEnabled || !track) return;

        const drag = dragFor(track.id);
        // La tarjeta ya está fuera (animación terminada, decisión aún sin
        // aplicar): ignorar el toque para no decidir dos veces.
        if (locked.value || Math.abs(drag.value) > width) return;

        locked.value = true;
        drag.value = withTiming(
          (action === 'keep' ? 1 : -1) * width * EXIT_OFFSET_RATIO,
          { duration: SWIPE_EXIT_DURATION_MS, easing: Easing.out(Easing.cubic) },
          (finished) => {
            if (finished) {
              runOnJS(handleDecide)(action, track);
            } else {
              // Animación cancelada: desbloquear para no dejar el deck inerte.
              locked.value = false;
            }
          }
        );
      },
      [dragFor, handleDecide, locked, width]
    );

    useImperativeHandle(
      ref,
      () => ({
        swipeLeft: () => swipeOut('remove'),
        swipeRight: () => swipeOut('keep'),
      }),
      [swipeOut]
    );

    const layers = tracks
      .slice(0, VISIBLE_CARDS)
      .map((track, index) => ({ track, index, drag: dragFor(track.id) }));
    const topDrag = layers.length > 0 ? layers[0].drag : null;

    return (
      <View style={styles.deck}>
        {topDrag
          ? // En orden inverso: la tarjeta superior se pinta la última (encima).
            [...layers].reverse().map(({ track, index, drag }) => (
              <DeckCard
                key={keyFor(track)}
                track={track}
                index={index}
                width={width}
                threshold={threshold}
                drag={drag}
                topDrag={topDrag}
                locked={locked}
                enabled={enabled}
                onDecide={handleDecide}
              />
            ))
          : null}
      </View>
    );
  })
);

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
  stamp: {
    position: 'absolute',
    top: 24,
    borderWidth: 3,
    borderRadius: htzTokens.radius.default,
    paddingHorizontal: 12,
    paddingVertical: 6,
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
