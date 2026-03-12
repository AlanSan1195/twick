# Chat Simulation Stream

![Chat Simulation Stream](public/desktop-hero-dark.png)

Plataforma web para streamers principiantes que simula una audiencia interactiva en tiempo real. Genera mensajes de chat contextualizados por videojuego usando IA y los transmite al cliente via SSE.

## Stack Tecnologico

| Categoria      | Tecnologia                     |
|----------------|--------------------------------|
| Framework      | Astro 5 (SSR)                  |
| Despliegue     | Vercel (`@astrojs/vercel`)     |
| UI             | React 19 + Tailwind CSS 4      |
| Virtualizacion | react-virtuoso 4               |
| Emotes         | SevenTV API (emote set global) |
| Autenticacion  | Clerk                          |
| IA Primario    | Groq SDK                       |
| IA Fallback    | Cerebras Cloud SDK             |
| Lenguaje       | TypeScript                     |
| Package Manager| pnpm                           |

## Configuracion

1. Crea un archivo `.env` en la raiz del proyecto:

```env
# Obligatorias - Clerk Auth
PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx

# Opcionales - IA (sin estas, se usan frases hardcodeadas)
GROQ_API_KEY=xxx
CEREBRAS_API_KEY=xxx
```

> Ver [SETUP.md](./SETUP.md) para instrucciones detalladas sobre como obtener las keys de Clerk.

2. Instala dependencias y ejecuta:

```bash
pnpm install
pnpm dev        # http://localhost:4321
pnpm build      # Build de produccion
pnpm preview    # Preview local del build
```

## Estructura del Proyecto

```
src/
├── components/
│   ├── StreamerDashboard.tsx  # Estado global, conexion SSE
│   ├── ChatWindow.tsx         # Lista virtualizada con Virtuoso
│   ├── ChatMessage.tsx        # Mensaje individual (memoizado)
│   └── GameInput.tsx          # Input de busqueda de juegos
├── lib/
│   ├── ai/
│   │   ├── serviceManager.ts  # Orquestador con failover
│   │   ├── types.ts           # Interfaz AIService
│   │   └── services/
│   │       ├── groq.ts        # Servicio Groq
│   │       └── cerebras.ts    # Servicio Cerebras
│   ├── chatGenerator.ts       # Generador de mensajes
│   ├── messagePatterns.ts     # Frases hardcodeadas por juego
│   └── phraseCache.ts         # Cache en memoria + limite por usuario
├── pages/
│   ├── api/
│   │   ├── chat-stream.ts      # Endpoint SSE
│   │   └── generate-phrases.ts # Generacion con IA
│   ├── dashboard.astro
│   └── index.astro
└── middleware.ts               # Auth + headers de seguridad
```

## Endpoints

| Endpoint                  | Metodo | Descripcion                        |
|---------------------------|--------|------------------------------------|
| `/api/chat-stream?game=X` | GET    | Stream SSE de mensajes de chat     |
| `/api/generate-phrases`   | POST   | Genera frases con IA para un juego |
| `/api/generate-phrases`   | GET    | Obtiene juegos del usuario y slots |

## Rutas

| Ruta         | Protegida | Descripcion        |
|--------------|-----------|--------------------|
| `/`          | No        | Landing page       |
| `/sign-in`   | No        | Login con Clerk    |
| `/sign-up`   | No        | Registro con Clerk |
| `/dashboard` | Si        | Panel del streamer |

---

# Casos de Estudio

Patrones y tecnicas implementadas en el proyecto, documentados para aprendizaje.

---

## Caso 1: SSE para Streaming en Tiempo Real

**Archivo:** `src/pages/api/chat-stream.ts`

### Problema
Enviar mensajes al cliente cada pocos segundos sin que el cliente haga polling constante (peticion repetida cada N segundos).

### Por que SSE y no WebSockets?

