import { create } from 'zustand';

import type { Track } from '@/services/interfaces';

interface SwipeRecord {
  action: 'keep' | 'remove';
  track: Track;
}

interface CleanerState {
  playlistId: string | null;
  playlistName: string;
  /** Cola pendiente; queue[0] es la tarjeta visible. */
  queue: Track[];
  kept: Track[];
  /** Cola de eliminación pendiente (se envía al confirmar en el resumen). */
  removed: Track[];
  /** Pila de decisiones para deshacer. */
  history: SwipeRecord[];

  startSession: (playlistId: string, playlistName: string, tracks: Track[]) => void;
  keep: () => void;
  remove: () => void;
  /** Deshace la última decisión. Devuelve false si no había nada que deshacer. */
  undo: () => boolean;
  /** Mueve una canción de "por eliminar" a "conservadas" (pantalla resumen). */
  restore: (trackId: string) => void;
  /** Quita tracks de la cola de eliminación (p.ej. los que fallaron al confirmar). */
  dropFromPending: (trackIds: string[]) => void;
  clearSession: () => void;
}

const initialState = {
  playlistId: null,
  playlistName: '',
  queue: [] as Track[],
  kept: [] as Track[],
  removed: [] as Track[],
  history: [] as SwipeRecord[],
};

export const useCleanerStore = create<CleanerState>()((set, get) => ({
  ...initialState,

  startSession: (playlistId, playlistName, tracks) =>
    set({
      playlistId,
      playlistName,
      queue: [...tracks],
      kept: [],
      removed: [],
      history: [],
    }),

  keep: () => {
    const { queue, kept, history } = get();
    const [head, ...rest] = queue;
    if (!head) return;
    set({ queue: rest, kept: [...kept, head], history: [...history, { action: 'keep', track: head }] });
  },

  remove: () => {
    const { queue, removed, history } = get();
    const [head, ...rest] = queue;
    if (!head) return;
    set({
      queue: rest,
      removed: [...removed, head],
      history: [...history, { action: 'remove', track: head }],
    });
  },

  undo: () => {
    const { queue, kept, removed, history } = get();
    const last = history[history.length - 1];
    if (!last) return false;

    set({
      queue: [last.track, ...queue],
      kept: last.action === 'keep' ? kept.filter((t) => t.id !== last.track.id) : kept,
      removed: last.action === 'remove' ? removed.filter((t) => t.id !== last.track.id) : removed,
      history: history.slice(0, -1),
    });
    return true;
  },

  restore: (trackId) => {
    const { removed, kept } = get();
    const track = removed.find((t) => t.id === trackId);
    if (!track) return;
    set({
      removed: removed.filter((t) => t.id !== trackId),
      kept: [...kept, track],
    });
  },

  dropFromPending: (trackIds) => {
    const ids = new Set(trackIds);
    set({ removed: get().removed.filter((t) => !ids.has(t.id)) });
  },

  clearSession: () => set({ ...initialState }),
}));
