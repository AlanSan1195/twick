# OBS Browser Source — Plan de transición

Estado: PENDIENTE DE IMPLEMENTACIÓN
Fecha: 2026-02-23

## Contexto

El proyecto es un chat simulator SSR (Astro 5 + React 19) desplegado en Vercel.
El objetivo es exponer una URL pública y configurable que el streamer pueda usar
directamente como Browser Source en OBS, sin autenticación y con fondo transparente.

---

## Problemas identificados

### Bloqueantes

| # | Problema | Archivo | Detalle |
|---|---|---|---|
| 1 | `X-Frame-Options: DENY` | `src/middleware.ts` | OBS (CEF) no puede cargar la página. Hay que excluir `/obs/*` de este header. |
| 2 | Auth Clerk en `/api/chat-stream` | `src/middleware.ts` | OBS no puede mantener sesión Clerk. El endpoint SSE necesita acceso sin sesión. |
| 3 | No existe ruta OBS-specific | — | Se necesita una página sin header/footer y con `background: transparent`. |

### No bloqueantes

| # | Problema | Detalle |
|---|---|---|
| 4 | Sin parámetros configurables por URL | Game, plataforma, max mensajes, etc. deben ser query params. |
| 5 | CSS no está preparado para overlay | `global.css` tiene fondos opacos que deben ser transparentes en modo OBS. |
| 6 | Sin pre-warming del caché AI | Si el overlay arranca en frío, cae a frases estáticas (RDR2/BG3/Minecraft). |
| 7 | Caché de frases volátil en serverless | `Map` en memoria se borra en cada cold start de Vercel. Ver sección "Decisión pendiente". |

---

## Arquitectura propuesta

### URL del overlay

```
https://twick.dev/obs/chat?game=rdr2&platform=twitch&maxMessages=20&token=<TOKEN>
```

El streamer copia esta URL y la pega como Browser Source en OBS.

### Diagrama de flujo

```
Dashboard (usuario autenticado)
  └─ Sección "OBS Setup"
       └─ Genera URL firmada con token HMAC (Clerk userId + secreto de servidor)
            └─ Copia URL → OBS Browser Source

OBS Browser Source abre /obs/chat?...&token=<TOKEN>
  └─ Astro renderiza OBSChatOverlay.tsx (sin header/footer, fondo transparent)
       └─ Conecta a /api/obs-chat-stream?game=rdr2&token=<TOKEN>
            └─ Servidor valida token HMAC
                 └─ SSE loop → mensajes cada 1-2.8s → overlay los renderiza
```

---

## Plan de implementación por fases

### Fase 1 — Infraestructura (ruta y seguridad)

**1.1 — `src/pages/obs/chat.astro`**
- Layout limpio: sin `<Header>`, sin `<Footer>`, sin nav, sin scripts de Clerk
- `<body>` con `background: transparent`
- Lee query params: `game`, `platform`, `maxMessages`, `fontSize`, `token`
- Monta `<OBSChatOverlay client:only="react" {...props} />`

**1.2 — `src/pages/api/obs-chat-stream.ts`**
- Clon de `/api/chat-stream` sin verificación Clerk
- Acepta `?token=<TOKEN>` en la query string
- Valida el token con HMAC-SHA256 usando un secreto en `.env`
- Si el token es inválido → responde 401

**1.3 — Patch `src/middleware.ts`**
- Excluir `/obs/*` del header `X-Frame-Options: DENY`
- Excluir `/obs/*` y `/api/obs-*` de la middleware de autenticación Clerk

---

### Fase 2 — Componente OBS

**2.1 — `src/components/OBSChatOverlay.tsx`**

Props:
```typescript
interface OBSChatOverlayProps {
  game: string;
  platform: 'twitch' | 'kick';
  maxMessages?: number;       // default: 20
  fontSize?: 'sm' | 'md' | 'lg';
  showUsernames?: boolean;    // default: true
  showEmotes?: boolean;       // default: true
  direction?: 'bottom-up' | 'top-down'; // default: bottom-up
  token: string;
}
```

- Reutiliza `ChatMessage.tsx` existente sin modificarlo
- Conecta a `/api/obs-chat-stream` con los parámetros recibidos
- Aplica el tema Twitch/Kick via CSS custom properties (igual que en dashboard)

**2.2 — Estilos del overlay**
- `background: transparent` para que OBS capture el canal alpha
- `text-shadow` en los mensajes para legibilidad sobre gameplay
- Animación de entrada opcional (`slide-in-from-right`, desactivable)
- No depender de `global.css` — estilos scoped al componente via Tailwind