| | SSE | WebSocket |
|---|---|---|
| Direccion | Servidor → cliente (unidireccional) | Bidireccional |
| Complejidad | Baja, HTTP nativo | Mayor, protocolo propio |
| Reconexion | Automatica | Manual |
| Cuando usarlo | El servidor envia datos, el cliente solo escucha | Chat real, juegos en tiempo real |

En este proyecto el cliente nunca necesita enviar datos al servidor durante el stream, por eso SSE es suficiente y mas simple.

### Implementacion en el servidor

```typescript
// src/pages/api/chat-stream.ts
export const GET: APIRoute = async ({ request, url }) => {
  const gameName = url.searchParams.get('game');

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendMessage = () => {
        const message = generateMessage(gameName);
        // El formato SSE requiere exactamente: "data: <contenido>\n\n"
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
      };

      // setTimeout recursivo para intervalos variables (1-2.8s)
      const scheduleNext = () => setTimeout(() => {
        sendMessage();
        timeoutId = scheduleNext();
      }, getRandomInterval(1000, 2800));

      let timeoutId = scheduleNext();

      // AbortSignal: se dispara cuando el cliente cierra la pestaña o llama eventSource.close()
      request.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
};
```

**Conceptos clave:**
- `ReadableStream`: API nativa para crear streams de datos. El `controller` permite empujar datos (`enqueue`) o cerrar el stream (`close`).
- `TextEncoder`: convierte strings a `Uint8Array` porque los streams trabajan con bytes, no strings.
- Formato SSE: cada mensaje debe terminar con `\n\n`. Sin eso, el cliente no sabe donde termina un mensaje.
- `AbortSignal`: evita memory leaks — si el cliente se va, el servidor limpia el timeout.

### Consumo en el cliente

```typescript
// src/components/StreamerDashboard.tsx
const eventSource = new EventSource(`/api/chat-stream?game=${encodeURIComponent(selectedGame)}`);

eventSource.onmessage = (event) => {
  const newMessage = JSON.parse(event.data);
  setMessages((prev) => {
    const next = [...prev, newMessage];
    // Cap de 200 mensajes para limitar memoria (ver Caso 4)
    return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
  });
};

// Limpiar al desmontar o detener
eventSource.close();
```

---

## Caso 2: Pattern Strategy + Failover para Servicios de IA

**Archivos:** `src/lib/ai/types.ts`, `src/lib/ai/serviceManager.ts`, `src/lib/ai/services/*.ts`

### Problema
Usar multiples proveedores de IA (Groq, Cerebras) sin acoplar el codigo consumidor a ninguno en concreto. Si uno falla, cambiar al siguiente automaticamente.

### Interfaz comun (Strategy Pattern)

```typescript
// src/lib/ai/types.ts
export interface AIService {
  name: string;
  chat: (messages: AIServiceMessage[]) => Promise<AsyncGenerator<string>>;
}
```

Cada servicio implementa la misma interfaz. El codigo que los consume no sabe ni le importa cual esta usando:

```typescript
// src/lib/ai/services/groq.ts
export const groqService: AIService = {
  name: 'Groq',
  async chat(messages) {
    const completion = await groq.chat.completions.create({
      messages, model: 'llama-3.3-70b-versatile', stream: true
    });

    // Async generator: yield chunk a chunk del stream
    async function* generateStream() {
      for await (const chunk of completion) {
        yield chunk.choices[0]?.delta?.content || '';
      }
    }

    return generateStream();
  }
};
```

### Failover automatico

```typescript
// src/lib/ai/serviceManager.ts
const services: AIService[] = [groqService, cerebrasService];
let currentIndex = 0;

export async function chatWithAI(messages: AIServiceMessage[]): Promise<string> {
  let lastError: Error | null = null;

  for (let i = 0; i < services.length; i++) {
    const service = services[currentIndex % services.length];
    currentIndex++;

    try {
      const stream = await service.chat(messages);
      let result = '';
      for await (const chunk of stream) result += chunk;
      return result;
    } catch (error) {
      lastError = error as Error;
      // Fallo: el bucle continua con el siguiente servicio
    }
  }

  throw lastError ?? new Error('Todos los servicios de IA fallaron');
}
```

