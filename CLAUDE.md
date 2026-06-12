# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Twick (chat-simulation-stream): simulador de chat de Twitch/Kick para streamers principiantes. La IA genera frases por videojuego una sola vez; luego un stream SSE las emite con aleatorización local. El código y los comentarios están en **español** — mantener ese idioma en comentarios y textos de UI.

## Commands

```bash
pnpm dev            # servidor de desarrollo en http://localhost:4321
pnpm build          # build de producción
pnpm preview        # preview del build
pnpm astro check    # type-check — único validador (no hay ESLint ni Prettier)
```

- **pnpm exclusivamente** (no npm/yarn). Los build scripts permitidos viven en `pnpm-workspace.yaml` (`allowBuilds`).
- No hay framework de tests JS/TS. Los E2E son scripts Python + Playwright en `testsprite_tests/`; requieren el dev server corriendo: `python testsprite_tests/TC001_....py`
- Antes de commitear: `pnpm astro check` con cero errores.

## Stack

Astro 6 (`output: 'server'`, adapter `@astrojs/node` standalone — deploy en Cubepath/Dokploy, **no** Vercel) · React 19 para componentes interactivos · Tailwind CSS 4 vía plugin de Vite (sin PostCSS) · Clerk para auth · Groq + Cerebras para IA · TypeScript estricto (`astro/tsconfigs/strict`).

Nota: `AGENTS.md` tiene guía adicional de estilo pero algunas partes están desactualizadas (menciona Astro 5 y Vercel).

## Architecture

### Flujo central (dos fases independientes)

1. **Generación batch con IA** (`POST /api/generate-phrases`): una sola llamada a la IA por juego. `serviceManager.ts` hace round-robin con failover Groq → Cerebras (Strategy pattern: cada servicio implementa `AIService` de `src/lib/ai/types.ts`). El JSON resultante (frases por categoría: gameplay/reactions/questions/emotes) se guarda en `phraseCache.ts` — un `Map` en RAM, máx. 4 juegos por usuario, se pierde al reiniciar.
2. **Stream en tiempo real** (`GET /api/chat-stream`, SSE): bucle de `setTimeout` que arma mensajes localmente sin IA — `chatGenerator.ts` elige categoría con pesos, frase aleatoria y username de una lista fija. Fallback en cascada: cache RAM → `messagePatterns.ts` (juegos hardcodeados) → frases genéricas.

`waveManager.ts` encola "oleadas" de reacciones (laugh/hype/fear/omg) disparadas vía `POST /api/chat-wave` que el stream SSE intercala.

### Auth: tres mecanismos coexistentes

`src/middleware.ts` ejecuta `sequence(rateLimitMiddleware, authMiddleware, securityHeaders)`:

- **Clerk** protege `/dashboard`, `/api/*` y `/dev/*`.
- **Tokens de overlay** (`overlayTokens.ts`): OBS Browser Source no tiene sesión de Clerk, así que `/overlay/*` y las rutas API con `?token=` saltan Clerk y validan un token temporal (24h, 1 por usuario) generado desde el dashboard vía la Astro Action `generateOverlayToken` (`src/actions/index.ts`).
- **Dev auth** (`devAuth.ts`): login local con cookie solo en `import.meta.env.DEV` (`/dev-login`), para probar sin Clerk.

### Otros puntos transversales

- **CSP dinámica** en `middleware.ts`: dominios de Clerk distintos en dev (`*.clerk.accounts.dev`) y prod (`*.clerk.com`, `*.twick.dev`); el overlay se excluye de `X-Frame-Options` para poder embeberse en OBS. Si se agrega un recurso externo nuevo, hay que añadirlo a la CSP.
- **Rate limiting** (`rateLimiter.ts`): ventana deslizante por IP para `/api/*` (lee `x-forwarded-for`, inyectada por Traefik) + registro de streams SSE activos por usuario.
- **Estado en RAM**: caches de frases, tokens de overlay y rate limits viven en memoria del proceso — sin Redis/DB.
- `src/utils/types.ts` es la única fuente de verdad para tipos compartidos.
- Frontend del dashboard: `StreamerDashboard.tsx` (estado global + `EventSource`) → `ChatWindow.tsx` (lista virtualizada con react-virtuoso, cap de 200 mensajes) → `ChatMessage.tsx` (memoizado; cache de emotes de SevenTV con TTL y deduplicación de requests).

## Conventions

- Comentarios en español; logs con prefijo de módulo: `[AI]`, `[API]`, `[SSE]`, `[Cache]`.
- Prohibido `any`/`unknown` sin justificación en comentario; `import type` para tipos; sin extensión `.ts` en imports relativos.
- Iconos de Tabler con importación explícita, nunca `import * as Icons`.
- Tailwind para todos los estilos (sin CSS modules ni `style={{}}` salvo variables CSS dinámicas); dark mode con clases `dark:` controlado por `class` en `<html>`.
- Páginas Astro siempre con `<Layout>`; páginas estáticas declaran `export const prerender = true`; API routes exportan `export const GET/POST: APIRoute`.
- Endpoints API: `try/catch` siempre, `Response` con `status` y `Content-Type` explícitos; errores con código adjunto (`(err as Error & { code: string }).code = 'INVALID_GAME'` → HTTP 422).
- Env vars (`GROQ_API_KEY`, `CEREBRAS_API_KEY`, `CLERK_SECRET_KEY`, `PUBLIC_CLERK_PUBLISHABLE_KEY`) solo vía `import.meta.env.*` en servidor; sin las keys de IA la app cae a frases hardcodeadas.
- No añadir dependencias salvo necesidad estricta.
