import type { MusicProvider } from '../interfaces';

export interface AuthResult {
  displayName: string;
}

export interface AuthService {
  login(): Promise<AuthResult>;
  logout(): Promise<void>;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Auth mock (Fase 1). En la Fase 2/3 se sustituye por:
 * - SpotifyAuthService (expo-auth-session + PKCE + SecureStore)
 * - YouTubeAuthService (Google OAuth 2.0 + SecureStore)
 */
class MockAuthService implements AuthService {
  constructor(private readonly provider: MusicProvider) {}

  async login(): Promise<AuthResult> {
    await delay(800);
    return {
      displayName:
        this.provider === 'spotify' ? 'Haritz · Spotify (demo)' : 'Haritz · YouTube Music (demo)',
    };
  }

  async logout(): Promise<void> {
    await delay(200);
  }
}

const registry = new Map<MusicProvider, AuthService>();

export function getAuthService(provider: MusicProvider): AuthService {
  let service = registry.get(provider);
  if (!service) {
    service = new MockAuthService(provider);
    registry.set(provider, service);
  }
  return service;
}