**Conceptos clave:**
- **Strategy Pattern**: define una familia de algoritmos intercambiables detras de una interfaz comun. Agregar un nuevo proveedor = crear un archivo que implemente `AIService` y añadirlo al array.
- **Round-robin**: `currentIndex % services.length` distribuye carga entre servicios.
- **Async generators** (`async function*` + `yield`): permiten iterar sobre el stream de tokens sin cargar todo en memoria.

---

## Caso 3: Singleton Lazy para Clientes de API

**Archivo:** `src/lib/ai/services/groq.ts`

### Problema
Crear el cliente Groq en cada request seria ineficiente y no validaria la API key hasta tarde.

### Solucion

```typescript
let groqInstance: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqInstance) {
    const apiKey = import.meta.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY no esta configurada');
    groqInstance = new Groq({ apiKey });
  }
  return groqInstance;
}
```

**Por que funciona:** la primera vez que se llama, crea la instancia y la guarda. Las siguientes veces, devuelve la misma. Si falta la API key, falla en el primer request (no en el arranque del servidor), lo cual es el momento correcto para un error de configuracion.

---

## Caso 4: Cache en Memoria + Limite por Usuario

**Archivo:** `src/lib/phraseCache.ts`

### Problema
Llamar a la IA cada vez que alguien usa el mismo juego es lento y costoso. Ademas, hay que limitar cuantos juegos puede generar cada usuario.

### Dos Maps independientes

```typescript
const phrasesCache = new Map<string, CachedGame>();   // juego -> frases generadas
const userGamesCache = new Map<string, UserGames>();   // userId -> lista de juegos

// Normalizacion: "Minecraft ", "MINECRAFT" y "minecraft" son el mismo juego
function normalizeGameName(name: string): string {
  return name.toLowerCase().trim();
}
```

Por que `Map` y no un objeto `{}`? `Map` esta optimizado para inserciones y lecturas frecuentes con claves dinamicas, tiene metodos propios (`get`, `set`, `has`) y no mezcla claves de datos con propiedades del prototipo.

### Limite por usuario

```typescript
const MAX_GAMES_PER_USER = 4;

export function addGameToUser(userId: string, gameName: string): boolean {
  const key = normalizeGameName(gameName);
  const entry = userGamesCache.get(userId);

  if (entry) {
    if (entry.games.includes(key)) return true;          // ya lo tiene, no cuenta
    if (entry.games.length >= MAX_GAMES_PER_USER) return false; // limite alcanzado
    entry.games.push(key);
  } else {
    userGamesCache.set(userId, { games: [key], createdAt: Date.now() });
  }

  return true;
}
```

**Nota:** esta cache vive en memoria del servidor. Se pierde al reiniciar. Para este caso de uso es aceptable; en produccion real usarías Redis o una base de datos.

---

## Caso 5: Seleccion Aleatoria Ponderada

**Archivo:** `src/lib/chatGenerator.ts`

### Problema
Los mensajes de gameplay deben aparecer mas seguido (40%) que los emotes (10%). `Math.random()` puro da probabilidades iguales.

### Solucion: pesos con suma acumulada

```typescript
function getRandomCategory(): MessageCategory {
  const categories = ['gameplay', 'reactions', 'questions', 'emotes'];
  const weights =    [0.4,        0.3,         0.2,          0.1    ];

  const random = Math.random(); // numero entre 0 y 1
  let sum = 0;

  for (let i = 0; i < categories.length; i++) {
    sum += weights[i];
    if (random < sum) return categories[i];
  }

  return 'gameplay'; // fallback (no deberia llegar aqui si los pesos suman 1)
}
```

**Como funciona con un ejemplo:**

