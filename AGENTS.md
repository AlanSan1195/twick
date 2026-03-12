# AGENTS.md — rocketchat (chat-simulation-stream)

Guía para agentes de codificación que operan en este repositorio.

---

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Astro v5, `output: server` (SSR completo) |
| UI | React 19 (componentes interactivos), Astro (páginas/layouts) |
| Estilos | Tailwind CSS v4 via Vite plugin — **sin PostCSS** |
| Auth | Clerk (`@clerk/astro`) |
| IA | Groq + Cerebras con failover round-robin (`src/lib/ai/serviceManager.ts`) |
| Deploy | Vercel con ISR (`@astrojs/vercel`); `/api/*`, `/dashboard`, `/dev/chat` excluidos de ISR |
| Lenguaje | TypeScript estricto (`extends astro/tsconfigs/strict`) |

---

## Comandos

```bash
pnpm dev            # servidor de desarrollo
pnpm build          # build de producción
pnpm preview        # preview del build
pnpm astro check    # type-check (único validador — no hay ESLint ni Prettier)
```

### Tests (E2E — Python + Playwright)

Los tests viven en `testsprite_tests/` y requieren el servidor corriendo en `localhost:4321`.

```bash
# Ejecutar un test individual
python testsprite_tests/TC001_Landing_page_theme_toggles_from_Twitch_to_Kick.py

# Levantar el servidor antes de correr tests
pnpm dev
```

No hay framework JS/TS de tests. No hay scripts de lint — usar `pnpm astro check`.

---

## Estructura del proyecto

```
src/
├── components/        # .astro y .tsx — un componente por archivo
├── layouts/           # Layout.astro — shell HTML completo con SEO/OG
├── lib/
│   ├── ai/            # serviceManager.ts, types.ts, services/groq.ts, services/cerebras.ts
│   ├── chatGenerator.ts   # generateMessage(), intervalos, pool de usernames
│   ├── messagePatterns.ts # Frases hardcoded de fallback por juego
│   ├── phraseCache.ts     # Cache en memoria: frases por juego + límite 4 juegos/usuario
│   ├── rateLimiter.ts     # Sliding-window IP + registro de streams SSE (1 por usuario)
│   └── waveManager.ts     # Cola de waves (laugh/hype/fear/omg)
├── middleware.ts      # sequence: rateLimitMiddleware → authMiddleware → CSP headers
├── pages/
│   ├── api/           # chat-stream.ts (SSE GET), generate-phrases.ts (POST/GET), chat-wave.ts (POST)
│   └── *.astro        # index, dashboard, sign-in, sign-up
├── styles/global.css  # @import tailwindcss + @theme tokens + @font-face
└── utils/types.ts     # Única fuente de verdad para tipos e interfaces compartidos
```

---

## TypeScript

- Modo **estricto** — `extends astro/tsconfigs/strict`; `jsx: react-jsx`, `jsxImportSource: react`
- Prohibido `any` e `unknown` sin justificación explícita en comentario
- Preferir inferencia; no anotar tipos redundantes
- `import type` para importaciones de solo tipos:
  ```ts
  import type { APIRoute } from 'astro'
  import type { ChatMessage } from '../../utils/types'
  ```
- Sin extensión `.ts` en importaciones relativas: `'../../lib/chatGenerator'`

---

## Estilo de código

### Imports

- ES modules exclusivamente (`"type": "module"` en package.json)
- Iconos de Tabler con importación explícita, **nunca desde barrels**:
  ```ts
  // Correcto
  import { IconMessageCircle, IconPlayerPlay } from '@tabler/icons-react'
  // Incorrecto — no usar
  import * as Icons from '@tabler/icons-react'
  ```

### Nomenclatura

| Entidad | Convención |
|---|---|
| Variables y funciones | `camelCase` |
| Tipos, interfaces, clases | `PascalCase` |
| Constantes de módulo | `UPPER_SNAKE_CASE` |
| Componentes React/Astro | `PascalCase` (default export) |
| API route exports | `export const GET: APIRoute`, `POST`, etc. |

### Comentarios

- Todos los comentarios en **español**
- Prefijos de módulo en logs: `[AI]`, `[API]`, `[SSE]`, `[Cache]`, etc.
- Separadores de sección: `// ============================================`
- JSDoc `/** ... */` para funciones utilitarias exportadas

---

## Manejo de errores

- `try/catch` en todos los endpoints API y llamadas a servicios IA
- Endpoints siempre devuelven `Response` con `status` y `Content-Type` explícitos:
  ```ts
  return new Response(JSON.stringify({ error: 'mensaje' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })
  ```
- Errores con código adjunto (patrón usado en AI service):
  ```ts
  const err = new Error('mensaje')
  ;(err as Error & { code: string }).code = 'INVALID_GAME'
  throw err
  ```
- `INVALID_GAME` / `INVALID_TOPIC` → HTTP 422 en `generate-phrases.ts`
- Failover IA: iterar array de servicios, capturar por servicio, relanzar último error si todos fallan
- Operaciones no críticas (wave triggers): `.catch(() => { /* Silenciar errores */ })`

---

## Componentes React

- **Solo componentes funcionales** con hooks (`useState`, `useEffect`, `useRef`)
- Props tipadas con interfaces inline en el mismo archivo:
  ```tsx
  interface Props {
    mode: StreamMode
    className?: string
  }
  ```
- Helpers pequeños (SVG inline, sub-renders) definidos en el mismo archivo, encima del export
- Tailwind para **todos** los estilos — sin CSS modules, sin `style={{}}` salvo variables CSS dinámicas
- Dark mode: clases `dark:` de Tailwind; tema controlado por `class` en `<html>`

---

## Componentes Astro

- Frontmatter (`---`) declara imports e interfaz `Props`; destructurar `Astro.props` con defaults
- Páginas estáticas: `export const prerender = true`
- Todas las páginas usan `<Layout>` — no escribir shell HTML manualmente
- API routes: `export const GET: APIRoute` / `POST` — sin default export

---

## Variables de entorno

Acceder vía `import.meta.env.*` solo en servidor. No exponer al cliente. No commitear `.env`.

| Variable | Uso |
|---|---|
| `GROQ_API_KEY` | Groq SDK |
| `CEREBRAS_API_KEY` | Cerebras SDK |
| `PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Clerk auth |

---

## Antes de commitear

1. `pnpm astro check` — cero errores de tipos
2. No incluir `.env` ni archivos con secretos
3. PRs pequeños y enfocados; título: `[rocketchat] Descripción clara y concisa`

---

## Restricciones

- Usar **pnpm** exclusivamente (no npm, no yarn)
- No añadir dependencias hasta que sean estrictamente necesarias
- Sin soluciones de estilos alternativas a Tailwind (sin CSS modules, styled-components, etc.)
- Sin `any` o `unknown` sin justificación
- Sin barrel imports de `@tabler/icons-react`
- Sin shell HTML manual en páginas — siempre `<Layout>`
- Variables de entorno sensibles solo en servidor, nunca expuestas al cliente
