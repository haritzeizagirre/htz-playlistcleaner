# 🎵 Playlist Cleaner ("Swipeify") — Plan de Desarrollo y Arquitectura

Documento de especificación técnica y hoja de ruta para la implementación automatizada mediante agente de código (**OpenCode / Coding Agent**).

---

## 1. Visión del Producto y Viabilidad

### 1.1 Concepto
Una aplicación móvil con interfaz tipo tarjeta (*swipe card deck*) diseñada para curar playlists de música de forma rápida y visual:
* **Swipe a la izquierda:** Elimina la canción de la playlist seleccionada.
* **Swipe a la derecha:** Conserva la canción.
* **Botón Deshacer (Undo):** Revierte la última acción en caso de error.
* **Reproducción Automática:** Al cargar la tarjeta, reproduce automáticamente una muestra de 15 a 30 segundos del tema.
* **Modo Descubrimiento:** Modo complementario para sugerir canciones afines y añadirlas a la lista deslizando a la derecha.

### 1.2 Viabilidad Técnica y Retos Clave

| Plataforma | Autenticación | Modificación de Playlists | Audio Preview | Reto Técnico |
| :--- | :--- | :--- | :--- | :--- |
| **Spotify** | OAuth 2.0 PKCE | Sencilla (`DELETE /playlists/{id}/tracks`) | Variable (requiere fallback) | Spotify limitó `preview_url` en cuentas gratuitas y ciertas regiones. Solución: Resolver metadatos contra APIs públicas de preview (Deezer / iTunes Search API) para el audio preview instantáneo. |
| **YouTube Music** | Google OAuth 2.0 | YouTube Data API v3 (`playlistItems.delete`) | IFrame embebido / WebView | La cuota diaria de la API de YouTube es de 10.000 unidades (un delete consume 50 unidades). Se requiere optimización de llamadas y batching. |

---

## 2. Stack Tecnológico

* **Framework:** React Native con **Expo (SDK 51+)** en modo prebuild/bare si se requieren plugins nativos, o Expo Go.
* **Lenguaje:** TypeScript (estricto).
* **Gestor de Estado:** Zustand (ligero, ideal para persistencia local y sincronización de cola de canciones).
* **Animaciones & Gestos:** `react-native-reanimated` (v3) + `react-native-gesture-handler`.
* **Motor de Audio:** `expo-av` (para audio streams MP3) + `react-native-youtube-iframe` (para previews de YouTube).
* **Almacenamiento Local Seguro:** `expo-secure-store` (tokens OAuth) + `@react-native-async-storage/async-storage` (caché y preferencias).
* **Navegación:** Expo Router o React Navigation (Stack + Tabs).

---

## 3. Arquitectura del Sistema: Patrón Adapter

Para que la app no dependa rígidamente de un solo servicio, toda la lógica musical se abstrae tras la interfaz unificada `IMusicService`:

```typescript
export interface Track {
  id: string;              // ID único en la plataforma
  playlistItemId?: string; // ID específico del item en la playlist (crucial para YouTube)
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  previewUrl: string | null; // URL MP3 o identificador de streaming
  durationMs: number;
  provider: 'spotify' | 'youtube';
}

export interface PlaylistSummary {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  trackCount: number;
  provider: 'spotify' | 'youtube';
}

export interface IMusicService {
  login(): Promise<boolean>;
  logout(): Promise<void>;
  isAuthenticated(): Promise<boolean>;
  getUserPlaylists(): Promise<PlaylistSummary[]>;
  getPlaylistTracks(playlistId: string): Promise<Track[]>;
  removeTrackFromPlaylist(playlistId: string, track: Track): Promise<boolean>;
  addTrackToPlaylist(playlistId: string, track: Track): Promise<boolean>;
  getRecommendations(seedTrackIds: string[]): Promise<Track[]>;
}
```

---

## 4. Plan de Implementación por Fases (Sprints para OpenCode)