```
random = 0.35
  sum += 0.4  → sum = 0.4  → 0.35 < 0.4? ✓ → devuelve 'gameplay'

random = 0.65
  sum += 0.4  → sum = 0.4  → 0.65 < 0.4? ✗
  sum += 0.3  → sum = 0.7  → 0.65 < 0.7? ✓ → devuelve 'reactions'
```

El truco: cada categoria "ocupa" un rango del espacio 0-1 proporcional a su peso. La suma acumulada define donde termina cada rango.

---

## Caso 6: Emotes de SevenTV con Cache y Control de Concurrencia

**Archivo:** `src/components/ChatMessage.tsx`

### Problema
Cada mensaje puede querer mostrar un emote aleatorio. Si 50 mensajes se montan a la vez y cada uno hace `fetch` a SevenTV, se disparan 50 requests identicas.

### Cache con TTL y deduplicacion de requests

```typescript
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
let cachedEmotes: SevenTvEmote[] | null = null;
let cacheTimestamp = 0;
let requestInFlight: Promise<SevenTvEmote[]> | null = null;

async function getGlobalEmotes(): Promise<SevenTvEmote[]> {
  // 1. Si la cache es valida, devolverla directamente
  if (cachedEmotes && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedEmotes;
  }

  // 2. Si ya hay una peticion en vuelo, reutilizarla (no lanzar otra)
  if (requestInFlight) return requestInFlight;

  // 3. Lanzar la peticion y guardar la promesa
  requestInFlight = fetch('https://7tv.io/v3/emote-sets/global')
    .then(res => res.json())
    .then(data => {
      cachedEmotes = data.emotes ?? [];
      cacheTimestamp = Date.now();
      return cachedEmotes!;
    })
    .finally(() => { requestInFlight = null; });

  return requestInFlight;
}
```

**Por que guardar la promesa y no solo un flag?** Porque si 10 componentes llaman a `getGlobalEmotes()` al mismo tiempo y el fetch tarda 300ms, todos reciben la misma promesa y esperan al mismo resultado. Cuando resuelve, los 10 obtienen los datos con un solo request.

### Ubicacion aleatoria del emote

```typescript
// 25% inicio del mensaje, 25% final, 50% sin emote
function obtenerUbicacionEmote(): 'start' | 'end' | null {
  const r = Math.random();
  if (r < 0.25) return 'start';
  if (r < 0.50) return 'end';
  return null;
}
```

---

## Caso 7: Virtualizacion de Lista con react-virtuoso

**Archivos:** `src/components/ChatWindow.tsx`, `src/components/ChatMessage.tsx`, `src/components/StreamerDashboard.tsx`

### Problema

Sin limites, tras 10 minutos de stream hay ~300 mensajes todos montados en el DOM. Esto provoca:

1. **DOM inflado**: el navegador calcula layout para 300 nodos aunque solo sean visibles ~15.
2. **Re-renders en cascada**: cada mensaje nuevo hace que React re-evalúe todos los anteriores.
3. **Memoria sin techo**: el array de estado crece indefinidamente.

### Tres cambios coordinados

**1. Cap de mensajes** — `StreamerDashboard.tsx`

```typescript
const MAX_MESSAGES = 200;

setMessages((prev) => {
  const next = [...prev, newMessage];
  return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
});
```

`slice(-200)` devuelve siempre los ultimos 200 elementos. El estado nunca supera ese limite en memoria.

**2. `React.memo` con comparador custom** — `ChatMessage.tsx`

```typescript
const ChatMessage = memo(ChatMessageComponent, (prev, next) => {
  // true = props iguales = no renderizar
  // false = props cambiaron = renderizar
  return (
    prev.message.id === next.message.id &&
    prev.isAlternate === next.isAlternate &&
    prev.startTime === next.startTime
  );
});
```

`React.memo` envuelve el componente y antes de renderizarlo compara las props con el comparador. Como `message.id` es inmutable y `startTime` nunca cambia, un mensaje ya montado no vuelve a renderizarse nunca.

