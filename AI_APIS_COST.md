# Wrote AI_APIS.md
# Análisis de APIs de IA: Groq vs Cerebras
> Análisis técnico y económico de las APIs utilizadas en este proyecto para generación de comentarios de chat en tiempo real.
---
## Contexto del proyecto
**RocketChat** es un simulador de chat de stream (Twitch/YouTube) que usa IA para generar comentarios realistas. Cada vez que un usuario añade un juego o tema, se hace **una llamada a la API** para generar un batch de frases (hasta ~95 frases por llamada). Esas frases se cachean en memoria y se reutilizan durante toda la sesión.
### Flujo de uso de la API
```
Usuario añade juego/tema
        │
        ▼
POST /api/generate-phrases
        │
        ▼
serviceManager.chatWithAI()
   ├── intenta Groq (round-robin)
   └── fallover → Cerebras si Groq falla
        │
        ▼
Respuesta JSON: ~95 frases
        │
        ▼
phraseCache (in-memory, por userId)
Límite: 4 juegos/temas por usuario
        │
        ▼
GET /api/chat-stream (SSE)
Sirve frases del cache sin más llamadas a la API
```
**Conclusión clave:** la API solo se llama al añadir contenido nuevo, **no durante el stream**. La carga es muy predecible y baja.
---
## Groq
### Cómo funciona
Groq corre modelos de lenguaje sobre su propio hardware de inferencia (LPU — Language Processing Unit), diseñado específicamente para inferencia de transformers. La API es **compatible con la API de OpenAI**, lo que permite migrar con un simple cambio de `baseURL`.
**Endpoint base:** `https://api.groq.com/openai/v1`
**SDK:** `groq-sdk` (TypeScript/Python)
**Autenticación:** Bearer token (`GROQ_API_KEY`)
### Modelo usado en este proyecto
| Parámetro | Valor |
|---|---|
| Model ID | `openai/gpt-oss-120b` |
| Parámetros | 120B |
| Velocidad | ~500 tokens/s |
| Contexto | 131,072 tokens |
| Max completion | 65,536 tokens |
| `temperature` | 0.7 |
| `max_tokens` | 4,096 |
| `stream` | `true` |
### Coste por petición (modelo `openai/gpt-oss-120b`)
| Tipo | Precio |
|---|---|
| Input | $0.15 / 1M tokens |
| Output | $0.60 / 1M tokens |
**Estimación por llamada de `generate-phrases`:**
| Componente | Tokens aprox. | Coste |
|---|---|---|
| System prompt (game) | ~350 tokens | $0.000053 |
| User prompt | ~80 tokens | $0.000012 |
| Respuesta JSON (~95 frases) | ~1,200 tokens | $0.00072 |
| **Total por llamada** | **~1,630 tokens** | **~$0.00079** |
> Aproximadamente **$0.0008 por juego/tema añadido** (~0.08 centavos de dólar).
### Rate limits (plan gratuito)
| Límite | Valor |
|---|---|
| RPM | 30 req/min |
| RPD | 1,000 req/día |
| TPM | 8,000 tokens/min |
| TPD | 200,000 tokens/día |
### Rate limits (plan Developer — de pago)
| Límite | Valor |
|---|---|
| RPM | 1,000 req/min |
| TPM | 250,000 tokens/min |
| Contexto | 131,072 tokens |
### Características relevantes
- **Streaming nativo:** responde chunk a chunk via SSE
- **Compatible con OpenAI:** sin refactors para migrar
- **Prompt caching:** tokens cacheados **no cuentan** para rate limits
- **Headers de rate limit:** cada respuesta incluye `x-ratelimit-remaining-*` para monitoreo en tiempo real
- **Error en límite:** devuelve `429 Too Many Requests` con header `retry-after` en segundos
---
## Cerebras
### Cómo funciona
Cerebras usa el **Cerebras Wafer-Scale Engine (WSE)**, un chip de IA del tamaño de una oblea de silicio completa. Tiene la inferencia más rápida del mercado para modelos grandes. La API también es **compatible con OpenAI**.
**Endpoint base:** `https://api.cerebras.ai/v1`
**SDK:** `@cerebras/cerebras_cloud_sdk` (TypeScript/Python)
**Autenticación:** Bearer token (`CEREBRAS_API_KEY`)
### Modelo usado en este proyecto
| Parámetro | Valor |
|---|---|
| Model ID | `llama-3.3-70b` |
| Parámetros | 70B |
| Velocidad | ~2,000+ tokens/s |
| `temperature` | 0.7 |
| `max_completion_tokens` | 4,096 |
| `top_p` | 0.95 |
| `stream` | `true` |
> **Nota:** Cerebras también ofrece `gpt-oss-120b` (OpenAI GPT-OSS 120B) a ~3,000 tokens/s, el modelo más rápido del mercado a fecha de este análisis.
### Modelos de producción disponibles
| Modelo | ID | Velocidad |
|---|---|---|
| Llama 3.1 8B | `llama3.1-8b` | ~2,200 t/s |
| OpenAI GPT OSS 120B | `gpt-oss-120b` | ~3,000 t/s |
### Coste (Developer tier — autoservicio desde $10)
Cerebras no publica precios por token en su página de pricing pública de forma detallada para el plan Developer. El plan gratuito incluye:
- Acceso a todos los modelos
- Rate limits moderados
- Sin coste de inferencia (gratuito en free tier)
**Plan Developer:** pago por consumo desde $10, con rate limits 10x mayores y mayor prioridad de procesamiento.
**Referencia de valor:** El plan Cerebras Code Pro ($50/mes) incluye 24M tokens/día de uso, lo que implica un coste implícito de ~$2/1M tokens como referencia de valor en uso intensivo.
### Rate limits (free tier)
Cerebras no publica una tabla detallada de RPM/TPM para el free tier en su documentación pública. Sin embargo:
- Los modelos de producción tienen límites más altos que los preview
- Se aplicaron reducciones temporales a modelos de alta demanda (`zai-glm-4.7`, `qwen-3-235b`) por congestión
- Rate limit en respuesta `429` con `retry-after`
### Características relevantes
- **Velocidad excepcional:** 2,000–3,000 tokens/s vs ~500 t/s de Groq
- **Precisión sin comprometer:** todos los modelos en FP16 (sin pruning en producción)
- **Compatible con OpenAI:** mismo patrón de integración
- **Integración con Vercel AI Gateway:** relevante porque este proyecto despliega en Vercel
- **Disponible en AWS Marketplace y OpenRouter**
---
## Comparativa directa
| Aspecto | Groq | Cerebras |
|---|---|---|
| **Velocidad** | ~500 t/s | ~2,000–3,000 t/s |
| **Precios documentados** | Sí, públicos y detallados | Parcialmente (free tier sin coste explícito) |
| **Modelo 120B** | `openai/gpt-oss-120b` | `gpt-oss-120b` |
| **Modelo 70B** | `llama-3.3-70b-versatile` | `llama3.1-8b` (8B en producción) |
| **Free tier** | Sí (30 RPM, 1K RPD) | Sí (sin coste, límites moderados) |
| **SDK TypeScript** | `groq-sdk` | `@cerebras/cerebras_cloud_sdk` |
| **Compatibilidad OpenAI** | Total | Total |
| **Streaming** | Sí | Sí |
| **Hardware propio** | LPU (chip dedicado) | WSE (wafer-scale chip) |
| **Despliegue en Vercel** | Sí | Sí (AI Gateway nativo) |
---
## Estimación de costes por volumen de usuarios
Las siguientes estimaciones usan el coste de Groq (`openai/gpt-oss-120b`) como referencia porque tiene precios públicos verificables.
**Supuesto base:**
- 1 llamada al añadir un juego/tema
- Promedio de 2 juegos por usuario por sesión
- Límite máximo: 4 juegos/usuario
| Escenario | Usuarios activos/mes | Llamadas API/mes | Coste estimado/mes |
|---|---|---|---|
| Early adopter | 100 | 200 | **~$0.16** |
| Pequeño | 1,000 | 2,000 | **~$1.58** |
| Mediano | 10,000 | 20,000 | **~$15.80** |
| Grande | 100,000 | 200,000 | **~$158.00** |
| Escala | 1,000,000 | 2,000,000 | **~$1,580.00** |
> Cálculo: 2,000 llamadas × 1,630 tokens/llamada = 3.26M tokens/mes.  
> Input: 0.43M × $0.15/1M = $0.065 | Output: 2.4M × $0.60/1M = $1.44 | **Total ≈ $1.51/1K usuarios/mes**
### Escenario con plan gratuito (Groq free)
Con 1,000 req/día × 30 días = **30,000 llamadas/mes gratis**.  
Esto cubre hasta ~**15,000 usuarios activos/mes** sin coste alguno en Groq free tier.
---
## Decisiones de arquitectura en este proyecto
### Por qué round-robin + failover
```typescript
// src/lib/ai/serviceManager.ts
const services: AIService[] = [groqService, cerebrasService];
let currentServiceIndex = 0;
function getNextService(): AIService {
  const service = services[currentServiceIndex];
  currentServiceIndex = (currentServiceIndex + 1) % services.length;
  return service;
}
```
1. **Distribución de carga:** reparte las llamadas entre ambos proveedores
2. **Disponibilidad:** si uno falla (rate limit, outage), el otro toma el relevo automáticamente
3. **Coste optimizado:** el free tier de cada proveedor se consume a la mitad de velocidad
4. **Sin vendor lock-in:** cambiar o añadir un proveedor es trivial (implementar `AIService`)
### Por qué caché en memoria
El cache evita llamadas repetidas para el mismo juego/tema. Con 4 slots por usuario:
- **Sin cache:** N llamadas por N veces que se inicia el stream
- **Con cache:** 1 llamada por juego/tema, para siempre (hasta reiniciar el servidor)
En producción (Vercel serverless) el cache es por instancia. Si escala a múltiples instancias, considerar migrar a Redis/KV para persistencia compartida.
---
## Recomendaciones
1. **Mantener el failover actual** — el coste es mínimo y la resiliencia es alta.
2. **Migrar el cache a Vercel KV** si el tráfico crece y aparecen inconsistencias entre instancias serverless.
3. **Monitorear headers de rate limit** (`x-ratelimit-remaining-*`) para detectar presión antes de llegar al 429.
4. **Evaluar `openai/gpt-oss-120b` en Cerebras** como alternativa al modelo actual `llama-3.3-70b` para obtener más velocidad al mismo precio (Cerebras es más rápido con el mismo modelo).
5. **Prompt caching de Groq:** el system prompt es idéntico en todas las llamadas — activar prompt caching reduciría el coste un ~20% en input tokens.