### Fase 1: Setup del Entorno y UI Core (Swipe Deck)
* **Objetivo:** Tener una aplicación funcional en Android con tarjetas animadas y datos mockeados.
* **Tareas del Agente:**
  1. Inicializar proyecto Expo con plantilla TypeScript: `npx create-expo-app playlist-cleaner -t tabs`.
  2. Instalar dependencias clave:
     ```bash
     npx expo install react-native-reanimated react-native-gesture-handler expo-av expo-secure-store @react-native-async-storage/async-storage lucide-react-native
     ```
  3. Crear el componente `SwipeCardDeck`:
     * Soporte de gestos fluidos hacia izquierda (descartar/rojo) y derecha (mantener/verde).
     * Indicadores visuales durante el arrastre (opacidad de etiquetas "KEEP" y "REMOVE").
     * Animación de salida natural y retorno suave al centro si el umbral no se supera.
  4. Crear pantalla de prueba con 10 canciones estáticas y comprobar que el flujo de descartes funciona.

### Fase 2: Integración de Spotify
* **Objetivo:** Conectar cuenta real de Spotify, cargar playlists del usuario y eliminar temas al deslizar a la izquierda.
* **Tareas del Agente:**
  1. Implementar `SpotifyAuthService` usando `expo-auth-session`:
     * Flujo OAuth 2.0 Authorization Code con PKCE.
     * Scopes: `playlist-read-private`, `playlist-read-collaborative`, `playlist-modify-public`, `playlist-modify-private`.
     * Almacenamiento y refresco automático de `access_token` y `refresh_token` en `SecureStore`.
  2. Implementar `SpotifyAdapter`:
     * Endpoint `GET https://api.spotify.com/v1/me/playlists`.
     * Endpoint `GET https://api.spotify.com/v1/playlists/{playlist_id}/tracks`.
     * Endpoint `DELETE https://api.spotify.com/v1/playlists/{playlist_id}/tracks`.
  3. Resolver el problema de Previews de Audio:
     * Si `track.preview_url` existe, usarlo directamente en `expo-av`.
     * Fallback: Servicio auxiliar `PreviewResolver` que consulta la API pública de iTunes (`https://itunes.apple.com/search?term={title}+{artist}&limit=1`) para obtener un fragmento de 30 segundos gratuito sin necesidad de cuenta premium.

### Fase 3: Integración de YouTube Music
* **Objetivo:** Conectar cuenta de Google, leer listas de reproducción y gestionar eliminaciones vía YouTube Data API v3.
* **Tareas del Agente:**
  1. Configurar Google Cloud Console:
     * Habilitar *YouTube Data API v3*.
     * Configurar credenciales OAuth (Client ID para Android/Web).
     * Scope requerido: `https://www.googleapis.com/auth/youtube`.
  2. Implementar `YouTubeAdapter`:
     * `playlists.list(mine=true)`: Listar playlists del usuario.
     * `playlistItems.list(playlistId)`: Extraer canciones guardando el `playlistItemId` (necesario para borrar).
     * `playlistItems.delete(id=playlistItemId)`: Eliminar canción.
  3. Reproducción de Audio en YouTube:
     * Integrar `react-native-youtube-iframe` en modo audio (vista oculta o banner mínimo en la parte inferior).
     * Iniciar la reproducción en el segundo 30 de cada vídeo para ir directo al fragmento principal de la pista.

### Fase 4: UX de Limpieza y Mecanismo "Undo" (Deshacer)
* **Objetivo:** Prevenir errores accidentales y evitar consumo excesivo de llamadas a las APIs.
* **Tareas del Agente:**
  1. **Batching / Descarte Optimista:**
     * Cuando el usuario desliza a la izquierda, la canción se retira visualmente de la lista y se añade a una cola local `pendingDeletions`.
     * Se muestra un botón "Deshacer" flotante con temporizador o botón fijo en la esquina.
     * Al salir de la sesión de limpieza o pulsar "Confirmar cambios", se envían las peticiones de borrado por lotes a Spotify / YouTube. Esto ahorra cuota de API y permite arrepentirse sin consecuencias.
  2. **Controles de Audio:**
     * Botón Play/Pausa manual.
     * Barra de progreso del clip de 30 segundos.
     * Salto de +/- 5 segundos.