Sin `memo`, cada vez que llega un mensaje nuevo y `StreamerDashboard` actualiza su estado, React re-renderiza todos los `ChatMessage` aunque sus props no hayan cambiado.

**3. Virtuoso en lugar de `.map()`** — `ChatWindow.tsx`

```tsx
// ANTES: 300 nodos en el DOM
{messages.map((msg, i) => <ChatMessage key={msg.id} message={msg} isAlternate={i % 2 === 1} />)}

// AHORA: solo ~15 nodos visibles en el DOM
<Virtuoso
  style={{ height: '100%' }}
  data={messages}
  itemContent={itemContent}   // funcion que renderiza un item dado su indice y dato
  followOutput="smooth"       // auto-scroll inteligente
  increaseViewportBy={200}    // pre-renderiza 200px extra para evitar flashes
/>
```

Virtuoso mide el contenedor, calcula que indices son visibles segun el scroll, y solo monta esos nodos. Los demas existen como datos en el array pero no tienen representacion en el DOM.

```tsx
// useCallback evita que Virtuoso piense que la funcion cambio en cada render
const itemContent = useCallback(
  (index: number, message: ChatMessageType) => (
    <ChatMessage message={message} startTime={startTime} isAlternate={index % 2 === 1} />
  ),
  [startTime],
);
```

### `followOutput` vs `scrollIntoView`

```typescript
// ANTES: se disparaba en CADA mensaje, siempre tiraba al fondo
useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages]);
```

Con `followOutput="smooth"` el comportamiento es inteligente:
- El usuario **esta al fondo** → Virtuoso sigue scrolleando con cada nuevo mensaje.
- El usuario **scrolleo hacia arriba** → los mensajes siguen llegando pero no lo mueven.
- El usuario **vuelve al fondo** → el auto-scroll se reactiva solo.

### Resultado

| Metrica                      | Antes           | Despues                 |
|------------------------------|-----------------|-------------------------|
| Nodos DOM tras 10 min        | ~300            | ~15-20 (solo visibles)  |
| Re-renders por mensaje nuevo | Todos           | Solo el nuevo           |
| Memoria del array            | Sin limite      | Max 200 items           |
| Auto-scroll                  | Siempre forzado | Respeta scroll manual   |

---

## Caso 8: Middleware de Autenticacion y Headers de Seguridad

**Archivo:** `src/middleware.ts`

### Proteccion de rutas con Clerk

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server';

const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/api/(.*)']);

const authMiddleware = clerkMiddleware((auth, context) => {
  const { userId, redirectToSignIn } = auth();
  if (!userId && isProtectedRoute(context.request)) {
    return redirectToSignIn();
  }
});
```

`createRouteMatcher` compila los patrones glob una sola vez. `clerkMiddleware` inyecta `auth()` en cada request antes de que llegue a la pagina.

### CSP dinamica segun entorno

Clerk usa dominios distintos en desarrollo (`*.clerk.accounts.dev`) y produccion (`*.clerk.com`). Si se pone una CSP estatica, uno de los dos entornos deja de funcionar.

```typescript
const securityHeaders = defineMiddleware(async (context, next) => {
  const response = await next(); // procesar la ruta primero
  const isDev = import.meta.env.DEV;

  const clerkDomains = isDev
    ? { script: 'https://*.clerk.accounts.dev', img: 'https://*.clerk.accounts.dev', ... }
    : { script: 'https://*.clerk.com https://clerk.twick.dev', ... };

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${clerkDomains.script}`,
    `img-src 'self' data: blob: https://cdn.7tv.app ${clerkDomains.img}`,
    `connect-src 'self' https://7tv.io ${clerkDomains.connect}`,
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
});

// sequence() ejecuta middlewares en orden: primero auth, luego headers
export const onRequest = sequence(authMiddleware, securityHeaders);
```

**Conceptos clave:**
- `sequence()`: combina middlewares en cadena. El orden importa: la autenticacion debe ir antes que cualquier logica de negocio.
- Los headers se añaden **despues** de `await next()` porque necesitan la respuesta ya construida para modificarla.
- `img-src` debe incluir `https://cdn.7tv.app` para que los emotes de SevenTV se carguen sin ser bloqueados.