---

## Saludos Iniciales (Initial Greetings)

### Contexto

Para mayor realismo al iniciar un chat stream, el sistema envía 20-25 mensajes de bienvenida antes del loop normal de mensajes. Esto simula la escena clásica de un stream donde los viewers saludan al streamer cuando empieza.

### Implementación

```typescript
// src/lib/ai/serviceManager.ts
export async function generateGreetings(gameName: string, mode: 'game' | 'justchatting'): Promise<{
  greetings: string[];
  initialReactions: string[];
}>
```

**Trigger:** Se llama cada vez que un usuario añade un juego/tema nuevo (misma llamada que `generateGamePhrases`/`generateChatTopicPhrases`).

**Prompt IA:** Genera 60 saludos + 60 reacciones iniciales con contexto del juego/modo.

**Almacenamiento:** Se guardan en el cache (`phraseCache`) junto con las frases del juego.

### Fallback predefinido

Si el juego ya existe en cache (o la IA falla), se usan frases predefinidas en `chatGenerator.ts`:

```typescript
const FALLBACK_PHRASES = {
  greetings: [
    'Hola holaaa!!',
    'yujuuu ya vamos a empezar',
    'Una semana sin conectarte, excelente qué emoción, cómo estás?',
    'Ahora sí vamos a jugar y a reir',
    'Holaaaaaa',
    'Hellow a todos',
    'Por finuuu',
    'Buenas buenas',
    'Wenas wenas',
    'Ya estaba echando de menos el stream',
    // ... 50 frases
  ],
  initialReactions: [
    'letsgoo',
    'emocionado',
    'por fin',
    'ya Era Hora',
    'ansiioso',
    'aqui estoy',
    // ... 40 reacciones
  ],
}
```

