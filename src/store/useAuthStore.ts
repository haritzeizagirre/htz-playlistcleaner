import { create } from 'zustand';

import { getAuthService } from '@/services/auth';
import type { MusicProvider, SessionMode } from '@/services/interfaces';
import { spotifyAuth } from '@/services/spotify/spotifyAuth';
import { youtubeAuth } from '@/services/youtube/youtubeAuth';

interface AuthState {
  provider: MusicProvider | null;
  /** 'live' usa las APIs reales; 'demo' usa datos de ejemplo. */
  mode: SessionMode | null;
  isAuthenticated: boolean;
  displayName: string | null;
  isBusy: boolean;
  /** true mientras se rehidrata la sesión de Spotify al arrancar. */
  isRestoring: boolean;
  error: string | null;
  login: (provider: MusicProvider, mode?: SessionMode) => Promise<boolean>;
  /** Rehidrata la sesión guardada (SecureStore) al abrir la app. */
  restore: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  provider: null,
  mode: null,
  isAuthenticated: false,
  displayName: null,
  isBusy: false,
  isRestoring: true,
  error: null,

  login: async (provider, mode = 'live') => {
    set({ isBusy: true, error: null });
    try {
      if (provider === 'spotify' && mode === 'live') {
        const { displayName } = await spotifyAuth.login();
        set({ provider, mode, isAuthenticated: true, displayName, isBusy: false });
      } else if (provider === 'youtube' && mode === 'live') {
        const { displayName } = await youtubeAuth.login();
        set({ provider, mode, isAuthenticated: true, displayName, isBusy: false });
      } else {
        const mockMode: SessionMode = mode === 'live' ? 'demo' : mode;
        const { displayName } = await getAuthService(provider).login();
        set({ provider, mode: mockMode, isAuthenticated: true, displayName, isBusy: false });
      }
      return true;
    } catch (error) {
      set({
        isBusy: false,
        error:
          error instanceof Error ? error.message : 'No se pudo iniciar sesión. Inténtalo de nuevo.',
      });
      return false;
    }
  },

  restore: async () => {
    try {
      const spotify = await spotifyAuth.restore();
      if (spotify) {
        set({
          provider: 'spotify',
          mode: 'live',
          isAuthenticated: true,
          displayName: spotify.displayName,
        });
        return;
      }

      const youtube = await youtubeAuth.restore();
      if (youtube) {
        set({
          provider: 'youtube',
          mode: 'live',
          isAuthenticated: true,
          displayName: youtube.displayName,
        });
      }
    } finally {
      set({ isRestoring: false });
    }
  },

  logout: async () => {
    const { provider, mode } = get();
    if (provider === 'spotify' && mode === 'live') {
      await spotifyAuth.logout();
    } else if (provider === 'youtube' && mode === 'live') {
      await youtubeAuth.logout();
    } else if (provider) {
      await getAuthService(provider).logout();
    }
    set({
      provider: null,
      mode: null,
      isAuthenticated: false,
      displayName: null,
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));