---

### Fase 3 — Generación de token y setup en el Dashboard

**3.1 — Sección "OBS Setup" en `StreamerDashboard.tsx`**
- Input para seleccionar juego, plataforma, max mensajes
- Botón "Generar enlace OBS"
- Muestra la URL completa lista para copiar (con botón de copia al clipboard)
- Botón "Regenerar token" para invalidar el anterior

**3.2 — Implementación del token (sin base de datos)**

Estrategia HMAC sin estado:
```
token = HMAC-SHA256(userId + ":" + gameSlug, OBS_TOKEN_SECRET)
```

- El servidor verifica recalculando el HMAC → no necesita almacenar nada
- El token es específico por usuario + juego → un token no sirve para otro juego
- Rotación: cambiar `OBS_TOKEN_SECRET` en Vercel env vars invalida todos los tokens

Nueva variable de entorno requerida:
```
OBS_TOKEN_SECRET=<random-32-char-string>
```

---

### Fase 4 — Pre-warming del caché AI

**4.1 — Al generar el enlace OBS**
- Disparar automáticamente una llamada a `/api/generate-phrases` para ese juego
- El caché queda caliente en esa instancia serverless
- Documentar al usuario que si el overlay tarda en mostrar mensajes al inicio, es por cold start

---

## Decisión pendiente: Persistencia del caché de frases

### Problema
El caché actual es un `Map` en memoria (`src/lib/phraseCache.ts`). En Vercel serverless,
cada instancia tiene su propio proceso — el caché no se comparte entre instancias y
se pierde en cada cold start. Esto significa que el overlay OBS puede recibir solo
frases estáticas (RDR2/BG3/Minecraft) si arranca en una instancia fría.

### Opciones evaluadas

| Opción | Pros | Contras | Estado |
|---|---|---|---|
| ~~Vercel KV~~ | Integración nativa | **Descontinuado** | Descartado |
| **Upstash Redis** | Serverless-first, free tier, SDK pequeño | Latencia de red en cada lookup | **Candidato principal** |
| **Neon (Postgres)** | Free tier, SQL familiar | Overhead para un simple cache de strings | Descartado para este caso |
| **Cloudflare KV** | Ultra-rápido, edge-native | Requiere migrar de Vercel a Cloudflare | Opción si se migra de plataforma |
| **Mantener en memoria + fallback estático** | Zero cambios | Comportamiento inconsistente en prod | Aceptable a corto plazo |

### Decisión
**Pendiente**. A corto plazo, el fallback estático es aceptable para el MVP del overlay.
Para producción real, evaluar **Upstash Redis** (compatible con Vercel, SDK mínimo,
free tier suficiente para este volumen).

---

## Consideraciones de seguridad

1. **Token en URL visible**: si el streamer comparte pantalla con OBS abierto, la URL del Browser Source es visible. Mitigaciones:
   - Permitir regenerar el token desde el dashboard con un clic
   - Documentar este riesgo al usuario

2. **Sin rate limiting en `/api/obs-chat-stream`**: cualquiera con el token puede abrir N conexiones SSE. Mitigación futura: limitar por token a X conexiones activas simultáneas.

3. **El token es para siempre** (hasta que se cambie el secreto). No hay expiración por diseño para no romper streams en curso. Esto es un trade-off aceptado.

---

## Archivos a crear / modificar

| Acción | Archivo |
|---|---|
| CREAR | `src/pages/obs/chat.astro` |
| CREAR | `src/pages/api/obs-chat-stream.ts` |
| CREAR | `src/components/OBSChatOverlay.tsx` |
| MODIFICAR | `src/middleware.ts` — excluir `/obs/*` de headers y auth |
| MODIFICAR | `src/components/StreamerDashboard.tsx` — sección OBS Setup |
| MODIFICAR | `.env` — añadir `OBS_TOKEN_SECRET` |

---

## Instrucciones para OBS (documentación de usuario)

1. Ir al Dashboard → sección **OBS Setup**
2. Seleccionar juego y plataforma
3. Hacer clic en **Generar enlace OBS**
4. En OBS: `+` → **Browser Source** → pegar la URL generada
5. Configurar dimensiones recomendadas: **400 × 600 px** (overlay lateral)
6. Marcar **"Shutdown source when not visible"** para ahorrar recursos

---

*Este documento es una referencia de planificación. Actualizar al implementar cada fase.*