### Flujo en SSE stream

```typescript
// src/pages/api/chat-stream.ts
const initialGreetings = generateInitialGreetings(gameName);
for (const greeting of initialGreetings) {
  controller.enqueue(encoder.encode(data));
  await new Promise(resolve => setTimeout(resolve, getRandomInterval(200, 500)));
}
// Después: continúa el loop normal de mensajes
```

### Coste adicional por llamada

| Componente | Tokens aprox. | Coste |
|---|---|---|
| System prompt | ~200 tokens | $0.00003 |
| User prompt (gameName + mode) | ~50 tokens | $0.000008 |
| Respuesta JSON (~120 frases) | ~800 tokens | $0.00048 |
| **Total por llamada** | **~1,050 tokens** | **~$0.0005** |

> Coste estimado: **$0.0005** por juego/tema añadido (menos de 0.05 centavos).

### Impacto en estimación de costes

La llamada de saludos se hace en la misma petición que `generateGamePhrases`/`generateChatTopicPhrases`, por lo que el coste ya está incluido en la estimación original (~1,630 tokens vs ~1,050 tokens adicionales). El overhead es mínimo.

---

*Análisis generado el 25 de febrero de 2026. Los precios y rate limits pueden cambiar. Verificar siempre la documentación oficial de [Groq](https://console.groq.com/docs/models) y [Cerebras](https://inference-docs.cerebras.ai/models/overview).*