---

## Caso 9: Limpieza de Recursos con useEffect

**Archivo:** `src/components/StreamerDashboard.tsx`

### Problema
Si el usuario navega fuera del dashboard sin detener el chat, la conexion SSE queda abierta indefinidamente, consumiendo recursos en el servidor.

### Solucion: `useRef` + cleanup en `useEffect`

```typescript
const eventSourceRef = useRef<EventSource | null>(null);

// Al iniciar: guardar referencia
const handleStartChat = () => {
  const es = new EventSource(`/api/chat-stream?game=...`);
  eventSourceRef.current = es;
};

// Al detener: cerrar y limpiar
const handleStopChat = () => {
  eventSourceRef.current?.close();
  eventSourceRef.current = null;
};

// Garantia: si el componente se desmonta sin que el usuario haya parado el chat
useEffect(() => {
  return () => { eventSourceRef.current?.close(); };
}, []);
```

**Por que `useRef` y no `useState`?**

`useState` dispara un re-render cada vez que cambia. `useRef` guarda el valor sin re-renderizar. La referencia al `EventSource` es un efecto secundario (no afecta a la UI directamente), por eso `useRef` es la herramienta correcta.

---

## Problemas Encontrados en Produccion

### Clerk no funcionaba con dominio personalizado (CSP)

Despues de desplegar en Vercel con `twick.dev`, los componentes de autenticacion dejaban de cargar. Los errores en DevTools apuntaban a CSP bloqueando scripts e imagenes de Clerk.

**Causa raiz:** en desarrollo Clerk usa `*.clerk.accounts.dev`, pero con dominio personalizado en produccion cambia a `*.clerk.com` y al subdominio de Clerk propio del proyecto (`clerk.twick.dev`). La CSP no incluia esos dominios.

**Solucion:** CSP dinamica segun `import.meta.env.DEV` (ver Caso 8).

**Configuracion adicional necesaria:**
- Registros DNS en el proveedor de dominio: `A`, `AAAA` y `CNAME` apuntando a Vercel.
- Entorno de produccion separado en el dashboard de Clerk para obtener keys de produccion (distintas a las de desarrollo).
- En cada proveedor OAuth (Google, GitHub): agregar el dominio personalizado en las URLs de redireccion autorizadas y copiar el `clientId` y `secret` en Clerk.

---

## Flujo de Generacion de Mensajes

Esta es la parte central de la app. El proceso tiene dos fases completamente separadas.

### Fase 1 — Generacion de frases con IA (ocurre una sola vez por juego)

Cuando el usuario escribe un nombre de juego y hace submit:

1. El frontend hace `POST /api/generate-phrases` con el nombre del juego
2. El servidor comprueba si las frases ya estan en cache (RAM). Si estan, responde directamente sin llamar a la IA
3. Si no estan en cache, llama a la IA **una sola vez**:
   - Intenta primero con **Groq** (`openai/gpt-oss-120b`)
   - Si falla, usa **Cerebras** (`llama-3.3-70b`) como fallback
4. El prompt instruye a la IA para que devuelva un JSON con frases categorizadas:
   ```json
   {
     "gameplay":  [...hasta 50 frases sobre el juego],
     "reactions": [...hasta 15 reacciones emocionales],
     "questions": [...hasta 30 preguntas al streamer],
     "emotes":    [...hasta 20 expresiones cortas]
   }
   ```
   Para el modo Just Chatting, la categoria `gameplay` se reemplaza por `comments` (hasta 50 frases).
5. Las frases generadas se guardan en un `Map` en RAM del servidor, indexadas por nombre de juego normalizado
6. **La IA no vuelve a ser llamada** para ese juego mientras el servidor no se reinicie