### Fase 5: Modo Descubrimiento y Recomendaciones
* **Objetivo:** Explorar canciones similares para expandir la playlist.
* **Tareas del Agente:**
  1. Para Spotify:
     * Utilizar artistas y géneros de las pistas conservadas (las que recibieron *swipe right*).
     * Buscar temas populares relacionados con los artistas de la lista.
  2. Para YouTube:
     * Consultar `search.list(relatedToVideoId=...)` para encontrar temas afines.
  3. En la interfaz:
     * Deslizar a la derecha añade el tema descubierto a la playlist (`playlist-modify-public` / `playlistItems.insert`).

---

## 5. Estructura de Directorios del Proyecto

```text
playlist-cleaner/
├── app/                          # Expo Router screens
│   ├── (auth)/
│   │   ├── login.tsx             # Selección de proveedor (Spotify / Google)
│   ├── (main)/
│   │   ├── index.tsx             # Selector de playlists
│   │   ├── cleaner.tsx           # Pantalla principal del Swipe Deck
│   │   ├── discovery.tsx         # Modo recomendación
│   │   └── summary.tsx           # Resumen de cambios antes de confirmar
│   └── _layout.tsx
├── src/
│   ├── components/
│   │   ├── CardDeck.tsx          # Gestor de tarjetas animadas
│   │   ├── SongCard.tsx          # Diseño visual de la tarjeta
│   │   ├── AudioPlayer.tsx       # Controlador de reproducción de preview
│   │   └── UndoSnackbar.tsx      # Barra flotante de deshacer
│   ├── services/
│   │   ├── interfaces.ts         # IMusicService, Track, etc.
│   │   ├── spotify/
│   │   │   ├── spotifyAuth.ts
│   │   │   └── spotifyAdapter.ts
│   │   ├── youtube/
│   │   │   ├── youtubeAuth.ts
│   │   │   └── youtubeAdapter.ts
│   │   └── audio/
│   │       ├── previewResolver.ts # Fallback de audio previews (iTunes/Deezer)
│   │       └── soundManager.ts   # Singleton de expo-av
│   ├── store/
│   │   ├── useAuthStore.ts       # Tokens y sesión activa
│   │   └── useCleanerStore.ts    # Cola de tarjetas, tracks eliminados y estado
│   └── utils/
│       └── constants.ts
├── app.json
├── package.json
└── tsconfig.json
```

---

## 6. Prompt de Arranque para el Agente de OpenCode

Para iniciar la construcción de la app, copia y pega el siguiente prompt en tu entorno de OpenCode:

```markdown
Actúa como un Senior React Native Developer. Vamos a construir "Playlist Cleaner", una app en Expo (React Native + TypeScript) con UX tipo Tinder para limpiar y gestionar playlists de música.

Sigue las especificaciones del archivo `playlist_cleaner_dev_plan.md`:
1. Inicializa el proyecto con Expo (TypeScript) y configura `react-native-reanimated` y `react-native-gesture-handler`.
2. Define las interfaces en `src/services/interfaces.ts` (`Track`, `PlaylistSummary`, `IMusicService`).
3. Construye el componente `CardDeck` y la pantalla `cleaner.tsx` con un servicio de mock que contenga 10 canciones con carátula y URL de preview MP3 para probar la física de deslizamiento, botones de acción y el sistema de "Deshacer" en memoria.
4. Asegúrate de que el código sea modular, con tipado estricto y sin errores en Android.
```