# 🎵 Playlist Cleaner ("Swipeify")

App móvil (Expo + React Native + TypeScript) para curar playlists de música con una UX tipo
*swipe card deck*: **desliza a la derecha para mantener**, **a la izquierda para eliminar**, con
deshacer, preview de audio y confirmación por lotes.

Plan de desarrollo completo: [`plan_de_desarrollo_playlist_cleaner.md`](./plan_de_desarrollo_playlist_cleaner.md).

## Estado por fases

| Fase | Estado | Descripción |
| --- | --- | --- |
| 1 | ✅ Implementada | UI core (swipe deck), mock service, deshacer, previews, navegación |
| 2 | ✅ Implementada (pendiente de probar en device) | Spotify real: OAuth PKCE + Web API + SecureStore |
| 3 | ✅ Implementada (verificada en emulador) | YouTube Music real: Google Sign-In + YouTube Data API v3 |
| 4 | ✅ Base lista | Batching/descarte optimista + resumen antes de confirmar |
| 5 | ✅ Base lista | Modo descubrimiento (real en Spotify vía búsqueda por artistas) |

## Stack

- **Expo SDK 57** + expo-router (rutas en `src/app/`), React 19, RN 0.86, New Architecture.
- **Zustand** para estado (`src/store/`).
- **react-native-reanimated + gesture-handler** para el deck de tarjetas.
- **expo-audio** para previews (expo-av ya no existe en SDK 57).
- **Design system propio**: [`@haritzeiza/htz-react/native`](../haritz-components-react)
  (componentes Htz + tokens Verde Sage), enlazado como dependencia local `file:`.

## Estructura

```text
src/
├── app/                      # rutas (expo-router)
│   ├── (auth)/login.tsx      # selección de proveedor
│   └── (main)/
│       ├── index.tsx         # selector de playlists (buscar/ordenar)
│       ├── cleaner.tsx       # swipe deck + audio + deshacer
│       ├── summary.tsx       # resumen y confirmación por lotes
│       └── discovery.tsx     # recomendaciones (swipe right → añadir)
├── components/               # CardDeck, SongCard, AudioPlayer, UndoSnackbar...
├── services/
│   ├── interfaces.ts         # Track, PlaylistSummary, IMusicService
│   ├── mock/                 # datos y servicio mock (Fase 1)
│   ├── audio/                # soundManager (expo-audio) + previewResolver (iTunes)
│   └── registry.ts           # resuelve el adapter según proveedor
├── store/                    # useAuthStore, useCleanerStore (Zustand)
└── utils/                    # constantes y formateo
```

## Desarrollo

```bash
npm install
npx expo start          # abre en Expo Go (QR) o emulador
npm run typecheck       # tsc --noEmit
npm run lint            # expo lint
```

> **Librería local de componentes.** Se consume desde `C:\VSCode\haritz-components-react`
> (dependencia `file:` + `metro.config.js` con `watchFolders` y `disableHierarchicalLookup`,
> que evita que la librería resuelva su propio `react-native`/`react`). Si editas la librería:
> ejecuta `npm run build` en ella y **reinicia el bundler con `npx expo start --clear`**;
> Metro no siempre detecta el dist regenerado en caliente.
>
> `npx expo-doctor` avisará de `disableHierarchicalLookup` y de un `react` duplicado en
> `haritz-components-react/node_modules`: son consecuencia esperada del enlace local y no
> afectan al bundle de la app.

## Fase 2: Spotify real (implementada)

- **Auth**: Authorization Code + **PKCE** con `expo-auth-session`; tokens (access +
  refresh + caducidad) guardados en **expo-secure-store** y refrescados automáticamente.
- **Client ID**: configurado en `src/services/spotify/spotifyConfig.ts`.
- **Redirect URI**: `playlistcleaner://redirect` (debe coincidir con el dashboard de Spotify).
- **Scopes**: `playlist-read-private`, `playlist-read-collaborative`,
  `playlist-modify-public`, `playlist-modify-private`, `user-read-private`.
- **API**: endpoints nuevos tras la migración de Spotify (`/playlists/{id}/items`),
  borrado/añadido por lotes de 100 con fallback individual, reintento en 401/429.
- **Previews**: `preview_url` está deprecado en la Web API; el `PreviewResolver`
  (iTunes Search) actúa como fuente principal cuando llega `null`.
- **Recomendaciones**: `/search` por artistas de las canciones semilla
  (`/recommendations` ya no está disponible para apps nuevas).

> ⚠️ **El login real necesita un development build** (Expo Go no puede registrar el
> esquema de redirección). Compila con `npx expo run:android` y prueba el login real.
> En Expo Go usa siempre el modo demo.

## Fase 3: YouTube Music (implementada y verificada)

- **Auth**: Google Sign-In nativo (`@react-native-google-signin/google-signin`) con el scope
  `https://www.googleapis.com/auth/youtube`; sesión rehidratable con `signInSilently`.
- **Adapter**: `playlists.list(mine=true)`, `playlistItems.list` paginado, duraciones reales vía
  `/videos`, borrado/inserción por item (50 unidades de cuota cada uno) y recomendaciones por
  canal con `/search` (`relatedToVideoId` está deprecado).
- **Cuota**: 10.000 unidades/día. El flujo agrupa los borrados al confirmar en el resumen.
- **Previews**: YouTube no da MP3; el resolver de iTunes cubre los fragmentos de 30 s.
- **Config**: `src/services/youtube/youtubeConfig.ts` (Client ID **Web**) + cliente OAuth
  **Android** (package `com.haritzeiza.playlistcleaner` + SHA-1 del keystore de debug).

> Verificado en emulador: login → playlists reales → carga de canciones con duraciones →
> swipe deck con preview sonando. **Pendiente probar el borrado real** con una playlist de prueba.