### Fase 2 — Stream de mensajes en tiempo real (sin IA, pura randomizacion local)

Cuando el usuario pulsa Play:

1. El frontend abre una conexion `EventSource` a `/api/chat-stream?game=...&min=2000&max=4000`
2. El servidor entra en un bucle de `setTimeout` con delay aleatorio entre `min` y `max` ms
3. En cada tick, `generateMessage()` construye un mensaje **localmente** (sin red, sin IA):
   - Busca las frases del juego en el `Map` de RAM
   - Elige categoria con pesos (gameplay 50%, questions 30%, reactions 20% en modo juego)
   - Elige una frase aleatoria de esa categoria
   - Elige un username de una lista fija de 20 nombres
   - Genera un `id` unico con `crypto.randomUUID()`
4. El mensaje se envia como evento SSE: `data: {"id":"...","username":"...","content":"..."}\n\n`
5. El frontend lo recibe, lo agrega al array (maximo 200 mensajes), y Virtuoso lo renderiza

### Tres capas de fallback para las frases

Si las frases de un juego no estan disponibles, el generador cae en cascada:

```
1. Cache en RAM (frases generadas por IA para ese juego)
       ↓ si no existe
2. MESSAGE_PATTERNS hardcodeados (rdr2, bg3, minecraft)
       ↓ si no existe
3. FALLBACK_PHRASES genericas (frases validas para cualquier contexto)
```

### Diagrama completo

```
[Usuario escribe juego]
        ↓
POST /api/generate-phrases
        ↓
  ¿En cache? ──── SI ──────────────────────────┐
        ↓ NO                                   │
  chatWithAI()                                 │
    Groq (openai/gpt-oss-120b)                 │
    └─ falla → Cerebras (llama-3.3-70b)        │
        ↓                                      │
  JSON: { gameplay[], reactions[], ... }       │
        ↓                                      │
  setCachedPhrases() → Map en RAM ─────────────┘
        ↓
[Usuario pulsa Play]
        ↓
new EventSource('/api/chat-stream?game=...&min=2000&max=4000')
        ↓
  Loop setTimeout (delay aleatorio entre min y max ms)
    → getPhrasesForGame()  → busca en Map de RAM
    → getRandomCategory()  → pesos por modo (game / justchatting)
    → getRandomElement()   → frase aleatoria de la categoria
    → username de lista fija (20 opciones)
    → crypto.randomUUID()  → id del mensaje
        ↓
  SSE: data: { id, username, content, timestamp, category }
        ↓
eventSource.onmessage → setMessages([...prev, msg].slice(-200))
        ↓
<Virtuoso> renderiza solo los ~15 items visibles en el viewport
```

### Puntos clave

- **La IA genera en batch, no en tiempo real.** Las frases existen antes de que empiece el stream
- **El stream es pura logica local.** Cada mensaje tarda microsegundos en generarse
- **La cache es solo en memoria.** Si el servidor se reinicia, las frases de juegos personalizados desaparecen y el stream cae al fallback generico
- **Limite por usuario:** cada usuario puede tener activos un maximo de 4 juegos con frases generadas por IA (`MAX_GAMES_PER_USER = 4` en `phraseCache.ts`)

---

## Personalizacion

### Agregar un juego hardcodeado
1. Añade frases en `src/lib/messagePatterns.ts`
2. Mapea el nombre en `hardcodedMapping` dentro de `src/lib/phraseCache.ts`

### Ajustar frecuencia de mensajes
```typescript
// src/pages/api/chat-stream.ts
getRandomInterval(1000, 2800) // min y max en milisegundos
```

### Cambiar el limite de juegos por usuario
```typescript
// src/lib/phraseCache.ts
const MAX_GAMES_PER_USER = 4;
```

---

## Agradecimientos

Gracias a la herramienta de [@midu](https://github.com/midudev) para acceso a modelos de IA con capa gratuita.

---

## Licencia

MIT — Puedes usar, modificar y distribuir este codigo libremente.
